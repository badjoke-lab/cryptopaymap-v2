import { NextRequest, NextResponse } from "next/server";

import { getDbPool, hasDatabaseUrl } from "@/lib/db";
import { places } from "@/lib/data/places";
import { normalizeCommaParams } from "@/lib/filters";
import type { Place } from "@/types/places";

const getPlaceChains = (place: Place) =>
  place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

const u = (v: string | null | undefined): string | undefined => v ?? undefined;

const sanitizeOptionalStrings = (place: Place): Place => ({
  ...place,
  address: u(place.address),
  address_full: u(place.address_full),
  about: u(place.about),
  paymentNote: u(place.paymentNote),
  website: u(place.website),
  phone: u(place.phone),
  twitter: u(place.twitter),
  instagram: u(place.instagram),
  facebook: u(place.facebook),
  submitterName: u(place.submitterName),
  updatedAt: u(place.updatedAt),
  coverImage: u(place.coverImage),
  description: u(place.description),
  social_twitter: u(place.social_twitter),
  social_instagram: u(place.social_instagram),
  social_website: u(place.social_website),
});

const allowedVerificationLevels: Place["verification"][] = [
  "unverified",
  "owner",
  "directory",
  "community",
];

const sanitizeVerification = (value: string | null): Place["verification"] => {
  if (value && allowedVerificationLevels.includes(value as Place["verification"])) {
    return value as Place["verification"];
  }

  return "unverified";
};

const loadPlacesFromDb = async (
  filters: {
    category: string | null;
    country: string | null;
    city: string | null;
  },
  chainFilters: string[],
): Promise<Place[] | null> => {
  if (!hasDatabaseUrl()) return null;

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    const { rows: tableChecks } = await client.query<{
      present: string | null;
      verifications: string | null;
      payments: string | null;
    }>(
      `SELECT
        to_regclass('public.places') AS present,
        to_regclass('public.verifications') AS verifications,
        to_regclass('public.payment_accepts') AS payments`,
    );

    if (!tableChecks[0]?.present) {
      return null;
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.category) {
      params.push(filters.category);
      where.push(`p.category = $${params.length}`);
    }
    if (filters.country) {
      params.push(filters.country);
      where.push(`p.country = $${params.length}`);
    }
    if (filters.city) {
      params.push(filters.city);
      where.push(`p.city = $${params.length}`);
    }

    where.push("p.lat IS NOT NULL");
    where.push("p.lng IS NOT NULL");

    const hasVerifications = Boolean(tableChecks[0]?.verifications);
    const hasPayments = Boolean(tableChecks[0]?.payments);

    const verificationColumns = hasVerifications
      ? await client.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'verifications' AND column_name IN ('level', 'status')`,
        )
      : null;

    const hasVerificationLevel = Boolean(verificationColumns?.rows.some((row) => row.column_name === "level"));
    const hasVerificationStatus = Boolean(verificationColumns?.rows.some((row) => row.column_name === "status"));

    const verificationField = hasVerifications && hasVerificationLevel ? "v.level" : null;
    const reviewField = hasVerifications && hasVerificationStatus ? "v.status" : null;

    const verificationSelect = verificationField
      ? `, COALESCE(${verificationField}, 'unverified') AS verification`
      : ", 'unverified'::text AS verification";

    const reviewSelect = reviewField ? `, ${reviewField} AS review_status` : ", NULL::text AS review_status";

    const paymentsSelect = hasPayments ? ", array_agg(DISTINCT pa.asset) FILTER (WHERE pa.asset IS NOT NULL) AS accepted_chains" : "";
    const joinVerification = hasVerifications ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";
    const joinPayments = hasPayments ? " LEFT JOIN payment_accepts pa ON pa.place_id = p.id" : "";

    const groupByColumns = ["p.id", "p.name", "p.category", "p.city", "p.country", "p.lat", "p.lng", "p.address", "p.about"];
    if (verificationField) {
      groupByColumns.push(verificationField);
    }
    if (reviewField) {
      groupByColumns.push(reviewField);
    }

    const groupBy = hasPayments ? `GROUP BY ${Array.from(new Set(groupByColumns)).join(", ")}` : "";

    const query = `SELECT p.id, p.name, p.category, p.city, p.country, p.lat, p.lng, p.address, p.about${verificationSelect}${reviewSelect}${paymentsSelect}
      FROM places p${joinVerification}${joinPayments}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${groupBy}`;

    const { rows } = await client.query<{
      id: string;
      name: string;
      category: string | null;
      city: string | null;
      country: string | null;
      lat: number;
      lng: number;
      address: string | null;
      about: string | null;
      verification: string | null;
      review_status: string | null;
      accepted_chains?: string[] | null;
    }>(query, params);

    const mapped = rows.map((row) => {
      const base: Place = {
        id: row.id,
        name: row.name,
        category: row.category ?? "unknown",
      verification: sanitizeVerification(row.verification),
      lat: Number(row.lat),
      lng: Number(row.lng),
      country: row.country ?? "",
      city: row.city ?? "",
      address: u(row.address),
      address_full: u(row.address),
      about: u(row.about),
      paymentNote: undefined,
      accepted: row.accepted_chains ?? [],
      website: undefined,
      phone: undefined,
      twitter: undefined,
      instagram: undefined,
      facebook: undefined,
      amenities: [],
      submitterName: undefined,
      images: [],
      updatedAt: undefined,
    };

      return base;
    });

    if (chainFilters.length === 0 || !hasPayments) {
      return mapped;
    }

    const normalizedChains = chainFilters.map((chain) => chain.toLowerCase());
    return mapped.filter((place) => {
      const accepted = place.accepted ?? [];
      const normalized = accepted.map((value) => value.toLowerCase());
      return normalizedChains.some((chain) => normalized.includes(chain));
    });
  } catch (error) {
    console.error("[places] failed to load from database", error);
    return null;
  } finally {
    client.release();
  }
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get("category");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const chainFilters = normalizeCommaParams(searchParams.getAll("chain")).map((chain) => chain.toLowerCase());
  const verificationFilters = normalizeCommaParams(searchParams.getAll("verification")) as Place["verification"][];

  const dbPlaces = await loadPlacesFromDb({ category, country, city }, chainFilters);
  const sourcePlaces = dbPlaces ?? places;

  const hasChainFilters = chainFilters.length > 0;
  const hasVerificationFilters = verificationFilters.length > 0;

  const filtered = sourcePlaces.filter((place) => {
    if (
      place.lat === null ||
      place.lng === null ||
      Number.isNaN(place.lat) ||
      Number.isNaN(place.lng)
    ) {
      return false;
    }

    if (category && place.category !== category) {
      return false;
    }

    if (country && place.country !== country) {
      return false;
    }

    if (city && place.city !== city) {
      return false;
    }

    if (hasChainFilters) {
      const placeChains = getPlaceChains(place).map((chain) => chain.toLowerCase());
      if (!chainFilters.some((chain) => placeChains.includes(chain))) {
        return false;
      }
    }

    if (hasVerificationFilters && !verificationFilters.includes(place.verification)) {
      return false;
    }

    return true;
  });

  return NextResponse.json(filtered.map(sanitizeOptionalStrings));
}
