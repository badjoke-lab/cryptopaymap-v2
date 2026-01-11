import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { normalizeAccepted } from "@/lib/accepted";
import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { deriveFilterMeta, type FilterMeta } from "@/lib/filters";
import type { Place } from "@/types/places";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=600";
const CACHE_TTL_MS = 3_600_000;
const DB_ERROR_LOG_WINDOW_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  data: FilterMeta;
  source: "db" | "json";
};

let cache: CacheEntry | null = null;
let lastDbErrorLogAt = 0;

const getDataSource = (): "auto" | "db" | "json" => {
  const normalize = (value: string | undefined) => value?.trim().toLowerCase() ?? "";
  const envValue = normalize(process.env.DATA_SOURCE);
  if (envValue === "auto" || envValue === "db" || envValue === "json") {
    return envValue;
  }
  const publicValue = normalize(process.env.NEXT_PUBLIC_DATA_SOURCE);
  if (publicValue === "auto" || publicValue === "db" || publicValue === "json") {
    return publicValue;
  }
  return "auto";
};

const logDbFailure = (message: string, error?: unknown) => {
  const now = Date.now();
  if (now - lastDbErrorLogAt < DB_ERROR_LOG_WINDOW_MS) {
    return;
  }
  lastDbErrorLogAt = now;
  if (error instanceof Error) {
    console.warn(`[filters-meta] ${message}`, error.message);
    return;
  }
  if (error) {
    console.warn(`[filters-meta] ${message}`, error);
    return;
  }
  console.warn(`[filters-meta] ${message}`);
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

const hasColumn = async (route: string, table: string, column: string) => {
  const { rows } = await dbQuery<{ present: number }>(
    `SELECT COUNT(*)::int AS present
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [table, column],
    { route },
  );
  return (rows[0]?.present ?? 0) > 0;
};

const extractChainsFromPlaces = (places: Place[]): string[] => {
  const chains = new Set<string>();

  places.forEach((place) => {
    const accepted = place.supported_crypto?.length ? place.supported_crypto : place.accepted ?? [];
    const normalized = normalizeAccepted([], accepted);
    normalized.forEach((chain) => chains.add(chain));
  });

  return Array.from(chains).sort((a, b) => a.localeCompare(b));
};

const loadMetaFromDb = async (): Promise<FilterMeta | null> => {
  if (!hasDatabaseUrl()) return null;
  const route = "api_filters_meta";

  try {
    const { rows: tableChecks } = await dbQuery<{ present: string | null; payments: string | null }>(
      `SELECT
        to_regclass('public.places') AS present,
        to_regclass('public.payment_accepts') AS payments`,
      [],
      { route },
    );

    if (!tableChecks[0]?.present) {
      return null;
    }

    const [hasCategory, hasCountry, hasCity] = await Promise.all([
      hasColumn(route, "places", "category"),
      hasColumn(route, "places", "country"),
      hasColumn(route, "places", "city"),
    ]);

    const [categoryRows, countryRows, cityRows] = await Promise.all([
      hasCategory
        ? dbQuery<{ value: string | null }>(
            `SELECT DISTINCT category AS value
             FROM places
             WHERE NULLIF(BTRIM(category), '') IS NOT NULL`,
            [],
            { route },
          )
        : Promise.resolve({ rows: [] }),
      hasCountry
        ? dbQuery<{ value: string | null }>(
            `SELECT DISTINCT country AS value
             FROM places
             WHERE NULLIF(BTRIM(country), '') IS NOT NULL`,
            [],
            { route },
          )
        : Promise.resolve({ rows: [] }),
      hasCountry && hasCity
        ? dbQuery<{ country: string | null; city: string | null }>(
            `SELECT DISTINCT country, city
             FROM places
             WHERE NULLIF(BTRIM(country), '') IS NOT NULL
               AND NULLIF(BTRIM(city), '') IS NOT NULL`,
            [],
            { route },
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const categories = categoryRows.rows
      .map((row) => row.value?.trim())
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));

    const countries = countryRows.rows
      .map((row) => row.value?.trim())
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => a.localeCompare(b));

    const citiesMap = new Map<string, Set<string>>();
    cityRows.rows.forEach((row) => {
      const country = row.country?.trim();
      const city = row.city?.trim();
      if (!country || !city) return;
      if (!citiesMap.has(country)) {
        citiesMap.set(country, new Set());
      }
      citiesMap.get(country)?.add(city);
    });

    const cities: Record<string, string[]> = {};
    citiesMap.forEach((values, country) => {
      cities[country] = Array.from(values).sort((a, b) => a.localeCompare(b));
    });

    let chains: string[] = [];
    if (tableChecks[0]?.payments) {
      const [hasAsset, hasChain] = await Promise.all([
        hasColumn(route, "payment_accepts", "asset"),
        hasColumn(route, "payment_accepts", "chain"),
      ]);

      if (hasAsset || hasChain) {
        const { rows } = await dbQuery<{ label: string | null }>(
          `SELECT DISTINCT
             CASE
               WHEN UPPER(BTRIM(chain)) IN ('LIGHTNING', 'LN')
                 OR UPPER(BTRIM(asset)) = 'LIGHTNING'
                 OR (UPPER(BTRIM(asset)) = 'BTC' AND UPPER(BTRIM(chain)) = 'LIGHTNING')
                 THEN 'Lightning'
               WHEN NULLIF(BTRIM(asset), '') IS NOT NULL THEN UPPER(BTRIM(asset))
               WHEN NULLIF(BTRIM(chain), '') IS NOT NULL THEN UPPER(BTRIM(chain))
               ELSE NULL
             END AS label
           FROM payment_accepts
           WHERE NULLIF(BTRIM(asset), '') IS NOT NULL
              OR NULLIF(BTRIM(chain), '') IS NOT NULL`,
          [],
          { route },
        );

        chains = rows
          .map((row) => row.label?.trim())
          .filter((value): value is string => Boolean(value))
          .sort((a, b) => a.localeCompare(b));
      }
    }

    if (!chains.length) {
      const { rows: placeRows } = await dbQuery<{ id: string }>("SELECT id FROM places", [], { route });
      const placeIds = new Set(placeRows.map((row) => row.id));
      const fallbackPlaces = await loadPlacesFromJson();
      chains = extractChainsFromPlaces(fallbackPlaces.filter((place) => placeIds.has(place.id)));
    }

    return {
      categories,
      chains,
      countries,
      cities,
    };
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      throw error;
    }
    logDbFailure("failed to load from database", error);
    return null;
  }
};

export async function GET() {
  const cached = cache;
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.data, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-CPM-Data-Source": cached.source,
      },
    });
  }

  const dataSource = getDataSource();
  let dbMeta: FilterMeta | null = null;

  if (dataSource !== "json") {
    try {
      dbMeta = await loadMetaFromDb();
    } catch (error) {
      if (error instanceof DbUnavailableError) {
        logDbFailure("database unavailable", error);
        if (dataSource === "db") {
          return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
        }
      } else {
        logDbFailure("database query failed", error);
        if (dataSource === "db") {
          return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
        }
      }
    }
  }

  if (dataSource === "db") {
    if (!dbMeta) {
      logDbFailure("database unavailable");
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    cache = { data: dbMeta, expiresAt: Date.now() + CACHE_TTL_MS, source: "db" };
    return NextResponse.json(dbMeta, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-CPM-Data-Source": "db",
      },
    });
  }

  if (dbMeta) {
    cache = { data: dbMeta, expiresAt: Date.now() + CACHE_TTL_MS, source: "db" };
    return NextResponse.json(dbMeta, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "X-CPM-Data-Source": "db",
      },
    });
  }

  const fallbackPlaces = await loadPlacesFromJson();
  const meta = deriveFilterMeta(fallbackPlaces);
  cache = { data: meta, expiresAt: Date.now() + CACHE_TTL_MS, source: "json" };

  return NextResponse.json(meta, {
    headers: {
      "Cache-Control": CACHE_CONTROL,
      "X-CPM-Data-Source": "json",
    },
  });
}
