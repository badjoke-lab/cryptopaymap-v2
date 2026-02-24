import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery } from "@/lib/db";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import {
  MAP_POPULATION_CTE,
  MAP_POPULATION_WHERE_VERSION,
  getMapPopulationWhereClauses,
  normalizeVerificationSql,
} from "@/lib/population/mapPopulationWhere";

export const revalidate = 7200;

type StatsFilters = {
  country: string;
  city: string;
  category: string;
  accepted: string;
  verification: string;
  promoted: string;
  source: string;
};

export type StatsApiResponse = {
  total_places: number;
  total_count: number;
  countries: number;
  cities: number;
  categories: number;
  chains: Record<string, number>;
  breakdown: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
  };
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
  meta: {
    population: "map_pop";
    where_version: "pr253";
    limited: boolean;
    source: "db" | "fallback";
  };
  generated_at?: string;
  limited?: boolean;
};

const CACHE_CONTROL = "public, s-maxage=7200, stale-while-revalidate=600";
const TOP_CHAIN_LIMIT = 50;
const TOP_RANKING_LIMIT = 10;
const TOP_MATRIX_LIMIT = 20;
const FILTER_KEYS: Array<keyof StatsFilters> = ["country", "city", "category", "accepted", "verification", "promoted", "source"];

const EMPTY_VERIFICATION_BREAKDOWN: StatsApiResponse["verification_breakdown"] = {
  owner: 0,
  community: 0,
  directory: 0,
  unverified: 0,
  verified: 0,
};

const EMPTY_BREAKDOWN: StatsApiResponse["breakdown"] = {
  owner: 0,
  community: 0,
  directory: 0,
  unverified: 0,
};

const EMPTY_MATRIX: StatsApiResponse["asset_acceptance_matrix"] = {
  assets: [],
  chains: [],
  rows: [],
};

const EMPTY_FILTERS: StatsFilters = {
  country: "",
  city: "",
  category: "",
  accepted: "",
  verification: "",
  promoted: "",
  source: "",
};

const normalizeFilterValue = (value: string | null) => (value ?? "").trim();

const parseFilters = (request: Request): StatsFilters => {
  const url = new URL(request.url);
  const filters = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) {
    filters[key] = normalizeFilterValue(url.searchParams.get(key));
  }
  return filters;
};

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>("SELECT to_regclass($1) AS present", [`public.${table}`], { route });
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

const withVerifiedTotal = (breakdown: StatsApiResponse["verification_breakdown"]) => ({
  ...breakdown,
  verified: breakdown.owner + breakdown.community + breakdown.directory,
});

const parseRankingRows = (rows: Array<{ key: string | null; total: string | number }>) =>
  rows
    .map((row) => ({ key: row.key?.trim() ?? "", count: Number(row.total ?? 0) }))
    .filter((row) => Boolean(row.key) && Number.isFinite(row.count) && row.count > 0);

const limitedResponse = (source: "db" | "fallback"): StatsApiResponse => ({
  total_places: 0,
  total_count: 0,
  countries: 0,
  cities: 0,
  categories: 0,
  chains: {},
  breakdown: { ...EMPTY_BREAKDOWN },
  verification_breakdown: { ...EMPTY_VERIFICATION_BREAKDOWN },
  top_chains: [],
  top_assets: [],
  category_ranking: [],
  country_ranking: [],
  city_ranking: [],
  asset_acceptance_matrix: { ...EMPTY_MATRIX },
  accepting_any_count: 0,
  limited: true,
  meta: {
    population: "map_pop",
    where_version: MAP_POPULATION_WHERE_VERSION,
    limited: true,
    source,
  },
});

type FilterSqlOptions = {
  hasCountry: boolean;
  hasCity: boolean;
  hasCategory: boolean;
  hasPromoted: boolean;
  hasSource: boolean;
  hasPaymentPlaceId: boolean;
  hasPaymentChain: boolean;
  hasPaymentAsset: boolean;
  verificationColumn: string | null;
};

const buildMapPopWhereClause = (filters: StatsFilters, options: FilterSqlOptions) => {
  const params: Array<string | boolean> = [];
  const clauses: string[] = [...getMapPopulationWhereClauses("p")];

  const addParam = (value: string | boolean) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.country && options.hasCountry) clauses.push(`NULLIF(BTRIM(p.country), '') = ${addParam(filters.country)}`);
  if (filters.city && options.hasCity) clauses.push(`NULLIF(BTRIM(p.city), '') = ${addParam(filters.city)}`);
  if (filters.category && options.hasCategory) clauses.push(`NULLIF(BTRIM(p.category), '') = ${addParam(filters.category)}`);
  if (filters.promoted && options.hasPromoted) clauses.push(`COALESCE(p.promoted, FALSE) = ${addParam(filters.promoted === "true")}`);
  if (filters.source && options.hasSource) clauses.push(`NULLIF(BTRIM(COALESCE(p.source, '')), '') = ${addParam(filters.source)}`);

  if (filters.verification && options.verificationColumn) {
    clauses.push(`COALESCE((SELECT ${normalizeVerificationSql(`v.${options.verificationColumn}`)}
      FROM verifications v
      WHERE v.place_id = p.id
      ORDER BY CASE ${normalizeVerificationSql(`v.${options.verificationColumn}`)}
        WHEN 'owner' THEN 1
        WHEN 'community' THEN 2
        WHEN 'directory' THEN 3
        ELSE 4
      END
      LIMIT 1), 'unverified') = ${addParam(filters.verification)}`);
  }

  if (filters.accepted && options.hasPaymentPlaceId && (options.hasPaymentChain || options.hasPaymentAsset)) {
    clauses.push(`EXISTS (
      SELECT 1
      FROM payment_accepts pa
      WHERE pa.place_id = p.id
      AND (
        ${options.hasPaymentChain ? `LOWER(NULLIF(BTRIM(COALESCE(pa.chain, '')), '')) = LOWER(${addParam(filters.accepted)})` : "FALSE"}
        OR ${options.hasPaymentAsset ? `LOWER(NULLIF(BTRIM(COALESCE(pa.asset, '')), '')) = LOWER(${addParam(filters.accepted)})` : "FALSE"}
      )
    )`);
  }

  return {
    params,
    whereClause: clauses.join(" AND "),
  };
};

const buildMapPopCte = (whereClause: string) => `WITH ${MAP_POPULATION_CTE} AS (
  SELECT p.id, p.country, p.city, p.category
  FROM places p
  WHERE ${whereClause}
)`;

const loadStatsFromDb = async (route: string, filters: StatsFilters): Promise<StatsApiResponse> => {
  const placesTableExists = await tableExists(route, "places");
  if (!placesTableExists) return limitedResponse("fallback");

  const hasVerifications = await tableExists(route, "verifications");
  const verificationColumn = hasVerifications
    ? (await hasColumn(route, "verifications", "level"))
      ? "level"
      : (await hasColumn(route, "verifications", "status"))
        ? "status"
        : null
    : null;

  const [hasCountry, hasCity, hasCategory, hasPromoted, hasSource] = await Promise.all([
    hasColumn(route, "places", "country"),
    hasColumn(route, "places", "city"),
    hasColumn(route, "places", "category"),
    hasColumn(route, "places", "promoted"),
    hasColumn(route, "places", "source"),
  ]);

  const hasPayments = await tableExists(route, "payment_accepts");
  const [hasPaymentPlaceId, hasPaymentChain, hasPaymentAsset] = hasPayments
    ? await Promise.all([
        hasColumn(route, "payment_accepts", "place_id"),
        hasColumn(route, "payment_accepts", "chain"),
        hasColumn(route, "payment_accepts", "asset"),
      ])
    : [false, false, false];

  const { whereClause, params } = buildMapPopWhereClause(filters, {
    hasCountry,
    hasCity,
    hasCategory,
    hasPromoted,
    hasSource,
    hasPaymentPlaceId,
    hasPaymentChain,
    hasPaymentAsset,
    verificationColumn,
  });

  const mapPopCte = buildMapPopCte(whereClause);

  const totalsPromise = dbQuery<{ total_places: string; countries: string; cities: string; categories: string }>(
    `${mapPopCte}
     SELECT
       COUNT(*) AS total_places,
       COUNT(DISTINCT NULLIF(BTRIM(country), '')) AS countries,
       COUNT(DISTINCT (NULLIF(BTRIM(country), ''), NULLIF(BTRIM(city), ''))) FILTER (
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
           AND NULLIF(BTRIM(city), '') IS NOT NULL
       ) AS cities,
       COUNT(DISTINCT NULLIF(BTRIM(category), '')) AS categories
     FROM ${MAP_POPULATION_CTE}`,
    params,
    { route },
  );

  const verificationPromise = verificationColumn
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         SELECT COALESCE(vs.key, 'unverified') AS key, COUNT(*) AS total
         FROM ${MAP_POPULATION_CTE} p
         LEFT JOIN LATERAL (
           SELECT ${normalizeVerificationSql(`v.${verificationColumn}`)} AS key
           FROM verifications v
           WHERE v.place_id = p.id
           ORDER BY CASE ${normalizeVerificationSql(`v.${verificationColumn}`)}
             WHEN 'owner' THEN 1
             WHEN 'community' THEN 2
             WHEN 'directory' THEN 3
             ELSE 4
           END
           LIMIT 1
         ) vs ON TRUE
         GROUP BY 1`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const categoryPromise = hasCategory
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(BTRIM(category), '') AS key, COUNT(*) AS total
         FROM ${MAP_POPULATION_CTE}
         WHERE NULLIF(BTRIM(category), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const countryPromise = hasCountry
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(BTRIM(country), '') AS key, COUNT(*) AS total
         FROM ${MAP_POPULATION_CTE}
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const cityPromise = hasCity
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         ${hasCountry
           ? `SELECT CONCAT(NULLIF(BTRIM(city), ''), ', ', NULLIF(BTRIM(country), '')) AS key, COUNT(*) AS total
              FROM ${MAP_POPULATION_CTE}
              WHERE NULLIF(BTRIM(city), '') IS NOT NULL
                AND NULLIF(BTRIM(country), '') IS NOT NULL`
           : `SELECT NULLIF(BTRIM(city), '') AS key, COUNT(*) AS total
              FROM ${MAP_POPULATION_CTE}
              WHERE NULLIF(BTRIM(city), '') IS NOT NULL`}
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const chainPromise = hasPayments && hasPaymentChain && hasPaymentPlaceId
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(BTRIM(pa.chain), '') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.chain), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_CHAIN_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const assetPromise = hasPayments && hasPaymentAsset && hasPaymentPlaceId
    ? dbQuery<{ key: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(BTRIM(pa.asset), '') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_CHAIN_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const acceptingAnyPromise = hasPayments && hasPaymentPlaceId && (hasPaymentChain || hasPaymentAsset)
    ? dbQuery<{ total: string }>(
        `${mapPopCte}
         SELECT COUNT(DISTINCT pa.place_id) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE ${hasPaymentChain ? "NULLIF(BTRIM(COALESCE(pa.chain, '')), '') IS NOT NULL" : "FALSE"}
            OR ${hasPaymentAsset ? "NULLIF(BTRIM(COALESCE(pa.asset, '')), '') IS NOT NULL" : "FALSE"}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [{ total: "0" }] as Array<{ total: string }> });

  const matrixPromise = hasPayments && hasPaymentAsset && hasPaymentChain && hasPaymentPlaceId
    ? dbQuery<{ asset: string | null; chain: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(BTRIM(pa.asset), '') AS asset, NULLIF(BTRIM(pa.chain), '') AS chain, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
           AND NULLIF(BTRIM(pa.chain), '') IS NOT NULL
         GROUP BY 1, 2
         ORDER BY COUNT(*) DESC, asset ASC, chain ASC
         LIMIT ${TOP_MATRIX_LIMIT * TOP_MATRIX_LIMIT}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [] as Array<{ asset: string | null; chain: string | null; total: string }> });

  const [totalsRows, verificationRows, categoryRows, countryRows, cityRows, chainRows, assetRows, acceptingAnyRows, matrixRows] =
    await Promise.all([
      totalsPromise,
      verificationPromise,
      categoryPromise,
      countryPromise,
      cityPromise,
      chainPromise,
      assetPromise,
      acceptingAnyPromise,
      matrixPromise,
    ]);

  const breakdown = verificationRows.rows.reduce(
    (acc, row) => {
      const total = Number(row.total ?? 0);
      if (!Number.isFinite(total)) return acc;
      if (row.key === "owner") acc.owner = total;
      if (row.key === "community") acc.community = total;
      if (row.key === "directory") acc.directory = total;
      if (row.key === "unverified") acc.unverified = total;
      return acc;
    },
    { ...EMPTY_BREAKDOWN },
  );

  const totalCount = Number(totalsRows.rows[0]?.total_places ?? 0);
  const breakdownTotal = breakdown.owner + breakdown.community + breakdown.directory + breakdown.unverified;
  if (breakdownTotal !== totalCount) {
    console.error("[stats] verification breakdown mismatch", { totalCount, breakdownTotal, breakdown });
  }

  const topAssets = parseRankingRows(assetRows.rows);
  const topChains = parseRankingRows(chainRows.rows);
  const chains = topChains.reduce<Record<string, number>>((acc, row) => {
    acc[row.key] = row.count;
    return acc;
  }, {});

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
    total_places: totalCount,
    total_count: totalCount,
    countries: Number(totalsRows.rows[0]?.countries ?? 0),
    cities: Number(totalsRows.rows[0]?.cities ?? 0),
    categories: Number(totalsRows.rows[0]?.categories ?? 0),
    chains,
    breakdown,
    verification_breakdown: withVerifiedTotal({ ...breakdown, verified: 0 }),
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
    meta: {
      population: "map_pop",
      where_version: MAP_POPULATION_WHERE_VERSION,
      limited: false,
      source: "db",
    },
    limited: false,
  };
};

export async function GET(request: Request) {
  const filters = parseFilters(request);
  const route = "api_stats";
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, hasDb } = getDataSourceContext(dataSource);

  if (!hasDb || !shouldAttemptDb) {
    const response = limitedResponse("fallback");
    return NextResponse.json<StatsApiResponse>(response, {
      status: 503,
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
    });
  }

  try {
    const statsResponse = await withDbTimeout(loadStatsFromDb(route, filters), {
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

    return NextResponse.json<StatsApiResponse>(limitedResponse("fallback"), {
      status: 503,
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", true) },
    });
  }
}
