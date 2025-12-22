import { NextRequest, NextResponse } from "next/server";

import { getDbPool, hasDatabaseUrl } from "@/lib/db";
import { places as fallbackPlaces } from "@/lib/data/places";

const allowedVerificationLevels = ["owner", "community", "directory", "unverified"] as const;

type Verification = (typeof allowedVerificationLevels)[number];

type PaymentAccept = {
  asset: string | null;
  chain: string | null;
};

type Social = {
  platform: string;
  url: string | null;
  handle: string | null;
};

type Media = {
  url: string;
};

type DbPlace = {
  id: string;
  name: string;
  category: string | null;
  country: string | null;
  city: string | null;
  lat: number;
  lng: number;
  address: string | null;
  about: string | null;
  amenities: string | null;
  hours: string | null;
  verification: string | null;
};

const sanitizeVerification = (value: string | null): Verification => {
  if (value && allowedVerificationLevels.includes(value as Verification)) {
    return value as Verification;
  }

  return "unverified";
};

const normalizeAmenities = (raw: string | null): string[] => {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value)).filter(Boolean);
    }
  } catch (error) {
    console.warn("[places-detail] failed to parse amenities JSON", error);
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
};

const normalizeAccepted = (payments: PaymentAccept[], fallback?: string[]): string[] => {
  if (payments.length === 0) {
    return fallback ?? [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const payment of payments) {
    const asset = payment.asset?.toUpperCase() ?? null;
    const chain = payment.chain?.toUpperCase() ?? null;
    let label: string | null = null;

    if (chain === "LIGHTNING" || (asset === "BTC" && chain === "LIGHTNING")) {
      label = "Lightning";
    } else if (asset) {
      label = asset;
    } else if (chain) {
      label = chain;
    }

    if (label && !seen.has(label)) {
      seen.add(label);
      normalized.push(label);
    }
  }

  return normalized;
};

const normalizeAbout = (value: string | null, verification: Verification) => {
  if (verification === "unverified") {
    return "";
  }

  return value ?? "";
};

const normalizeImages = (media: Media[], verification: Verification) => {
  if (verification === "directory" || verification === "unverified") {
    return [] as string[];
  }

  return media.map((item) => item.url).filter(Boolean);
};

const pickContactFromSocials = (socials: Social[]) => {
  const contact = {
    website: null as string | null,
    phone: null as string | null,
    x: null as string | null,
    instagram: null as string | null,
    facebook: null as string | null,
  };

  for (const social of socials) {
    const platform = social.platform.toLowerCase();
    const value = social.url ?? social.handle;

    switch (platform) {
      case "website":
        contact.website = value;
        break;
      case "phone":
        contact.phone = value;
        break;
      case "x":
      case "twitter":
        contact.x = value;
        break;
      case "instagram":
        contact.instagram = value;
        break;
      case "facebook":
        contact.facebook = value;
        break;
      default:
        break;
    }
  }

  return contact;
};

const loadPlaceDetailFromDb = async (id: string) => {
  if (!hasDatabaseUrl()) return null;

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const { rows: tableChecks } = await client.query<{ [key: string]: string | null }>(
      `SELECT
        to_regclass('public.places') AS places,
        to_regclass('public.verifications') AS verifications,
        to_regclass('public.payment_accepts') AS payment_accepts,
        to_regclass('public.socials') AS socials,
        to_regclass('public.media') AS media`,
    );

    if (!tableChecks[0]?.places) {
      return null;
    }

    const { rows: placeRows } = await client.query<DbPlace>(
      `SELECT p.id, p.name, p.category, p.country, p.city, p.lat, p.lng, p.address, p.about, p.amenities, p.hours,
        COALESCE(v.level, 'unverified') AS verification
       FROM places p
       LEFT JOIN verifications v ON v.place_id = p.id
       WHERE p.id = $1
       LIMIT 1`,
      [id],
    );

    if (!placeRows.length) {
      return undefined;
    }

    const place = placeRows[0];
    const verification = sanitizeVerification(place.verification);

    const payments: PaymentAccept[] = tableChecks[0]?.payment_accepts
      ? (
          await client.query<PaymentAccept>(
            `SELECT asset, chain
             FROM payment_accepts
             WHERE place_id = $1`,
            [id],
          )
        ).rows
      : [];

    const socials: Social[] = tableChecks[0]?.socials
      ? (
          await client.query<Social>(
            `SELECT platform, url, handle
             FROM socials
             WHERE place_id = $1`,
            [id],
          )
        ).rows
      : [];

    const media: Media[] = tableChecks[0]?.media
      ? (
          await client.query<Media>(
            `SELECT url
             FROM media
             WHERE place_id = $1`,
            [id],
          )
        ).rows
      : [];

    return {
      id: place.id,
      name: place.name,
      category: place.category ?? "unknown",
      verification,
      lat: Number(place.lat),
      lng: Number(place.lng),
      country: place.country ?? "",
      city: place.city ?? "",
      about: normalizeAbout(place.about, verification),
      about_short: normalizeAbout(place.about, verification),
      hours: place.hours ?? null,
      amenities: normalizeAmenities(place.amenities),
      accepted: normalizeAccepted(payments),
      contact: pickContactFromSocials(socials),
      images: normalizeImages(media, verification),
      address_full: place.address ?? null,
      location: {
        address1: place.address ?? null,
        address2: null,
        lat: Number(place.lat),
        lng: Number(place.lng),
      },
      payments: payments.length
        ? {
            assets: normalizeAccepted(payments),
            pages: [],
          }
        : null,
      socials,
    };
  } catch (error) {
    console.error("[places-detail] failed to load from database", error);
    return null;
  } finally {
    client.release();
  }
};

const loadFallbackPlace = (id: string) => {
  const place = fallbackPlaces.find((item) => item.id === id);
  if (!place) return undefined;

  const verification = sanitizeVerification(place.verification);

  return {
    ...place,
    verification,
    about: normalizeAbout(place.about ?? null, verification),
    about_short: normalizeAbout(place.about ?? null, verification),
    amenities: place.amenities ?? [],
    images: normalizeImages(
      (place.images ?? []).map((url) => ({ url })),
      verification,
    ),
    contact: {
      website: place.website ?? null,
      phone: place.phone ?? null,
      x: place.twitter ?? null,
      instagram: place.instagram ?? null,
      facebook: place.facebook ?? null,
    },
    payments: place.accepted?.length
      ? {
          assets: normalizeAccepted([], place.accepted),
          pages: [],
        }
      : null,
  };
};

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;

  const dbPlace = await loadPlaceDetailFromDb(id);

  if (dbPlace === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (dbPlace) {
    return NextResponse.json(dbPlace);
  }

  const fallbackPlace = loadFallbackPlace(id);

  if (!fallbackPlace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(fallbackPlace);
}
