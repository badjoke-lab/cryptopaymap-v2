import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery } from "@/lib/db";
import { places } from "@/lib/data/places";
import { computeDashboardStats } from "@/lib/stats/aggregate";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";

export const revalidate = 7200;

// Response shape for GET /api/stats.
export type StatsApiResponse = {
  total_places: number;
  total_count: number;
  countries: number;
  cities: number;
  categories: number;
  chains: Record<string, number>;
  verification_breakdown: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
    verified: number;
  };
  top_chains: Array<{ key: string; count: number }>;
  top_assets: Array<{ key: string; count: number }>;
  category_ranking: Array<{ key: string; count: number }>;
  country_ranking: Array<{ key: string; count: number }>;
  city_ranking: Array<{ key: string; count: number }>;
  asset_acceptance_matrix: {
    assets: string[];
    chains: string[];
    rows: Array<{ asset: string; total: number; counts: Record<string, number> }>;
  };
  accepting_any_count: number;
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
const TOP_RANKING_LIMIT = 10;
const TOP_MATRIX_LIMIT = 20;

const EMPTY_VERIFICATION_BREAKDOWN: StatsApiResponse["verification_breakdown"] = {
  owner: 0,
  community: 0,
  directory: 0,
  unverified: 0,
  verified: 0,
};

const EMPTY_MATRIX: StatsApiResponse["asset_acceptance_matrix"] = {
  assets: [],
  chains: [],
  rows: [],
};

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
  total_count: 0,
  countries: 0,
  cities: 0,
  categories: 0,
  chains: {},
  verification_breakdown: EMPTY_VERIFICATION_BREAKDOWN,
  top_chains: [],
  top_assets: [],
  category_ranking: [],
  country_ranking: [],
  city_ranking: [],
  asset_acceptance_matrix: EMPTY_MATRIX,
  accepting_any_count: 0,
  limited: true,
  ...overrides,
});

const responseFromCache = (row: CacheRow): StatsApiResponse => {
  const categoryBreakdown = normalizeBreakdown(row.category_breakdown);
  return {
    total_places: Number(row.total_places ?? 0),
    total_count: Number(row.total_places ?? 0),
    countries: Number(row.total_countries ?? 0),
    cities: Number(row.total_cities ?? 0),
    categories: Object.keys(categoryBreakdown).length,
    chains: normalizeBreakdown(row.chain_breakdown),
    verification_breakdown: EMPTY_VERIFICATION_BREAKDOWN,
    top_chains: [],
    top_assets: [],
    category_ranking: [],
    country_ranking: [],
    city_ranking: [],
    asset_acceptance_matrix: EMPTY_MATRIX,
    accepting_any_count: 0,
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

  const byCity = places.reduce<Record<string, number>>((acc, place) => {
    const city = place.city?.trim();
    const country = place.country?.trim();
    const key = city && country ? `${city}, ${country}` : city;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const assetCounts = places.reduce<Record<string, number>>((acc, place) => {
    for (const asset of place.accepted ?? []) {
      const normalized = asset.trim();
      if (!normalized) continue;
      acc[normalized] = (acc[normalized] ?? 0) + 1;
    }
    return acc;
  }, {});

  return limitedResponse({
    total_places: kpi.totalPlaces,
    total_count: kpi.totalPlaces,
    countries: byCountry.length,
    cities: cityCount,
    categories: byCategory.length,
    chains,
    verification_breakdown: withVerifiedTotal(
      places.reduce<StatsApiResponse["verification_breakdown"]>((acc, place) => {
        if (place.verification === "owner") acc.owner += 1;
        else if (place.verification === "community") acc.community += 1;
        else if (place.verification === "directory") acc.directory += 1;
        else acc.unverified += 1;
        return acc;
      }, { ...EMPTY_VERIFICATION_BREAKDOWN }),
    ),
    category_ranking: byCategory.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.category, count: entry.total })),
    country_ranking: byCountry.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.country, count: entry.total })),
    city_ranking: Object.entries(byCity)
      .map(([key, count]) => ({ key, count: Number(count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, TOP_RANKING_LIMIT),
    top_chains: byChain.slice(0, TOP_CHAIN_LIMIT).map((entry) => ({ key: entry.chain, count: entry.total })),
    top_assets: Object.entries(assetCounts)
      .map(([key, count]) => ({ key, count: Number(count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, TOP_CHAIN_LIMIT),
    accepting_any_count: places.filter((place) => (place.accepted ?? []).length > 0).length,
  });
};

const withVerifiedTotal = (breakdown: StatsApiResponse["verification_breakdown"]) => ({
  ...breakdown,
  verified: breakdown.owner + breakdown.community + breakdown.directory,
});

const parseRankingRows = (rows: Array<{ key: string | null; total: string | number }>) =>
  rows
    .map((row) => ({ key: row.key?.trim() ?? "", count: Number(row.total ?? 0) }))
    .filter((row) => Boolean(row.key) && Number.isFinite(row.count) && row.count > 0);

const fetchDbSnapshotV4 = async (route: string): Promise<Partial<StatsApiResponse>> => {
  const placesTableExists = await tableExists(route, "places");
  if (!placesTableExists) {
    return {
      verification_breakdown: EMPTY_VERIFICATION_BREAKDOWN,
      top_chains: [],
      top_assets: [],
      category_ranking: [],
      country_ranking: [],
      city_ranking: [],
      asset_acceptance_matrix: EMPTY_MATRIX,
      accepting_any_count: 0,
    };
  }

  const hasVerifications = await tableExists(route, "verifications");
  const verificationColumn = hasVerifications
    ? (await hasColumn(route, "verifications", "level"))
      ? "level"
      : (await hasColumn(route, "verifications", "status"))
        ? "status"
        : null
    : null;

  const [hasCountry, hasCity, hasCategory] = await Promise.all([
    hasColumn(route, "places", "country"),
    hasColumn(route, "places", "city"),
    hasColumn(route, "places", "category"),
  ]);

  const hasPayments = await tableExists(route, "payment_accepts");
  const [hasPaymentPlaceId, hasPaymentChain, hasPaymentAsset] = hasPayments
    ? await Promise.all([
        hasColumn(route, "payment_accepts", "place_id"),
        hasColumn(route, "payment_accepts", "chain"),
        hasColumn(route, "payment_accepts", "asset"),
      ])
    : [false, false, false];

  const verificationPromise = verificationColumn
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT COALESCE(NULLIF(BTRIM(v.${verificationColumn}), ''), 'unverified') AS key, COUNT(*) AS total
         FROM places p
         LEFT JOIN verifications v ON v.place_id = p.id
         GROUP BY 1`,
        [],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const categoryPromise = hasCategory
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT NULLIF(BTRIM(category), '') AS key, COUNT(*) AS total
         FROM places
         WHERE NULLIF(BTRIM(category), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT $1`,
        [TOP_RANKING_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const countryPromise = hasCountry
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT NULLIF(BTRIM(country), '') AS key, COUNT(*) AS total
         FROM places
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT $1`,
        [TOP_RANKING_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const cityPromise = hasCity
    ? dbQuery<{ key: string | null; total: string }>(
        hasCountry
          ? `SELECT CONCAT(NULLIF(BTRIM(city), ''), ', ', NULLIF(BTRIM(country), '')) AS key, COUNT(*) AS total
             FROM places
             WHERE NULLIF(BTRIM(city), '') IS NOT NULL
               AND NULLIF(BTRIM(country), '') IS NOT NULL
             GROUP BY 1
             ORDER BY COUNT(*) DESC, key ASC
             LIMIT $1`
          : `SELECT NULLIF(BTRIM(city), '') AS key, COUNT(*) AS total
             FROM places
             WHERE NULLIF(BTRIM(city), '') IS NOT NULL
             GROUP BY 1
             ORDER BY COUNT(*) DESC, key ASC
             LIMIT $1`,
        [TOP_RANKING_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const chainPromise = hasPayments && hasPaymentChain
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT NULLIF(BTRIM(chain), '') AS key, COUNT(*) AS total
         FROM payment_accepts
         WHERE NULLIF(BTRIM(chain), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT $1`,
        [TOP_CHAIN_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const assetPromise = hasPayments && hasPaymentAsset
    ? dbQuery<{ key: string | null; total: string }>(
        `SELECT NULLIF(BTRIM(asset), '') AS key, COUNT(*) AS total
         FROM payment_accepts
         WHERE NULLIF(BTRIM(asset), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT $1`,
        [TOP_CHAIN_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const acceptingAnyPromise = hasPayments && hasPaymentPlaceId && (hasPaymentChain || hasPaymentAsset)
    ? dbQuery<{ total: string }>(
        `SELECT COUNT(DISTINCT place_id) AS total
         FROM payment_accepts
         WHERE NULLIF(BTRIM(COALESCE(chain, '')), '') IS NOT NULL
            OR NULLIF(BTRIM(COALESCE(asset, '')), '') IS NOT NULL`,
        [],
        { route },
      )
    : Promise.resolve({ rows: [{ total: "0" }] as Array<{ total: string }> });

  const matrixPromise = hasPayments && hasPaymentAsset && hasPaymentChain
    ? dbQuery<{ asset: string | null; chain: string | null; total: string }>(
        `SELECT NULLIF(BTRIM(asset), '') AS asset, NULLIF(BTRIM(chain), '') AS chain, COUNT(*) AS total
         FROM payment_accepts
         WHERE NULLIF(BTRIM(asset), '') IS NOT NULL
           AND NULLIF(BTRIM(chain), '') IS NOT NULL
         GROUP BY 1, 2
         ORDER BY COUNT(*) DESC, asset ASC, chain ASC
         LIMIT $1`,
        [TOP_MATRIX_LIMIT * TOP_MATRIX_LIMIT],
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ asset: string | null; chain: string | null; total: string }> });

  const [verificationRows, categoryRows, countryRows, cityRows, chainRows, assetRows, acceptingAnyRows, matrixRows] =
    await Promise.all([
      verificationPromise,
      categoryPromise,
      countryPromise,
      cityPromise,
      chainPromise,
      assetPromise,
      acceptingAnyPromise,
      matrixPromise,
    ]);

  const verificationBreakdown = verificationRows.rows.reduce(
    (acc, row) => {
      const total = Number(row.total ?? 0);
      if (!Number.isFinite(total)) return acc;
      if (row.key === "owner") acc.owner = total;
      if (row.key === "community") acc.community = total;
      if (row.key === "directory") acc.directory = total;
      if (row.key === "unverified") acc.unverified = total;
      return acc;
    },
    { ...EMPTY_VERIFICATION_BREAKDOWN },
  );

  const topAssets = parseRankingRows(assetRows.rows);
  const topChains = parseRankingRows(chainRows.rows);

  const matrixAssets = new Set(topAssets.slice(0, TOP_MATRIX_LIMIT).map((row) => row.key));
  const matrixChains = new Set(topChains.slice(0, TOP_MATRIX_LIMIT).map((row) => row.key));
  const rowMap = new Map<string, { asset: string; total: number; counts: Record<string, number> }>();
  for (const row of matrixRows.rows) {
    const asset = row.asset?.trim();
    const chain = row.chain?.trim();
    const total = Number(row.total ?? 0);
    if (!asset || !chain || !Number.isFinite(total) || total <= 0) continue;
    matrixAssets.add(asset);
    matrixChains.add(chain);
    const existing = rowMap.get(asset) ?? { asset, total: 0, counts: {} };
    existing.counts[chain] = total;
    existing.total += total;
    rowMap.set(asset, existing);
  }

  return {
    verification_breakdown: withVerifiedTotal(verificationBreakdown),
    top_chains: topChains,
    top_assets: topAssets,
    category_ranking: parseRankingRows(categoryRows.rows),
    country_ranking: parseRankingRows(countryRows.rows),
    city_ranking: parseRankingRows(cityRows.rows),
    asset_acceptance_matrix: {
      assets: Array.from(matrixAssets).sort((a, b) => a.localeCompare(b)),
      chains: Array.from(matrixChains).sort((a, b) => a.localeCompare(b)),
      rows: Array.from(rowMap.values()).sort((a, b) => b.total - a.total || a.asset.localeCompare(b.asset)),
    },
    accepting_any_count: Number(acceptingAnyRows.rows[0]?.total ?? 0),
  };
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
    total_count: Number(totalRows[0]?.total ?? 0),
    countries: Number(countryRows[0]?.total ?? 0),
    cities: Number(cityRows[0]?.total ?? 0),
    categories: Number(categoryRows[0]?.total ?? 0),
    chains,
  });
};

const loadStatsFromDb = async (route: string): Promise<StatsApiResponse> => {
  const v4StatsPromise = fetchDbSnapshotV4(route);
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
      return {
        ...responseFromCache(rows[0]),
        ...(await v4StatsPromise),
      };
    }
  }

  return {
    ...(await responseFromDbFallback(route)),
    ...(await v4StatsPromise),
  };
};

export async function GET() {
  const route = "api_stats";
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson, hasDb } = getDataSourceContext(dataSource);

  if (!hasDb && dataSource === "db") {
    return NextResponse.json<StatsApiResponse>(limitedResponse(), {
      status: 503,
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", true) },
    });
  }

  if (!shouldAttemptDb) {
    return NextResponse.json<StatsApiResponse>(responseFromPlaces(), {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
    });
  }

  try {
    const statsResponse = await withDbTimeout(loadStatsFromDb(route), {
      message: "DB_TIMEOUT",
    });
    return NextResponse.json<StatsApiResponse>(statsResponse, {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", false) },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      console.error("[stats] database unavailable, serving limited stats");
    } else {
      console.error("[stats] failed to load stats", error);
    }

    if (!shouldAllowJson) {
      return NextResponse.json<StatsApiResponse>(limitedResponse(), {
        status: 503,
        headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", true) },
      });
    }

    return NextResponse.json<StatsApiResponse>(responseFromPlaces(), {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
    });
  }
}
