import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery } from "@/lib/db";
import { places } from "@/lib/data/places";
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
  isMapPopulationPlace,
} from "@/lib/population/mapPopulationWhere";
import { normalizeCategory, normalizeCity, normalizeCountry, normalizeLocationSql } from "@/lib/normalize/location";
import { normalizeAcceptedSql, normalizeAcceptedValues } from "@/lib/normalize/accepted";
import { normalizeVerificationSql, normalizeVerificationValue } from "@/lib/normalize/verification";

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
    where_version: string;
    limited: boolean;
    source: "db" | "fallback";
    debug?: {
      normalization_version: string;
      sample_mismatches: Array<Record<string, unknown>>;
    };
  };
  generated_at?: string;
  limited?: boolean;
};

const CACHE_CONTROL = "public, s-maxage=7200, stale-while-revalidate=600";
const TOP_CHAIN_LIMIT = 50;
const TOP_RANKING_LIMIT = 10;
const TOP_MATRIX_LIMIT = 20;
const FILTER_KEYS: Array<keyof StatsFilters> = ["country", "city", "category", "accepted", "verification", "promoted", "source"];
const NORMALIZATION_VERSION = "n1";

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

const isDebugMode = (request: Request) => new URL(request.url).searchParams.get("debug") === "1";

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

const withDebugMeta = (
  response: StatsApiResponse,
  debug: boolean,
  sourcePlaces: typeof places = [],
): StatsApiResponse => {
  if (!debug) return response;
  const sample_mismatches: Array<Record<string, unknown>> = [];
  for (const p of sourcePlaces) {
    if (sample_mismatches.length >= 5) break;
    const rawCountry = (p.country ?? "") as string;
    const rawCity = (p.city ?? "") as string;
    const rawCategory = (p.category ?? "") as string;
    const rawVerification = (p.verification ?? "") as string;
    const rawAccepted = [...(p.accepted ?? []), ...(p.supported_crypto ?? [])];
    const normalizedAccepted = normalizeAcceptedValues(rawAccepted);
    if (
      rawCountry !== normalizeCountry(rawCountry)
      || rawCity !== normalizeCity(rawCity)
      || rawCategory !== normalizeCategory(rawCategory)
      || rawVerification !== normalizeVerificationValue(rawVerification)
      || JSON.stringify(rawAccepted) !== JSON.stringify(normalizedAccepted)
    ) {
      sample_mismatches.push({
        id: p.id,
        country: { raw: rawCountry, normalized: normalizeCountry(rawCountry) },
        city: { raw: rawCity, normalized: normalizeCity(rawCity) },
        category: { raw: rawCategory, normalized: normalizeCategory(rawCategory) },
        verification: { raw: rawVerification, normalized: normalizeVerificationValue(rawVerification) },
      });
    }
  }

  return {
    ...response,
    meta: {
      ...response.meta,
      debug: {
        normalization_version: NORMALIZATION_VERSION,
        sample_mismatches,
      },
    },
  };
};

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

  if (filters.country && options.hasCountry) clauses.push(`${normalizeLocationSql("p.country")} = ${addParam(normalizeCountry(filters.country))}`);
  if (filters.city && options.hasCity) clauses.push(`${normalizeLocationSql("p.city")} = ${addParam(normalizeCity(filters.city))}`);
  if (filters.category && options.hasCategory) clauses.push(`${normalizeLocationSql("p.category")} = ${addParam(normalizeCategory(filters.category))}`);
  if (filters.promoted && options.hasPromoted) clauses.push(`COALESCE(p.promoted, FALSE) = ${addParam(filters.promoted === "true")}`);
  if (filters.source && options.hasSource) clauses.push(`${normalizeLocationSql("p.source")} = ${addParam(normalizeFilterValue(filters.source).toLowerCase())}`);

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
      LIMIT 1), 'unverified') = ${addParam(normalizeVerificationValue(filters.verification))}`);
  }

  if (filters.accepted && options.hasPaymentPlaceId && (options.hasPaymentChain || options.hasPaymentAsset)) {
    const accepted = normalizeAcceptedValues([filters.accepted])[0] ?? "";
    clauses.push(`EXISTS (
      SELECT 1
      FROM payment_accepts pa
      WHERE pa.place_id = p.id
      AND (
        ${options.hasPaymentChain ? `${normalizeAcceptedSql("pa.chain")} = ${addParam(accepted)}` : "FALSE"}
        OR ${options.hasPaymentAsset ? `${normalizeAcceptedSql("pa.asset")} = ${addParam(accepted)}` : "FALSE"}
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

const responseFromPlaces = (filters: StatsFilters, sourcePlaces: typeof places): StatsApiResponse => {
  const normAcceptedFilter = normalizeAcceptedValues([filters.accepted])[0]?.toLowerCase() ?? "";
  const filteredPlaces = sourcePlaces.filter((place) => {
    if (!isMapPopulationPlace(place)) return false;

    if (filters.country && normalizeCountry(place.country) !== normalizeCountry(filters.country)) return false;
    if (filters.city && normalizeCity(place.city) !== normalizeCity(filters.city)) return false;
    if (filters.category && normalizeCategory(place.category) !== normalizeCategory(filters.category)) return false;
    if (filters.verification && normalizeVerificationValue(place.verification) !== normalizeVerificationValue(filters.verification)) return false;

    if (normAcceptedFilter) {
      const accepted = normalizeAcceptedValues(place.accepted ?? place.supported_crypto ?? []).map((value) => value.toLowerCase());
      if (!accepted.includes(normAcceptedFilter)) return false;
    }

    return true;
  });

  const byCountry = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const key = normalizeCountry(place.country);
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const byCategory = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const key = normalizeCategory(place.category);
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const cityCount = new Set(
    filteredPlaces
      .map((place) => {
        const country = normalizeCountry(place.country);
        const city = normalizeCity(place.city);
        if (!country || !city) return null;
        return `${country}::${city}`;
      })
      .filter(Boolean),
  ).size;

  const byCity = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    const city = normalizeCity(place.city);
    const country = normalizeCountry(place.country);
    const key = city && country ? `${city}, ${country}` : city;
    if (!key) return acc;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const chainCounts = filteredPlaces.reduce<Record<string, number>>((acc, place) => {
    for (const accepted of normalizeAcceptedValues(place.accepted ?? place.supported_crypto ?? [])) {
      acc[accepted] = (acc[accepted] ?? 0) + 1;
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

  const breakdown = filteredPlaces.reduce<StatsApiResponse["breakdown"]>((acc, place) => {
    const v = normalizeVerificationValue(place.verification);
    if (v === "owner") acc.owner += 1;
    else if (v === "community") acc.community += 1;
    else if (v === "directory") acc.directory += 1;
    else acc.unverified += 1;
    return acc;
  }, { ...EMPTY_BREAKDOWN });

  const topAssets = sortedChains.slice(0, TOP_CHAIN_LIMIT).map((entry) => ({ key: entry.chain, count: entry.total }));
  const topChains = sortedChains.slice(0, TOP_CHAIN_LIMIT).map((entry) => ({ key: entry.chain, count: entry.total }));

  const rows = topAssets.slice(0, TOP_MATRIX_LIMIT).map((entry) => ({
    asset: entry.key,
    total: entry.count,
    counts: { [entry.key]: entry.count },
  }));

  return {
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
    top_chains: topChains,
    top_assets: topAssets,
    category_ranking: sortedCategories.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.category, count: entry.total })),
    country_ranking: sortedCountries.slice(0, TOP_RANKING_LIMIT).map((entry) => ({ key: entry.country, count: entry.total })),
    city_ranking: Object.entries(byCity)
      .map(([key, count]) => ({ key, count: Number(count) }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, TOP_RANKING_LIMIT),
    asset_acceptance_matrix: {
      assets: rows.map((row) => row.asset),
      chains: rows.map((row) => row.asset),
      rows,
    },
    accepting_any_count: filteredPlaces.filter((place) => normalizeAcceptedValues(place.accepted ?? place.supported_crypto ?? []).length > 0).length,
    meta: {
      population: "map_pop",
      where_version: MAP_POPULATION_WHERE_VERSION,
      limited: false,
      source: "fallback",
    },
    limited: false,
  };
};

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
       COUNT(DISTINCT NULLIF(${normalizeLocationSql("country")}, '')) AS countries,
       COUNT(DISTINCT (NULLIF(${normalizeLocationSql("country")}, ''), NULLIF(${normalizeLocationSql("city")}, ''))) FILTER (
         WHERE NULLIF(${normalizeLocationSql("country")}, '') IS NOT NULL
           AND NULLIF(${normalizeLocationSql("city")}, '') IS NOT NULL
       ) AS cities,
       COUNT(DISTINCT NULLIF(${normalizeLocationSql("category")}, '')) AS categories
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
         SELECT NULLIF(${normalizeLocationSql("category")}, '') AS key, COUNT(*) AS total
         FROM ${MAP_POPULATION_CTE}
         WHERE NULLIF(${normalizeLocationSql("category")}, '') IS NOT NULL
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
         SELECT NULLIF(${normalizeLocationSql("country")}, '') AS key, COUNT(*) AS total
         FROM ${MAP_POPULATION_CTE}
         WHERE NULLIF(${normalizeLocationSql("country")}, '') IS NOT NULL
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
           ? `SELECT CONCAT(NULLIF(${normalizeLocationSql("city")}, ''), ', ', NULLIF(${normalizeLocationSql("country")}, '')) AS key, COUNT(*) AS total
              FROM ${MAP_POPULATION_CTE}
              WHERE NULLIF(${normalizeLocationSql("city")}, '') IS NOT NULL
                AND NULLIF(${normalizeLocationSql("country")}, '') IS NOT NULL`
           : `SELECT NULLIF(${normalizeLocationSql("city")}, '') AS key, COUNT(*) AS total
              FROM ${MAP_POPULATION_CTE}
              WHERE NULLIF(${normalizeLocationSql("city")}, '') IS NOT NULL`}
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
         SELECT NULLIF(${normalizeAcceptedSql("pa.chain")}, '') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(${normalizeAcceptedSql("pa.chain")}, '') IS NOT NULL
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
         SELECT NULLIF(${normalizeAcceptedSql("pa.asset")}, '') AS key, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(${normalizeAcceptedSql("pa.asset")}, '') IS NOT NULL
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
         WHERE ${hasPaymentChain ? `NULLIF(${normalizeAcceptedSql("pa.chain")}, '') IS NOT NULL` : "FALSE"}
            OR ${hasPaymentAsset ? `NULLIF(${normalizeAcceptedSql("pa.asset")}, '') IS NOT NULL` : "FALSE"}`,
        params,
        { route },
      )
    : Promise.resolve({ rows: [{ total: "0" }] as Array<{ total: string }> });

  const matrixPromise = hasPayments && hasPaymentAsset && hasPaymentChain && hasPaymentPlaceId
    ? dbQuery<{ asset: string | null; chain: string | null; total: string }>(
        `${mapPopCte}
         SELECT NULLIF(${normalizeAcceptedSql("pa.asset")}, '') AS asset, NULLIF(${normalizeAcceptedSql("pa.chain")}, '') AS chain, COUNT(*) AS total
         FROM payment_accepts pa
         INNER JOIN ${MAP_POPULATION_CTE} mp ON mp.id = pa.place_id
         WHERE NULLIF(${normalizeAcceptedSql("pa.asset")}, '') IS NOT NULL
           AND NULLIF(${normalizeAcceptedSql("pa.chain")}, '') IS NOT NULL
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
  const debug = isDebugMode(request);
  const route = "api_stats";
  const dataSource = getDataSourceSetting();
  const { shouldAttemptDb, shouldAllowJson, hasDb } = getDataSourceContext(dataSource);

  if (!hasDb || !shouldAttemptDb) {
    if (shouldAllowJson) {
      const response = responseFromPlaces(filters, places);
      return NextResponse.json<StatsApiResponse>(withDebugMeta(response, debug, places), {
        headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
      });
    }
    const response = limitedResponse("fallback");
    return NextResponse.json<StatsApiResponse>(withDebugMeta(response, debug), {
      status: 503,
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
    });
  }

  try {
    const statsResponse = await withDbTimeout(loadStatsFromDb(route, filters), {
      message: "DB_TIMEOUT",
    });
    return NextResponse.json<StatsApiResponse>(withDebugMeta(statsResponse, debug), {
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", false) },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      console.error("[stats] database unavailable, serving fallback stats");
    } else {
      console.error("[stats] failed to load stats", error);
    }

    if (shouldAllowJson) {
      const response = responseFromPlaces(filters, places);
      return NextResponse.json<StatsApiResponse>(withDebugMeta(response, debug, places), {
        headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("json", true) },
      });
    }

    return NextResponse.json<StatsApiResponse>(withDebugMeta(limitedResponse("fallback"), debug), {
      status: 503,
      headers: { "Cache-Control": CACHE_CONTROL, ...buildDataSourceHeaders("db", true) },
    });
  }
}
