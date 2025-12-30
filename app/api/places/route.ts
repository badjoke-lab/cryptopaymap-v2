import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { places } from "@/lib/data/places";
import { normalizeCommaParams } from "@/lib/filters";
import { normalizeAccepted, type PaymentAccept } from "@/lib/accepted";
import type { Place } from "@/types/places";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const ALL_MODE_LIMIT = 1000;
const CACHE_TTL_MS = 20_000;

type CacheEntry = {
  expiresAt: number;
  data: Place[];
};

const placesCache = new Map<string, CacheEntry>();

const getPlaceChains = (place: Place) =>
  place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

const u = (v: string | null | undefined): string | undefined => v ?? undefined;

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

type ParsedBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const parseBbox = (value: string | null): { bbox: ParsedBbox | null; error?: string } => {
  if (!value) return { bbox: null };
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 4) {
    return { bbox: null, error: "bbox must be four comma-separated numbers" };
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map((part) => Number.parseFloat(part));
  if (![minLng, minLat, maxLng, maxLat].every((num) => Number.isFinite(num))) {
    return { bbox: null, error: "bbox must contain valid numbers" };
  }
  if (minLng < -180 || minLng > 180 || maxLng < -180 || maxLng > 180) {
    return { bbox: null, error: "bbox longitude out of range" };
  }
  if (minLat < -90 || minLat > 90 || maxLat < -90 || maxLat > 90) {
    return { bbox: null, error: "bbox latitude out of range" };
  }
  if (minLng >= maxLng || minLat >= maxLat) {
    return { bbox: null, error: "bbox min values must be less than max values" };
  }
  return { bbox: { minLng, minLat, maxLng, maxLat } };
};

const parseSearchTerm = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
};

const parseOffset = (value: string | null): number => {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

const buildCacheKey = (params: URLSearchParams): string => {
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    if (keyCompare !== 0) return keyCompare;
    return aValue.localeCompare(bValue);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
};

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
    bbox: ParsedBbox | null;
    verification: Place["verification"][];
    payment: string[];
    search: string | null;
    limit: number;
    offset: number;
  },
): Promise<Place[] | null> => {
  if (!hasDatabaseUrl()) return null;
  const route = "api_places";

  const fallbackPlacesById = new Map(places.map((place) => [place.id, place]));

  try {
    const { rows: tableChecks } = await dbQuery<{
      present: string | null;
      verifications: string | null;
      payments: string | null;
    }>(
      `SELECT
        to_regclass('public.places') AS present,
        to_regclass('public.verifications') AS verifications,
        to_regclass('public.payment_accepts') AS payments`,
      [],
      { route },
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
      ? await dbQuery<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'verifications'
             AND column_name IN ('level', 'status')`,
          [],
          { route },
        )
      : null;

    const hasVerificationLevel = Boolean(
      verificationColumns?.rows.some((row) => row.column_name === "level"),
    );
    const hasVerificationStatus = Boolean(
      verificationColumns?.rows.some((row) => row.column_name === "status"),
    );

    const verificationField = hasVerifications && hasVerificationLevel ? "v.level" : null;
    const reviewField = hasVerifications && hasVerificationStatus ? "v.status" : null;

    const verificationSelect = verificationField
      ? `, COALESCE(${verificationField}, 'unverified') AS verification`
      : ", 'unverified'::text AS verification";

    const reviewSelect = reviewField ? `, ${reviewField} AS review_status` : ", NULL::text AS review_status";
    const joinVerification = hasVerifications ? " LEFT JOIN verifications v ON v.place_id = p.id" : "";

    const placeColumns = await dbQuery<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'places'
         AND column_name IN ('geom', 'updated_at')`,
      [],
      { route },
    );
    const hasGeom = placeColumns.rows.some((row) => row.column_name === "geom");
    const hasUpdatedAt = placeColumns.rows.some((row) => row.column_name === "updated_at");

    if (filters.bbox) {
      if (hasGeom) {
        params.push(filters.bbox.minLng, filters.bbox.minLat, filters.bbox.maxLng, filters.bbox.maxLat);
        where.push(
          `ST_Intersects(p.geom::geometry, ST_MakeEnvelope($${params.length - 3}, $${params.length - 2}, $${params.length - 1}, $${params.length}, 4326))`,
        );
      } else {
        params.push(filters.bbox.minLng, filters.bbox.maxLng);
        where.push(`p.lng BETWEEN $${params.length - 1} AND $${params.length}`);
        params.push(filters.bbox.minLat, filters.bbox.maxLat);
        where.push(`p.lat BETWEEN $${params.length - 1} AND $${params.length}`);
      }
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(p.name ILIKE $${params.length} OR COALESCE(p.address, '') ILIKE $${params.length})`);
    }

    if (filters.verification.length) {
      if (!verificationField) {
        if (!filters.verification.every((level) => level === "unverified")) {
          return [];
        }
      } else {
        params.push(filters.verification);
        where.push(`COALESCE(${verificationField}, 'unverified') = ANY($${params.length}::text[])`);
      }
    }

    if (filters.payment.length) {
      if (!hasPayments) {
        return [];
      }
      params.push(filters.payment);
      where.push(
        `EXISTS (
          SELECT 1
          FROM payment_accepts pa
          WHERE pa.place_id = p.id
            AND (
              LOWER(pa.asset) = ANY($${params.length}::text[])
              OR LOWER(pa.chain) = ANY($${params.length}::text[])
            )
        )`,
      );
    }

    const orderBy = hasUpdatedAt
      ? "ORDER BY p.updated_at DESC NULLS LAST, p.id ASC"
      : "ORDER BY p.id ASC";

    const query = `SELECT p.id, p.name, p.category, p.city, p.country, p.lat, p.lng, p.address, p.about${verificationSelect}${reviewSelect}
      FROM places p${joinVerification}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ${orderBy}
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}`;

    params.push(filters.limit, filters.offset);

    const { rows } = await dbQuery<{
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
    }>(query, params, { route });

    const placeIds = rows.map((row) => row.id);
    const paymentsByPlace = new Map<string, PaymentAccept[]>();

    let hasPreferredFlag = false;
    if (hasPayments) {
      const { rows: paymentCols } = await dbQuery<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'payment_accepts'
           AND column_name IN ('is_preferred')`,
        [],
        { route },
      );
      hasPreferredFlag = paymentCols.some((r) => r.column_name === "is_preferred");
    }

    if (hasPayments && placeIds.length) {
      const preferredSelect = hasPreferredFlag ? "is_preferred" : "NULL::boolean AS is_preferred";
      const preferredOrder = hasPreferredFlag ? "is_preferred DESC NULLS LAST," : "";

      const { rows: paymentRows } = await dbQuery<{
        place_id: string;
        asset: string | null;
        chain: string | null;
        is_preferred: boolean | null;
      }>(
        `SELECT place_id, asset, chain, ${preferredSelect}
         FROM payment_accepts
         WHERE place_id = ANY($1::text[])
         ORDER BY place_id ASC, ${preferredOrder} id ASC`,
        [placeIds],
        { route },
      );

      for (const payment of paymentRows) {
        const payments = paymentsByPlace.get(payment.place_id) ?? [];
        payments.push({
          asset: payment.asset,
          chain: payment.chain,
          is_preferred: payment.is_preferred,
        });
        paymentsByPlace.set(payment.place_id, payments);
      }
    }

    const mapped = rows.map((row) => {
      const payments = paymentsByPlace.get(row.id) ?? [];
      const fallback = fallbackPlacesById.get(row.id);
      const fallbackAccepted = fallback?.accepted ?? fallback?.supported_crypto;

      const accepted = hasPayments
        ? normalizeAccepted(payments, fallbackAccepted)
        : normalizeAccepted([], fallbackAccepted);

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
        accepted,
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

    return mapped;
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[places] failed to load from database", message);
    return null;
  }
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const category = searchParams.get("category");
  const country = searchParams.get("country");
  const city = searchParams.get("city");
  const chainFilters = normalizeCommaParams(searchParams.getAll("chain"));
  const paymentFilters = normalizeCommaParams(searchParams.getAll("payment"));
  const combinedPaymentFilters = Array.from(new Set([...chainFilters, ...paymentFilters])).map((chain) =>
    chain.toLowerCase(),
  );
  const verificationFilters = normalizeCommaParams(searchParams.getAll("verification")) as Place["verification"][];
  const mode = searchParams.get("mode");
  const searchTerm = parseSearchTerm(searchParams.get("q"));
  const bboxResult = parseBbox(searchParams.get("bbox"));

  if (bboxResult.error) {
    return NextResponse.json({ ok: false, error: "INVALID_BBOX", message: bboxResult.error }, { status: 400 });
  }

  const hasFilters =
    Boolean(category || country || city || searchTerm || bboxResult.bbox) ||
    combinedPaymentFilters.length > 0 ||
    verificationFilters.length > 0;

  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  if (searchParams.has("limit") && !requestedLimit) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT" }, { status: 400 });
  }
  let limit = requestedLimit ?? DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  let offset = parseOffset(searchParams.get("offset"));

  if (!hasFilters && requestedLimit && requestedLimit > DEFAULT_LIMIT) {
    limit = DEFAULT_LIMIT;
  }

  if (mode === "all") {
    if (!country && !city) {
      return NextResponse.json({ ok: false, error: "MODE_ALL_REQUIRES_SCOPE" }, { status: 400 });
    }
    limit = Math.min(requestedLimit ?? ALL_MODE_LIMIT, ALL_MODE_LIMIT);
    offset = 0;
  }

  const normalizedParams = new URLSearchParams(searchParams);
  normalizedParams.set("limit", String(limit));
  normalizedParams.set("offset", String(offset));
  if (searchTerm) {
    normalizedParams.set("q", searchTerm);
  }
  if (mode !== "all") {
    normalizedParams.delete("mode");
  }

  const cacheKey = buildCacheKey(normalizedParams);
  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data);
  }

  let dbPlaces: Place[] | null = null;
  try {
    dbPlaces = await loadPlacesFromDb({
      category,
      country,
      city,
      bbox: bboxResult.bbox,
      verification: verificationFilters,
      payment: combinedPaymentFilters,
      search: searchTerm,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    throw error;
  }

  if (dbPlaces) {
    const sanitized = dbPlaces.map(sanitizeOptionalStrings);
    placesCache.set(cacheKey, { data: sanitized, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(sanitized);
  }

  const sourcePlaces = places;

  const hasChainFilters = combinedPaymentFilters.length > 0;
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
      if (!combinedPaymentFilters.some((chain) => placeChains.includes(chain))) {
        return false;
      }
    }

    if (hasVerificationFilters && !verificationFilters.includes(place.verification)) {
      return false;
    }

    if (bboxResult.bbox) {
      const { minLng, minLat, maxLng, maxLat } = bboxResult.bbox;
      if (place.lng < minLng || place.lng > maxLng || place.lat < minLat || place.lat > maxLat) {
        return false;
      }
    }

    if (searchTerm) {
      const target = `${place.name ?? ""} ${place.address ?? ""}`.toLowerCase();
      if (!target.includes(searchTerm.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  const ordered = [...filtered].sort((a, b) => a.id.localeCompare(b.id));
  const paged = ordered.slice(offset, offset + limit).map(sanitizeOptionalStrings);
  placesCache.set(cacheKey, { data: paged, expiresAt: Date.now() + CACHE_TTL_MS });

  return NextResponse.json(paged);
}
