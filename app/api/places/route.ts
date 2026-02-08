import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

type Verification = "owner" | "community" | "directory" | "unverified";

import { parseBbox, type ParsedBbox } from "@/lib/geo/bbox";
import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { places } from "@/lib/data/places";
import { normalizeCommaParams } from "@/lib/filters";
import { normalizeAccepted, type PaymentAccept } from "@/lib/accepted";
import type { Place } from "@/types/places";


/**
 * Hotfix: prevent /api/places 500 due to missing sanitizers.
 * These are intentionally small + defensive.
 */
const _VERIFICATION_LEVELS = new Set(["owner","community","directory","unverified","report","verified","pending"]);

function sanitizeVerification(v: unknown): Verification {
  if (typeof v !== "string") return "unverified";
  const x = v.trim().toLowerCase();
  return _VERIFICATION_LEVELS.has(x as Verification) ? (x as Verification) : "unverified";
}

function sanitizeOptionalStrings<T>(input: T): T {
  // Recursively sanitize objects/arrays:
  // - undefined -> null
  // - "" -> null
  // - trim strings
  if (Array.isArray(input)) {
    return input.map((x) => sanitizeOptionalStrings(x)) as unknown as T;
  }
  if (input && typeof input === "object") {
    const out: any = { ...(input as any) };
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (v === undefined) {
        out[k] = null;
        continue;
      }
      if (typeof v === "string") {
        const t = v.trim();
        out[k] = t === "" ? null : t;
        continue;
      }
      if (Array.isArray(v) || (v && typeof v === "object")) {
        out[k] = sanitizeOptionalStrings(v);
        continue;
      }
      out[k] = v;
    }
    return out as T;
  }
  return input;
}

const DEFAULT_LIMIT = 1200;
const MAX_LIMIT = 5000;
const ALL_MODE_LIMIT = 1200;
const CACHE_TTL_MS = 20_000;
const DB_ERROR_LOG_WINDOW_MS = 60_000;

type PlaceSummary = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  verification: Verification;
  category: string;
  city: string;
  country: string;
  accepted: string[];
};

type CacheEntry = {
  expiresAt: number;
  data: PlaceSummary[];
  source: "db" | "json";
  limited: boolean;
};

const placesCache = new Map<string, CacheEntry>();
let lastDbErrorLogAt = 0;

const getPlaceChains = (place: Place) =>
  place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];

const parsePositiveInt = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
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

const buildAccepted = (place: Place): string[] => {
  const fallbackAccepted = place.accepted ?? place.supported_crypto ?? [];
  return normalizeAccepted([], fallbackAccepted);
};

const toSummary = (place: Place, accepted: string[]): PlaceSummary => ({
  id: place.id,
  name: place.name,
  lat: Number(place.lat),
  lng: Number(place.lng),
  verification: sanitizeVerification(place.verification) as Verification,
  category: place.category ?? "unknown",
  city: place.city ?? "",
  country: place.country ?? "",
  accepted,
});

const buildCacheKey = (params: URLSearchParams): string => {
  const entries = Array.from(params.entries()).sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    if (keyCompare !== 0) return keyCompare;
    return aValue.localeCompare(bValue);
  });
  return entries.map(([key, value]) => `${key}=${value}`).join("&");
};

const logDbFailure = (message: string, error?: unknown) => {
  const now = Date.now();
  if (now - lastDbErrorLogAt < DB_ERROR_LOG_WINDOW_MS) {
    return;
  }
  lastDbErrorLogAt = now;
  if (error instanceof Error) {
    console.warn(`[places] ${message}`, error.message);
    return;
  }
  if (error) {
    console.warn(`[places] ${message}`, error);
    return;
  }
  console.warn(`[places] ${message}`);
};

const loadPlacesFromJson = async (): Promise<Place[]> => {
  try {
    const filePath = path.join(process.cwd(), "data", "places.json");
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as Place[];
    }
  } catch (error) {
    logDbFailure("failed to load fallback JSON data", error);
  }
  return [];
};


const loadPlacesFromDb = async (
  filters: {
    category: string | null;
    country: string | null;
    city: string | null;
    bbox: ParsedBbox[] | null;
    verification: Place["verification"][];
    payment: string[];
    search: string | null;
    limit: number;
    offset: number;
  },
): Promise<PlaceSummary[] | null> => {
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

    if (filters.bbox?.length) {
      const bboxClauses: string[] = [];

      for (const bbox of filters.bbox) {
        if (hasGeom) {
          const startIndex = params.length + 1;
          params.push(bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat);
          bboxClauses.push(
            `ST_Intersects(p.geom::geometry, ST_MakeEnvelope($${startIndex}, $${startIndex + 1}, $${startIndex + 2}, $${startIndex + 3}, 4326))`,
          );
        } else {
          const startIndex = params.length + 1;
          params.push(bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat);
          bboxClauses.push(
            `(p.lng BETWEEN $${startIndex} AND $${startIndex + 1} AND p.lat BETWEEN $${startIndex + 2} AND $${startIndex + 3})`,
          );
        }
      }

      where.push(bboxClauses.length > 1 ? `(${bboxClauses.join(" OR ")})` : bboxClauses[0]);
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

    const query = `SELECT p.id, p.name, p.category, p.city, p.country, p.lat, p.lng${verificationSelect}${reviewSelect}
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
        verification: sanitizeVerification(row.verification) as Verification,
        lat: Number(row.lat),
        lng: Number(row.lng),
        country: row.country ?? "",
        city: row.city ?? "",
      };

      return toSummary(base, accepted);
    });

    return mapped;
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      throw error;
    }
    logDbFailure("failed to load from database", error);
    return null;
  }
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const dryRunParam = searchParams.get("dryRun") ?? "";
  const dryRun = ["1", "true", "yes"].includes(dryRunParam.toLowerCase());
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson } = getDataSourceContext(dataSource);
  const defaultSource =
    dataSource === "json" ? "json" : dataSource === "db" ? "db" : shouldAttemptDb ? "db" : "json";
  const defaultHeaders = buildDataSourceHeaders(defaultSource, defaultSource === "json");

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

  if (dryRun) {
    const dryRunId = searchParams.get("placeId") ?? "cpm:dryrun-placeholder";
    const stubName = searchTerm ?? "[DRY RUN]";
    return NextResponse.json(
      [
        {
          id: dryRunId,
          name: stubName,
          lat: 0,
          lng: 0,
          verification: "unverified",
          category: "dry-run",
          city: "",
          country: "",
          accepted: [],
        },
      ],
      { headers: buildDataSourceHeaders("json", true) },
    );
  }

  if (bboxResult.error) {
    return NextResponse.json(
      { ok: false, error: "INVALID_BBOX", message: bboxResult.error },
      { status: 400, headers: defaultHeaders },
    );
  }

  const requestedLimit = parsePositiveInt(searchParams.get("limit"));
  let limit = requestedLimit ?? DEFAULT_LIMIT;
  if (searchParams.has("limit") && !requestedLimit) {
    limit = DEFAULT_LIMIT;
  }
  limit = Math.min(limit, MAX_LIMIT);

  let offset = parseOffset(searchParams.get("offset"));

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
    return NextResponse.json(cached.data, {
      headers: buildDataSourceHeaders(cached.source, cached.limited),
    });
  }

  let dbPlaces: PlaceSummary[] | null = null;

  if (shouldAttemptDb) {
    try {
      dbPlaces = await withDbTimeout(
        loadPlacesFromDb({
          category,
          country,
          city,
          bbox: bboxResult.bbox,
          verification: verificationFilters,
          payment: combinedPaymentFilters,
          search: searchTerm,
          limit,
          offset,
        }),
        { message: "DB_TIMEOUT" },
      );
    } catch (error) {
      if (error instanceof DbUnavailableError) {
        logDbFailure("database unavailable", error);
      } else {
        logDbFailure("database query failed", error);
      }

      if (dataSource === "db") {
        return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, {
          status: 503,
          headers: buildDataSourceHeaders("db", true),
        });
      }
    }
  } else if (dataSource === "db") {
    logDbFailure("database unavailable");
    return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, {
      status: 503,
      headers: buildDataSourceHeaders("db", true),
    });
  }

  if (dataSource === "db") {
    if (!dbPlaces) {
      logDbFailure("database unavailable");
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, {
        status: 503,
        headers: buildDataSourceHeaders("db", true),
      });
    }
    const sanitized = dbPlaces.map(sanitizeOptionalStrings);
    placesCache.set(cacheKey, {
      data: sanitized,
      expiresAt: Date.now() + CACHE_TTL_MS,
      source: "db",
      limited: false,
    });
    return NextResponse.json(sanitized, {
      headers: buildDataSourceHeaders("db", false),
    });
  }

  if (dbPlaces !== null) {
    const sanitized = dbPlaces.map(sanitizeOptionalStrings);
    placesCache.set(cacheKey, {
      data: sanitized,
      expiresAt: Date.now() + CACHE_TTL_MS,
      source: "db",
      limited: false,
    });
    return NextResponse.json(sanitized, {
      headers: buildDataSourceHeaders("db", false),
    });
  }

  if (!shouldAllowJson) {
    return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, {
      status: 503,
      headers: buildDataSourceHeaders("db", true),
    });
  }

  const sourcePlaces = await loadPlacesFromJson();

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
      const matches = bboxResult.bbox.some(({ minLng, minLat, maxLng, maxLat }) => {
        return place.lng >= minLng && place.lng <= maxLng && place.lat >= minLat && place.lat <= maxLat;
      });
      if (!matches) {
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
  const paged = ordered
    .slice(offset, offset + limit)
    .map((place) => toSummary(place, buildAccepted(place)))
    .map(sanitizeOptionalStrings);
  placesCache.set(cacheKey, {
    data: paged,
    expiresAt: Date.now() + CACHE_TTL_MS,
    source: "json",
    limited: true,
  });

  return NextResponse.json(paged, {
    headers: buildDataSourceHeaders("json", true),
  });
}
