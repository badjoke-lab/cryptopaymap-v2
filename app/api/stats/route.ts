import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { places } from "@/lib/data/places";
import { computeDashboardStats } from "@/lib/stats/aggregate";
import {
  buildDataSourceHeaders,
  getDataSourceSetting,
  resolveDataSourceDecision,
  withDbTimeout,
} from "@/lib/dataSource";

export const revalidate = 7200;

// Response shape for GET /api/stats.
export type StatsApiResponse = {
  total_places: number;
  countries: number;
  cities: number;
  categories: number;
  chains: Record<string, number>;
  generated_at?: string;
  limited?: boolean;
};

type CacheRow = {
  total_places: number | string | null;
  total_countries: number | string | null;
  total_cities: number | string | null;
  category_breakdown: unknown;
  chain_breakdown: unknown;
  generated_at: string | Date | null;
};

const CACHE_CONTROL = "public, s-maxage=7200, stale-while-revalidate=600";
const TOP_CHAIN_LIMIT = 50;

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    "SELECT to_regclass($1) AS present",
    [`public.${table}`],
    { route },
  );

  return Boolean(rows[0]?.present);
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

const normalizeBreakdown = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  if (Array.isArray(value)) {
    return value.reduce<Record<string, number>>((acc, entry) => {
      if (entry && typeof entry === "object") {
        const key = (entry as { key?: string }).key;
        const count = Number((entry as { count?: number | string }).count ?? 0);
        if (key && Number.isFinite(count)) {
          acc[key] = count;
        }
      }
      return acc;
    }, {});
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, count]) => {
    const numeric = Number(count);
    if (Number.isFinite(numeric)) {
      acc[key] = numeric;
    }
    return acc;
  }, {});
};

const formatGeneratedAt = (value: CacheRow["generated_at"]): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.toISOString();
};

const limitedResponse = (overrides: Partial<StatsApiResponse> = {}): StatsApiResponse => ({
  total_places: 0,
  countries: 0,
  cities: 0,
  categories: 0,
  chains: {},
  limited: true,
  ...overrides,
});

const responseFromCache = (row: CacheRow): StatsApiResponse => {
  const categoryBreakdown = normalizeBreakdown(row.category_breakdown);
  return {
    total_places: Number(row.total_places ?? 0),
    countries: Number(row.total_countries ?? 0),
    cities: Number(row.total_cities ?? 0),
    categories: Object.keys(categoryBreakdown).length,
    chains: normalizeBreakdown(row.chain_breakdown),
    generated_at: formatGeneratedAt(row.generated_at),
    limited: false,
  };
};

const responseFromPlaces = (): StatsApiResponse => {
  const { byCountry, byCategory, byChain, kpi } = computeDashboardStats();
  const cityCount = new Set(
    places
      .map((place) => {
        const country = place.country?.trim();
        const city = place.city?.trim();
        if (!country || !city) return null;
        return `${country}::${city}`;
      })
      .filter(Boolean),
  ).size;

  const chains = byChain.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.chain] = entry.total;
    return acc;
  }, {});

  return limitedResponse({
    total_places: kpi.totalPlaces,
    countries: byCountry.length,
    cities: cityCount,
    categories: byCategory.length,
    chains,
  });
};

const responseFromDbFallback = async (route: string): Promise<StatsApiResponse> => {
  const placesTableExists = await tableExists(route, "places");
  if (!placesTableExists) {
    return limitedResponse();
  }

  const [hasCountry, hasCity, hasCategory] = await Promise.all([
    hasColumn(route, "places", "country"),
    hasColumn(route, "places", "city"),
    hasColumn(route, "places", "category"),
  ]);

  const hasPayments = await tableExists(route, "payment_accepts");
  const [hasPaymentChain, hasPaymentAsset] = hasPayments
    ? await Promise.all([
        hasColumn(route, "payment_accepts", "chain"),
        hasColumn(route, "payment_accepts", "asset"),
      ])
    : [false, false];

  const totalPromise = dbQuery<{ total: string }>("SELECT COUNT(*) AS total FROM places", [], { route });

  const countriesPromise = hasCountry
    ? dbQuery<{ total: string }>(
        `SELECT COUNT(DISTINCT country) AS total
         FROM places
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL`,
        [],
        { route },
      )
    : Promise.resolve({ rows: [] as { total: string }[] });

  const citiesPromise = hasCity
    ? dbQuery<{ total: string }>(
        hasCountry
          ? `SELECT COUNT(DISTINCT (country, city)) AS total
             FROM places
             WHERE NULLIF(BTRIM(city), '') IS NOT NULL
               AND NULLIF(BTRIM(country), '') IS NOT NULL`
          : `SELECT COUNT(DISTINCT city) AS total
             FROM places
             WHERE NULLIF(BTRIM(city), '') IS NOT NULL`,
        [],
        { route },
      )
    : Promise.resolve({ rows: [] as { total: string }[] });

  const categoriesPromise = hasCategory
    ? dbQuery<{ total: string }>(
        `SELECT COUNT(DISTINCT category) AS total
         FROM places
         WHERE NULLIF(BTRIM(category), '') IS NOT NULL`,
        [],
        { route },
      )
    : Promise.resolve({ rows: [] as { total: string }[] });

  const chainsPromise = hasPayments && (hasPaymentChain || hasPaymentAsset)
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT
           COALESCE(NULLIF(BTRIM(chain), ''), NULLIF(BTRIM(asset), '')) AS key,
           COUNT(*) AS total
         FROM payment_accepts
         WHERE NULLIF(BTRIM(chain), '') IS NOT NULL
            OR NULLIF(BTRIM(asset), '') IS NOT NULL
         GROUP BY key
         ORDER BY COUNT(*) DESC
         LIMIT $1`,
        [TOP_CHAIN_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as { key: string | null; total: string }[] });

  const [{ rows: totalRows }, { rows: countryRows }, { rows: cityRows }, { rows: categoryRows }, { rows: chainRows }] =
    await Promise.all([totalPromise, countriesPromise, citiesPromise, categoriesPromise, chainsPromise]);

  const chains = chainRows.reduce<Record<string, number>>((acc, row) => {
    if (!row.key) return acc;
    const total = Number(row.total ?? 0);
    if (Number.isFinite(total)) {
      acc[row.key] = total;
    }
    return acc;
  }, {});

  return limitedResponse({
    total_places: Number(totalRows[0]?.total ?? 0),
    countries: Number(countryRows[0]?.total ?? 0),
    cities: Number(cityRows[0]?.total ?? 0),
    categories: Number(categoryRows[0]?.total ?? 0),
    chains,
  });
};

const loadStatsFromDb = async (route: string): Promise<StatsApiResponse> => {
  const cacheExists = await tableExists(route, "stats_cache");
  if (cacheExists) {
    const { rows } = await dbQuery<CacheRow>(
      `SELECT total_places, total_countries, total_cities, category_breakdown, chain_breakdown, generated_at
       FROM stats_cache
       ORDER BY generated_at DESC
       LIMIT 1`,
      [],
      { route },
    );

    if (rows[0]) {
      return responseFromCache(rows[0]);
    }
  }

  return responseFromDbFallback(route);
};

export async function GET() {
  const route = "api_stats";
  const dataSource = getDataSourceSetting();
  const hasDb = hasDatabaseUrl();
  let statsResponse: StatsApiResponse | null = null;
  let dbError: unknown;

  if (dataSource !== "json" && hasDb) {
    try {
      statsResponse = await withDbTimeout(loadStatsFromDb(route), {
        message: "DB_TIMEOUT",
      });
    } catch (error) {
      dbError = error;
      if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
        console.error("[stats] database unavailable, serving limited stats");
      } else {
        console.error("[stats] failed to load stats", error);
      }
    }
  }

  const decision = resolveDataSourceDecision({
    setting: dataSource,
    hasDb,
    dbResult: statsResponse,
    dbError,
  });

  if (decision.source === "db") {
    const response = statsResponse ?? limitedResponse();
    const limited = (decision.limited ?? false) || (response.limited ?? false);
    return NextResponse.json<StatsApiResponse>(response, {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", limited) },
    });
  }

  const fallbackResponse = responseFromPlaces();
  const limited = decision.limited || fallbackResponse.limited;
  return NextResponse.json<StatsApiResponse>(fallbackResponse, {
    headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", limited) },
  });
}
