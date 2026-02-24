import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

import { DbUnavailableError, dbQuery } from "@/lib/db";
import { places } from "@/lib/data/places";
import {
  buildDataSourceHeaders,
  getDataSourceContext,
  getDataSourceSetting,
  withDbTimeout,
} from "@/lib/dataSource";
import { getMapDisplayableWhereClauses, isMapDisplayablePlace } from "@/lib/stats/mapPopulation";
import { normalizeAcceptanceChainKey } from "@/lib/stats/acceptance";

export const revalidate = 7200;

const MAP_POPULATION_ID = "places:map_population:v2" as const;

type StatsFilters = {
  country: string;
  city: string;
  category: string;
  accepted: string;
  verification: string;
  promoted: string;
  source: string;
};

// Response shape for GET /api/stats.
export type StatsApiResponse = {
  ok?: true;
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
  generated_at?: string;
  limited?: boolean;
  meta?: {
    source: "db_live";
    population_id: typeof MAP_POPULATION_ID;
    as_of: string;
    acceptance_chain_missing_places: number;
    acceptance_unknown_chain_included: true;
  };
};

type StatsUnavailableResponse = {
  ok: false;
  error: "stats_unavailable";
  reason: "db_error";
};

const CACHE_CONTROL = "public, s-maxage=7200, stale-while-revalidate=600";
const NO_STORE = "no-store";
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

const limitedResponse = (overrides: Partial<StatsApiResponse> = {}): StatsApiResponse => ({
  total_places: 0,
  total_count: 0,
  countries: 0,
  cities: 0,
  categories: 0,
  chains: {},
  breakdown: EMPTY_BREAKDOWN,
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

const loadPlacesFromJsonFallback = async () => {
  const filePath = path.join(process.cwd(), "data", "places.json");
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("INVALID_PLACES_JSON");
  }
  return parsed;
};

const responseFromPlaces = (filters: StatsFilters, sourcePlaces: typeof places): StatsApiResponse => {
  const filteredPlaces = sourcePlaces.filter((place) => {
    if (!isMapDisplayablePlace(place)) return false;

    if (filters.country && (place.country ?? "").trim() !== filters.country) return false;
    if (filters.city && (place.city ?? "").trim() !== filters.city) return false;
    if (filters.category && (place.category ?? "").trim() !== filters.category) return false;

    if (filters.verification) {
      const verification = (place.verification ?? "unverified").trim();
      if (verification !== filters.verification) return false;
    }

    if (filters.accepted) {
      const accepted = (place.accepted ?? place.supported_crypto ?? []).map((value) => value.trim().toLowerCase());
      if (!accepted.includes(filters.accepted.toLowerCase())) return false;
    }

    return true;
  });

  const byCountry = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const key = (place.country ?? "").trim();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byCategory = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const key = (place.category ?? "").trim();
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const cityCount = new Set(
    filteredPlaces
      .map((place) => {
        const country = place.country?.trim();
        const city = place.city?.trim();
        if (!country || !city) return null;
        return `${country}::${city}`;
      })
      .filter(Boolean),
  ).size;

  const byCity = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const city = place.city?.trim();
    const country = place.country?.trim();
    const key = city && country ? `${city}, ${country}` : city;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const chainCounts = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    for (const asset of place.accepted ?? place.supported_crypto ?? []) {
      const normalized = asset.trim();
      if (!normalized) continue;
      acc[normalized] = (acc[normalized] ?? 0) + 1;
    }
    return acc;
  }, {});

  const sortedChains = Object.entries(chainCounts)
    .map(([chain, total]) => ({ chain, total: Number(total) }))
    .sort((a, b) => b.total - a.total || a.chain.localeCompare(b.chain));

  const sortedCategories = Object.entries(byCategory)
    .map(([category, total]) => ({ category, total: Number(total) }))
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));

  const sortedCountries = Object.entries(byCountry)
    .map(([country, total]) => ({ country, total: Number(total) }))
    .sort((a, b) => b.total - a.total || a.country.localeCompare(b.country));

  const assetCounts = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    for (const asset of place.accepted ?? place.supported_crypto ?? []) {
      const normalized = asset.trim();
      if (!normalized) continue;
      acc[normalized] = (acc[normalized] ?? 0) + 1;
    }
    return acc;
  }, {});

  const breakdown = filteredPlaces.reduce<StatsApiResponse["breakdown"]>((acc, place) => {
    if (place.verification === "owner") acc.owner += 1;
    else if (place.verification === "community") acc.community += 1;
    else if (place.verification === "directory") acc.directory += 1;
    else acc.unverified += 1;
    return acc;
  }, { ...EMPTY_BREAKDOWN });

  const totalCount = filteredPlaces.length;
  const breakdownTotal = breakdown.owner + breakdown.community + breakdown.directory + breakdown.unverified;
  if (breakdownTotal !== totalCount) {
    console.error("[stats] verification breakdown mismatch (json)", { totalCount, breakdownTotal, breakdown });
  }

  return limitedResponse({
    total_places: filteredPlaces.length,
    total_count: filteredPlaces.length,
    countries: Object.keys(byCountry).length,
    cities: cityCount,
    categories: Object.keys(byCategory).length,
    chains: sortedChains.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.chain] = entry.total;
      return acc;
    }, {}),
    breakdown,
    verification_breakdown: withVerifiedTotal({ ...breakdown, verified: 0 }),
    top_chains: sortedChains.slice(0, TOP_CHAIN_LIMIT).map((entry) => ({ key: entry.chain, count: entry.total })),
    top_assets: Object.entries(assetCounts)
      .map(([key, count]) => ({ key, count: Number(count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, TOP_CHAIN_LIMIT),
    category_ranking: sortedCategories.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.category, count: entry.total })),
    country_ranking: sortedCountries.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.country, count: entry.total })),
    city_ranking: Object.entries(byCity)
      .map(([key, count]) => ({ key, count: Number(count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, TOP_RANKING_LIMIT),
    accepting_any_count: filteredPlaces.filter((place) => (place.accepted ?? place.supported_crypto ?? []).length > 0).length,
  });
};

const withVerifiedTotal = (breakdown: StatsApiResponse["verification_breakdown"]) => ({
  ...breakdown,
  verified: breakdown.owner + breakdown.community + breakdown.directory,
});

const normalizeVerificationSql = (columnSql: string) =>
  `CASE
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'owner' THEN 'owner'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'community' THEN 'community'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'directory' THEN 'directory'
    ELSE 'unverified'
  END`;


const parseRankingRows = (rows: Array<{ key: string | null; total: string | number }>) =>
  rows
    .map((row) => ({ key: row.key?.trim() ?? "", count: Number(row.total ?? 0) }))
    .filter((row) => Boolean(row.key) && Number.isFinite(row.count) && row.count > 0);

type FilteredPlacesCteOptions = {
  hasCountry: boolean;
  hasCity: boolean;
  hasCategory: boolean;
};

const buildFilteredPlacesCte = (whereClause: string, options: FilteredPlacesCteOptions) => {
  const baseClause = getMapDisplayableWhereClauses("p").join(" AND ");
  const dynamicClause = whereClause.replace(/^WHERE\s+/i, "").trim();
  const combinedWhere = [baseClause, dynamicClause].filter(Boolean).join(" AND ");

  const countrySql = options.hasCountry ? "p.country AS country" : "NULL::text AS country";
  const citySql = options.hasCity ? "p.city AS city" : "NULL::text AS city";
  const categorySql = options.hasCategory ? "p.category AS category" : "NULL::text AS category";

  return `WITH filtered_places AS (
      SELECT p.id, ${countrySql}, ${citySql}, ${categorySql}
      FROM places p
      WHERE ${combinedWhere}
    )`;
};

const quoteSqlValue = (value: unknown) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toFinalSqlForLog = (text: string, params: unknown[]) =>
  text.replace(/\$(\d+)/g, (_, position) => {
    const index = Number(position) - 1;
    if (index < 0 || index >= params.length) return `$${position}`;
    return quoteSqlValue(params[index]);
  });

const runStatsQuery = <T extends Record<string, unknown>>(
  label: string,
  sql: string,
  params: unknown[],
  route: string,
) => {
  const finalSql = toFinalSqlForLog(sql, params);
  return dbQuery<T>(sql, params, { route }).catch((error) => {
    console.error(`[stats] query failed: ${label}`, { finalSql, params, error });
    throw error;
  });
};

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

const buildFilterSql = (filters: StatsFilters, options: FilterSqlOptions) => {
  const params: Array<string | boolean> = [];
  const clauses: string[] = [];

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
        ${options.hasPaymentChain ? `LOWER(NULLIF(BTRIM(COALESCE(pa.chain, '')), '')) = LOWER(${addParam(filters.accepted)})` : 'FALSE'}
        OR ${options.hasPaymentAsset ? `LOWER(NULLIF(BTRIM(COALESCE(pa.asset, '')), '')) = LOWER(${addParam(filters.accepted)})` : 'FALSE'}
      )
    )`);
  }

  return {
    whereClause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
};

const fetchDbSnapshotV4 = async (route: string, filters: StatsFilters): Promise<StatsApiResponse> => {
  const placesTableExists = await tableExists(route, "places");
  if (!placesTableExists) {
    return limitedResponse({
      verification_breakdown: EMPTY_VERIFICATION_BREAKDOWN,
      top_chains: [],
      top_assets: [],
      category_ranking: [],
      country_ranking: [],
      city_ranking: [],
      asset_acceptance_matrix: EMPTY_MATRIX,
      accepting_any_count: 0,
    });
  }

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

  const { whereClause, params } = buildFilterSql(filters, {
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

  const filteredPlacesCte = buildFilteredPlacesCte(whereClause, { hasCountry, hasCity, hasCategory });

  const totalsSql = `${filteredPlacesCte}
     SELECT
       COUNT(*) AS total_places,
       COUNT(DISTINCT NULLIF(BTRIM(country), '')) AS countries,
       COUNT(DISTINCT (NULLIF(BTRIM(country), ''), NULLIF(BTRIM(city), ''))) FILTER (
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
           AND NULLIF(BTRIM(city), '') IS NOT NULL
       ) AS cities,
       COUNT(DISTINCT NULLIF(BTRIM(category), '')) AS categories
     FROM filtered_places`;
  const totalsPromise = runStatsQuery<{ total_places: string; countries: string; cities: string; categories: string }>(
    "totals",
    totalsSql,
    params,
    route,
  );

  const verificationPromise = verificationColumn
    ? runStatsQuery<{ key: string | null; total: string }>(
        "verification",
        `${filteredPlacesCte}
         SELECT COALESCE(vs.key, 'unverified') AS key, COUNT(*) AS total
         FROM filtered_places p
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
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const categoryPromise = hasCategory
    ? runStatsQuery<{ key: string | null; total: string }>(
        "category_ranking",
        `${filteredPlacesCte}
         SELECT NULLIF(BTRIM(category), '') AS key, COUNT(*) AS total
         FROM filtered_places
         WHERE NULLIF(BTRIM(category), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const countryPromise = hasCountry
    ? runStatsQuery<{ key: string | null; total: string }>(
        "country_ranking",
        `${filteredPlacesCte}
         SELECT NULLIF(BTRIM(country), '') AS key, COUNT(*) AS total
         FROM filtered_places
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const cityPromise = hasCity
    ? runStatsQuery<{ key: string | null; total: string }>(
        "city_ranking",
        `${filteredPlacesCte}
         ${hasCountry
           ? `SELECT CONCAT(NULLIF(BTRIM(city), ''), ', ', NULLIF(BTRIM(country), '')) AS key, COUNT(*) AS total
              FROM filtered_places
              WHERE NULLIF(BTRIM(city), '') IS NOT NULL
                AND NULLIF(BTRIM(country), '') IS NOT NULL`
           : `SELECT NULLIF(BTRIM(city), '') AS key, COUNT(*) AS total
              FROM filtered_places
              WHERE NULLIF(BTRIM(city), '') IS NOT NULL`}
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_RANKING_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const chainPromise = hasPayments && hasPaymentChain && hasPaymentPlaceId
    ? runStatsQuery<{ key: string | null; total: string }>(
        "top_chains",
        `${filteredPlacesCte}
         SELECT COALESCE(NULLIF(BTRIM(pa.chain), ''), 'unknown') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN filtered_places fp ON fp.id = pa.place_id
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_CHAIN_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const assetPromise = hasPayments && hasPaymentAsset && hasPaymentPlaceId
    ? runStatsQuery<{ key: string | null; total: string }>(
        "top_assets",
        `${filteredPlacesCte}
         SELECT NULLIF(BTRIM(pa.asset), '') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN filtered_places fp ON fp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
         GROUP BY 1
         ORDER BY COUNT(*) DESC, key ASC
         LIMIT ${TOP_CHAIN_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ key: string | null; total: string }> });

  const acceptingAnyPromise = hasPayments && hasPaymentPlaceId && (hasPaymentChain || hasPaymentAsset)
    ? runStatsQuery<{ total: string }>(
        "accepting_any_count",
        `${filteredPlacesCte}
         SELECT COUNT(DISTINCT pa.place_id) AS total
         FROM payment_accepts pa
         INNER JOIN filtered_places fp ON fp.id = pa.place_id
         WHERE ${hasPaymentChain ? "NULLIF(BTRIM(COALESCE(pa.chain, '')), '') IS NOT NULL" : "FALSE"}
            OR ${hasPaymentAsset ? "NULLIF(BTRIM(COALESCE(pa.asset, '')), '') IS NOT NULL" : "FALSE"}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [{ total: "0" }] as Array<{ total: string }> });

  const matrixPromise = hasPayments && hasPaymentAsset && hasPaymentChain && hasPaymentPlaceId
    ? runStatsQuery<{ asset: string | null; chain: string | null; total: string }>(
        "asset_acceptance_matrix",
        `${filteredPlacesCte}
         SELECT NULLIF(BTRIM(pa.asset), '') AS asset, COALESCE(NULLIF(BTRIM(pa.chain), ''), 'unknown') AS chain, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN filtered_places fp ON fp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
         GROUP BY 1, 2
         ORDER BY COUNT(*) DESC, asset ASC, chain ASC
         LIMIT ${TOP_MATRIX_LIMIT * TOP_MATRIX_LIMIT}`,
        params,
        route,
      )
    : Promise.resolve({ rows: [] as Array<{ asset: string | null; chain: string | null; total: string }> });

  const chainMissingPlacesPromise = hasPayments && hasPaymentAsset && hasPaymentChain && hasPaymentPlaceId
    ? runStatsQuery<{ total: string }>(
        "acceptance_chain_missing_places",
        `${filteredPlacesCte}
         SELECT COUNT(DISTINCT pa.place_id) AS total
         FROM payment_accepts pa
         INNER JOIN filtered_places fp ON fp.id = pa.place_id
         WHERE NULLIF(BTRIM(pa.asset), '') IS NOT NULL
           AND NULLIF(BTRIM(pa.chain), '') IS NULL`,
        params,
        route,
      )
    : Promise.resolve({ rows: [{ total: "0" }] as Array<{ total: string }> });

  const [totalsRows, verificationRows, categoryRows, countryRows, cityRows, chainRows, assetRows, acceptingAnyRows, matrixRows, chainMissingPlacesRows] =
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
      chainMissingPlacesPromise,
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
    console.error("[stats] verification breakdown mismatch (db)", { totalCount, breakdownTotal, breakdown });
  }

  const topAssets = parseRankingRows(assetRows.rows);
  const topChains = parseRankingRows(chainRows.rows).map((entry) => ({ ...entry, key: normalizeAcceptanceChainKey(entry.key) }));

  const matrixAssets = new Set(topAssets.slice(0, TOP_MATRIX_LIMIT).map((row) => row.key));
  const matrixChains = new Set(topChains.slice(0, TOP_MATRIX_LIMIT).map((row) => row.key));
  const rowMap = new Map<string, { asset: string; total: number; counts: Record<string, number> }>();
  for (const row of matrixRows.rows) {
    const asset = row.asset?.trim();
    const chain = normalizeAcceptanceChainKey(row.chain);
    const total = Number(row.total ?? 0);
    if (!asset || !Number.isFinite(total) || total <= 0) continue;
    matrixAssets.add(asset);
    matrixChains.add(chain);
    const existing = rowMap.get(asset) ?? { asset, total: 0, counts: {} };
    existing.counts[chain] = total;
    existing.total += total;
    rowMap.set(asset, existing);
  }

  const chains = topChains.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.key] = entry.count;
    return acc;
  }, {});

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
      source: "db_live",
      population_id: MAP_POPULATION_ID,
      as_of: new Date().toISOString(),
      acceptance_chain_missing_places: Number(chainMissingPlacesRows.rows[0]?.total ?? 0),
      acceptance_unknown_chain_included: true,
    },
  };
};

const loadStatsFromDb = async (route: string, filters: StatsFilters): Promise<StatsApiResponse> => {
  return fetchDbSnapshotV4(route, filters);
};

export async function GET(request: Request) {
  const filters = parseFilters(request);
  const route = "api_stats";
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson, hasDb } = getDataSourceContext(dataSource);

  if (!hasDb && dataSource === "db") {
    return NextResponse.json<StatsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
      status: 503,
      headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
    });
  }

  if (!shouldAttemptDb) {
    // Production must never use JSON fallback for stats.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json<StatsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
        status: 503,
        headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
      });
    }

    try {
      const jsonPlaces = await loadPlacesFromJsonFallback();
      return NextResponse.json<StatsApiResponse>({
        ...responseFromPlaces(filters, jsonPlaces),
        ok: true,
        meta: {
          source: "db_live",
          population_id: MAP_POPULATION_ID,
          as_of: new Date().toISOString(),
          acceptance_chain_missing_places: 0,
          acceptance_unknown_chain_included: true,
        },
      }, {
        headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
      });
    } catch (error) {
      console.error("[stats] failed to load JSON fallback", error);
      return NextResponse.json<StatsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
        status: 503,
        headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
      });
    }
  }

  try {
    const statsResponse = await withDbTimeout(loadStatsFromDb(route, filters), {
      message: "DB_TIMEOUT",
    });
    return NextResponse.json<StatsApiResponse>({
      ...statsResponse,
      ok: true,
      meta: statsResponse.meta ?? {
        source: "db_live",
        population_id: MAP_POPULATION_ID,
        as_of: new Date().toISOString(),
        acceptance_chain_missing_places: 0,
        acceptance_unknown_chain_included: true,
      },
    }, {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", false) },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      console.error("[stats] database unavailable, serving limited stats");
    } else {
      console.error("[stats] failed to load stats", error);
    }

    if (!shouldAllowJson || process.env.NODE_ENV === "production") {
      return NextResponse.json<StatsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
        status: 503,
        headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
      });
    }

    // Production must never use JSON fallback for stats.
    try {
      const jsonPlaces = await loadPlacesFromJsonFallback();
      return NextResponse.json<StatsApiResponse>({
        ...responseFromPlaces(filters, jsonPlaces),
        ok: true,
        meta: {
          source: "db_live",
          population_id: MAP_POPULATION_ID,
          as_of: new Date().toISOString(),
          acceptance_chain_missing_places: 0,
          acceptance_unknown_chain_included: true,
        },
      }, {
        headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
      });
    } catch (jsonError) {
      console.error("[stats] failed to load JSON fallback", jsonError);
      return NextResponse.json<StatsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
        status: 503,
        headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
      });
    }
  }
}
