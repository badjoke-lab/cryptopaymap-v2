import { dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { ensureHistoryTable } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";

export type Grain = "1h" | "1d" | "1w";
type Verification = "owner" | "community" | "directory" | "unverified";
export type TimeseriesJob = "hourly" | "daily" | "weekly";

export type GenerateTimeseriesOptions = {
  grain: Grain;
  date?: string;
  weekStart?: string;
  hourStart?: string;
  sinceHours?: number;
  topN?: number;
  route?: string;
};

type TimeWindow = {
  start: Date;
  end: Date;
};

type ResolvedGenerationOptions = GenerateTimeseriesOptions & {
  grain: Grain;
  sinceHours: number;
  topN: number;
};

type PlaceFactRow = {
  place_id: string;
  first_published_at: string;
  verification: Verification;
  country: string | null;
  category: string | null;
  accepting_any: boolean;
  assets: string[] | null;
};

type Aggregation = {
  total: number;
  verified: number;
  acceptingAny: number;
  verification: Record<Verification, number>;
  breakdowns: {
    category: Map<string, number>;
    asset: Map<string, number>;
    country: Map<string, number>;
  };
};

type TimeseriesRow = {
  periodStart: Date;
  periodEnd: Date;
  grain: Grain;
  dimType: string;
  dimKey: string;
  totalCount: number;
  verifiedCount: number;
  acceptingAnyCount: number;
  breakdownJson: string;
};

export type GenerateTimeseriesResult = {
  grain: Grain;
  windowStart: string;
  windowEnd: string;
  facts: number;
  upserted: number;
  topN: number;
};

const HISTORY_ACTIONS = ["approve", "promote"];
const TOP_DIM_LIMIT_DEFAULT = 30;
const DEFAULT_SINCE_HOURS = 48;
const CHUNK_SIZE = 500;
const VERIFICATION_KEYS: Verification[] = ["owner", "community", "directory", "unverified"];
const COMPOSITE_DIM_WITHIN_PARENT_LIMIT: Record<Grain, number> = {
  "1h": 5,
  "1d": 10,
  "1w": 10,
};
const BREAKDOWN_LIMIT_BY_GRAIN: Record<Grain, number> = {
  "1h": 10,
  "1d": 20,
  "1w": 20,
};

const startOfUtcHour = (date: Date) => {
  const value = new Date(date);
  value.setUTCMinutes(0, 0, 0);
  return value;
};

const startOfUtcDay = (date: Date) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const startOfUtcWeek = (date: Date) => {
  const value = startOfUtcDay(date);
  const day = value.getUTCDay();
  const offset = (day + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value;
};

const addBucket = (date: Date, grain: Grain, count = 1) => {
  const value = new Date(date);
  if (grain === "1h") {
    value.setUTCHours(value.getUTCHours() + count);
  } else if (grain === "1d") {
    value.setUTCDate(value.getUTCDate() + count);
  } else {
    value.setUTCDate(value.getUTCDate() + count * 7);
  }
  return value;
};

const bucketStart = (date: Date, grain: Grain) => {
  if (grain === "1h") return startOfUtcHour(date);
  if (grain === "1d") return startOfUtcDay(date);
  return startOfUtcWeek(date);
};

const parseUtcDate = (raw: string) => {
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${raw}. Expected YYYY-MM-DD.`);
  }
  return parsed;
};

const parseUtcHour = (raw: string) => {
  const normalized = raw.includes("T") ? raw : `${raw}T00:00:00.000Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid hourStart: ${raw}. Expected ISO datetime.`);
  }
  return startOfUtcHour(parsed);
};

const resolveWindow = (options: ResolvedGenerationOptions): TimeWindow => {
  const now = new Date();

  if (options.grain === "1h") {
    if (options.hourStart) {
      const start = parseUtcHour(options.hourStart);
      return { start, end: addBucket(start, "1h", 1) };
    }
    const end = addBucket(startOfUtcHour(now), "1h", 1);
    const start = addBucket(end, "1h", -(options.sinceHours ?? DEFAULT_SINCE_HOURS));
    return { start, end };
  }

  if (options.grain === "1d") {
    if (options.date) {
      const start = parseUtcDate(options.date);
      return { start, end: addBucket(start, "1d", 1) };
    }
    const today = startOfUtcDay(now);
    const start = addBucket(today, "1d", -1);
    return { start, end: today };
  }

  if (options.weekStart) {
    const start = startOfUtcWeek(parseUtcDate(options.weekStart));
    return { start, end: addBucket(start, "1w", 1) };
  }

  const thisWeek = startOfUtcWeek(now);
  const start = addBucket(thisWeek, "1w", -1);
  return { start, end: thisWeek };
};

const listBuckets = (grain: Grain, window: TimeWindow) => {
  const buckets: Date[] = [];
  for (let current = new Date(window.start); current < window.end; current = addBucket(current, grain, 1)) {
    buckets.push(new Date(current));
  }
  return buckets;
};

const sanitizeKey = (value: string | null | undefined) => value?.trim() ?? "";

const createEmptyAggregation = (): Aggregation => ({
  total: 0,
  verified: 0,
  acceptingAny: 0,
  verification: {
    owner: 0,
    community: 0,
    directory: 0,
    unverified: 0,
  },
  breakdowns: {
    category: new Map<string, number>(),
    asset: new Map<string, number>(),
    country: new Map<string, number>(),
  },
});

const getOrCreateAgg = (target: Map<string, Aggregation>, key: string) => {
  const current = target.get(key);
  if (current) return current;
  const next = createEmptyAggregation();
  target.set(key, next);
  return next;
};

const sortTopKeys = (source: Map<string, number>, limit: number) =>
  [...source.entries()]
    .filter(([key]) => Boolean(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);

const sortTopEntries = (source: Map<string, number>, limit: number) =>
  [...source.entries()]
    .filter(([key]) => Boolean(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);

const toTopMap = (source: Map<string, number>, limit: number) =>
  [...source.entries()]
    .filter(([key]) => Boolean(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .reduce<Record<string, number>>((acc, [key, count]) => {
      acc[key] = count;
      return acc;
    }, {});

const buildBreakdownJson = (aggregation: Aggregation, grain: Grain) => {
  const limit = BREAKDOWN_LIMIT_BY_GRAIN[grain];
  const topCategories = toTopMap(aggregation.breakdowns.category, limit);
  const topAssets = toTopMap(aggregation.breakdowns.asset, limit);
  const topCountries = toTopMap(aggregation.breakdowns.country, limit);

  return JSON.stringify({
    verification: aggregation.verification,
    top_categories: Object.entries(topCategories).map(([key, count]) => ({ key, count })),
    top_assets: Object.entries(topAssets).map(([key, count]) => ({ key, count })),
    breakdowns: {
      category: topCategories,
      asset: topAssets,
      country: topCountries,
    },
  });
};

const buildRows = (facts: PlaceFactRow[], options: ResolvedGenerationOptions, window: TimeWindow): TimeseriesRow[] => {
  const bucketKeys = listBuckets(options.grain, window).map((value) => value.toISOString());
  const bucketSet = new Set(bucketKeys);

  const byCountry = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const byAsset = new Map<string, number>();

  for (const row of facts) {
    const country = sanitizeKey(row.country);
    const category = sanitizeKey(row.category);
    if (country) byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
    if (category) byCategory.set(category, (byCategory.get(category) ?? 0) + 1);

    const dedupAssets = new Set((row.assets ?? []).map((asset) => sanitizeKey(asset)).filter(Boolean));
    for (const asset of dedupAssets) {
      byAsset.set(asset, (byAsset.get(asset) ?? 0) + 1);
    }
  }

  const topN = options.topN ?? TOP_DIM_LIMIT_DEFAULT;
  const topCountries = sortTopKeys(byCountry, topN);
  const topCategories = sortTopKeys(byCategory, topN);
  const topAssets = sortTopKeys(byAsset, topN);
  const topCountriesSet = new Set(topCountries);
  const topCategoriesSet = new Set(topCategories);
  const topAssetsSet = new Set(topAssets);
  const compositeWithinParentLimit = COMPOSITE_DIM_WITHIN_PARENT_LIMIT[options.grain];

  const byCountryCategory = new Map<string, Map<string, number>>();
  const byCountryAsset = new Map<string, Map<string, number>>();
  const byCategoryAsset = new Map<string, Map<string, number>>();

  for (const row of facts) {
    const country = sanitizeKey(row.country);
    const category = sanitizeKey(row.category);

    if (country && category && topCountriesSet.has(country)) {
      const countryCategories = byCountryCategory.get(country) ?? new Map<string, number>();
      countryCategories.set(category, (countryCategories.get(category) ?? 0) + 1);
      byCountryCategory.set(country, countryCategories);
    }

    const dedupAssets = new Set((row.assets ?? []).map((asset) => sanitizeKey(asset)).filter(Boolean));

    if (country && topCountriesSet.has(country)) {
      const countryAssets = byCountryAsset.get(country) ?? new Map<string, number>();
      for (const asset of dedupAssets) {
        countryAssets.set(asset, (countryAssets.get(asset) ?? 0) + 1);
      }
      byCountryAsset.set(country, countryAssets);
    }

    if (category && topCategoriesSet.has(category)) {
      const categoryAssets = byCategoryAsset.get(category) ?? new Map<string, number>();
      for (const asset of dedupAssets) {
        categoryAssets.set(asset, (categoryAssets.get(asset) ?? 0) + 1);
      }
      byCategoryAsset.set(category, categoryAssets);
    }
  }

  const topCountryCategoryKeys = new Set<string>();
  for (const country of topCountries) {
    const candidates = byCountryCategory.get(country);
    if (!candidates) continue;
    for (const [category] of sortTopEntries(candidates, compositeWithinParentLimit)) {
      topCountryCategoryKeys.add(`${country}::${category}`);
    }
  }

  const topCountryAssetKeys = new Set<string>();
  for (const country of topCountries) {
    const candidates = byCountryAsset.get(country);
    if (!candidates) continue;
    for (const [asset] of sortTopEntries(candidates, compositeWithinParentLimit)) {
      topCountryAssetKeys.add(`${country}::${asset}`);
    }
  }

  const topCategoryAssetKeys = new Set<string>();
  for (const category of topCategories) {
    const candidates = byCategoryAsset.get(category);
    if (!candidates) continue;
    for (const [asset] of sortTopEntries(candidates, compositeWithinParentLimit)) {
      topCategoryAssetKeys.add(`${category}::${asset}`);
    }
  }

  const allAgg = new Map<string, Aggregation>();
  const verificationAgg = new Map<string, Aggregation>();
  const countryAgg = new Map<string, Aggregation>();
  const categoryAgg = new Map<string, Aggregation>();
  const assetAgg = new Map<string, Aggregation>();
  const countryCategoryAgg = new Map<string, Aggregation>();
  const countryAssetAgg = new Map<string, Aggregation>();
  const categoryAssetAgg = new Map<string, Aggregation>();

  for (const bucket of bucketKeys) {
    getOrCreateAgg(allAgg, `${bucket}::all`);
    for (const verification of VERIFICATION_KEYS) {
      getOrCreateAgg(verificationAgg, `${bucket}::${verification}`);
    }
    for (const country of topCountries) {
      getOrCreateAgg(countryAgg, `${bucket}::${country}`);
    }
    for (const category of topCategories) {
      getOrCreateAgg(categoryAgg, `${bucket}::${category}`);
    }
    for (const asset of topAssets) {
      getOrCreateAgg(assetAgg, `${bucket}::${asset}`);
    }
    for (const countryCategory of topCountryCategoryKeys) {
      getOrCreateAgg(countryCategoryAgg, `${bucket}::${countryCategory}`);
    }
    for (const countryAsset of topCountryAssetKeys) {
      getOrCreateAgg(countryAssetAgg, `${bucket}::${countryAsset}`);
    }
    for (const categoryAsset of topCategoryAssetKeys) {
      getOrCreateAgg(categoryAssetAgg, `${bucket}::${categoryAsset}`);
    }
  }

  const apply = (aggregation: Aggregation, row: PlaceFactRow) => {
    aggregation.total += 1;
    if (row.verification === "owner" || row.verification === "community") {
      aggregation.verified += 1;
    }
    if (row.accepting_any) {
      aggregation.acceptingAny += 1;
    }
    aggregation.verification[row.verification] += 1;

    const country = sanitizeKey(row.country);
    const category = sanitizeKey(row.category);
    if (country) {
      aggregation.breakdowns.country.set(country, (aggregation.breakdowns.country.get(country) ?? 0) + 1);
    }
    if (category) {
      aggregation.breakdowns.category.set(category, (aggregation.breakdowns.category.get(category) ?? 0) + 1);
    }
    const dedupAssets = new Set((row.assets ?? []).map((asset) => sanitizeKey(asset)).filter(Boolean));
    for (const asset of dedupAssets) {
      aggregation.breakdowns.asset.set(asset, (aggregation.breakdowns.asset.get(asset) ?? 0) + 1);
    }
  };

  for (const row of facts) {
    const bucket = bucketStart(new Date(row.first_published_at), options.grain).toISOString();
    if (!bucketSet.has(bucket)) continue;

    apply(getOrCreateAgg(allAgg, `${bucket}::all`), row);
    apply(getOrCreateAgg(verificationAgg, `${bucket}::${row.verification}`), row);

    const country = sanitizeKey(row.country);
    if (country && topCountriesSet.has(country)) {
      apply(getOrCreateAgg(countryAgg, `${bucket}::${country}`), row);
    }

    const category = sanitizeKey(row.category);
    if (category && topCategoriesSet.has(category)) {
      apply(getOrCreateAgg(categoryAgg, `${bucket}::${category}`), row);
    }

    if (country && category) {
      const countryCategoryKey = `${country}::${category}`;
      if (topCountryCategoryKeys.has(countryCategoryKey)) {
        apply(getOrCreateAgg(countryCategoryAgg, `${bucket}::${countryCategoryKey}`), row);
      }
    }

    const dedupAssets = new Set((row.assets ?? []).map((asset) => sanitizeKey(asset)).filter(Boolean));
    for (const asset of dedupAssets) {
      if (topAssetsSet.has(asset)) {
        apply(getOrCreateAgg(assetAgg, `${bucket}::${asset}`), row);
      }

      if (country) {
        const countryAssetKey = `${country}::${asset}`;
        if (topCountryAssetKeys.has(countryAssetKey)) {
          apply(getOrCreateAgg(countryAssetAgg, `${bucket}::${countryAssetKey}`), row);
        }
      }

      if (category) {
        const categoryAssetKey = `${category}::${asset}`;
        if (topCategoryAssetKeys.has(categoryAssetKey)) {
          apply(getOrCreateAgg(categoryAssetAgg, `${bucket}::${categoryAssetKey}`), row);
        }
      }
    }
  }

  const rows: TimeseriesRow[] = [];
  const toRows = (dimType: string, map: Map<string, Aggregation>) => {
    for (const [key, aggregation] of map.entries()) {
      const separatorIndex = key.indexOf("::");
      const periodStartIso = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
      const dimKey = separatorIndex >= 0 ? key.slice(separatorIndex + 2) : "";
      const periodStart = new Date(periodStartIso);
      rows.push({
        periodStart,
        periodEnd: addBucket(periodStart, options.grain, 1),
        grain: options.grain,
        dimType,
        dimKey,
        totalCount: aggregation.total,
        verifiedCount: aggregation.verified,
        acceptingAnyCount: aggregation.acceptingAny,
        breakdownJson: buildBreakdownJson(aggregation, options.grain),
      });
    }
  };

  toRows("all", allAgg);
  toRows("verification", verificationAgg);
  toRows("country", countryAgg);
  toRows("category", categoryAgg);
  toRows("asset", assetAgg);
  toRows("country|category", countryCategoryAgg);
  toRows("country|asset", countryAssetAgg);
  toRows("category|asset", categoryAssetAgg);

  rows.sort((a, b) => {
    const byDate = a.periodStart.getTime() - b.periodStart.getTime();
    if (byDate !== 0) return byDate;
    const byDimType = a.dimType.localeCompare(b.dimType);
    if (byDimType !== 0) return byDimType;
    return a.dimKey.localeCompare(b.dimKey);
  });

  return rows;
};

const loadFacts = async (route: string, options: ResolvedGenerationOptions, window: TimeWindow): Promise<PlaceFactRow[]> => {
  const hasPlaces = await tableExists(route, "places");
  if (!hasPlaces) {
    throw new Error("places table is required.");
  }

  const hasVerifications = await tableExists(route, "verifications");
  const verificationColumn = hasVerifications
    ? (await hasColumn(route, "verifications", "level"))
      ? "level"
      : (await hasColumn(route, "verifications", "status"))
        ? "status"
        : null
    : null;

  const hasPayments = await tableExists(route, "payment_accepts");
  const hasPaymentPlaceId = hasPayments ? await hasColumn(route, "payment_accepts", "place_id") : false;
  const hasPaymentAsset = hasPayments ? await hasColumn(route, "payment_accepts", "asset") : false;
  const hasPaymentChain = hasPayments ? await hasColumn(route, "payment_accepts", "chain") : false;

  const verificationExpr = verificationColumn
    ? `CASE
         WHEN EXISTS (
           SELECT 1
           FROM verifications v
           WHERE v.place_id = fp.place_id
             AND COALESCE(NULLIF(BTRIM(v.${verificationColumn}), ''), 'unverified') = 'owner'
         ) THEN 'owner'
         WHEN EXISTS (
           SELECT 1
           FROM verifications v
           WHERE v.place_id = fp.place_id
             AND COALESCE(NULLIF(BTRIM(v.${verificationColumn}), ''), 'unverified') = 'community'
         ) THEN 'community'
         WHEN EXISTS (
           SELECT 1
           FROM verifications v
           WHERE v.place_id = fp.place_id
             AND COALESCE(NULLIF(BTRIM(v.${verificationColumn}), ''), 'unverified') = 'directory'
         ) THEN 'directory'
         ELSE 'unverified'
       END`
    : `'unverified'`;

  const acceptingAnyExpr = hasPaymentPlaceId && (hasPaymentAsset || hasPaymentChain)
    ? `EXISTS (
         SELECT 1
         FROM payment_accepts pa
         WHERE pa.place_id = fp.place_id
           AND (
             ${hasPaymentAsset ? "NULLIF(BTRIM(COALESCE(pa.asset, '')), '') IS NOT NULL" : "FALSE"}
             OR ${hasPaymentChain ? "NULLIF(BTRIM(COALESCE(pa.chain, '')), '') IS NOT NULL" : "FALSE"}
           )
       )`
    : "FALSE";

  const assetArrayExpr = hasPaymentPlaceId && (hasPaymentAsset || hasPaymentChain)
    ? `ARRAY(
         SELECT DISTINCT NULLIF(BTRIM(COALESCE(${hasPaymentAsset ? "pa.asset" : "pa.chain"}, ${hasPaymentChain ? "pa.chain" : "pa.asset"}, '')), '')
         FROM payment_accepts pa
         WHERE pa.place_id = fp.place_id
       )`
    : "ARRAY[]::text[]";

  const { rows } = await dbQuery<PlaceFactRow>(
    `WITH first_published AS (
       SELECT h.place_id, MIN(h.created_at) AS first_published_at
       FROM public.history h
       WHERE h.action = ANY($1::text[])
         AND h.place_id IS NOT NULL
         AND h.created_at < $2
       GROUP BY h.place_id
     )
     SELECT
       fp.place_id,
       fp.first_published_at,
       ${verificationExpr}::text AS verification,
       NULLIF(BTRIM(p.country), '') AS country,
       NULLIF(BTRIM(p.category), '') AS category,
       ${acceptingAnyExpr} AS accepting_any,
       ${assetArrayExpr} AS assets
     FROM first_published fp
     LEFT JOIN places p ON p.id = fp.place_id
     WHERE fp.first_published_at >= $3
       AND fp.first_published_at < $2`,
    [HISTORY_ACTIONS, window.end.toISOString(), window.start.toISOString()],
    { route },
  );

  return rows;
};

const upsertRows = async (route: string, rows: TimeseriesRow[]) => {
  const client = await getDbClient(route);

  try {
    await client.query("BEGIN");

    for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + CHUNK_SIZE);
      if (!chunk.length) continue;

      const valuesSql: string[] = [];
      const params: unknown[] = [];

      for (const row of chunk) {
        params.push(
          row.periodStart.toISOString(),
          row.periodEnd.toISOString(),
          row.grain,
          row.dimType,
          row.dimKey,
          row.totalCount,
          row.verifiedCount,
          row.acceptingAnyCount,
          row.breakdownJson,
        );
        const base = params.length - 8;
        valuesSql.push(`($${base}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}::jsonb, now())`);
      }

      await client.query(
        `INSERT INTO public.stats_timeseries (
           period_start,
           period_end,
           grain,
           dim_type,
           dim_key,
           total_count,
           verified_count,
           accepting_any_count,
           breakdown_json,
           generated_at
         ) VALUES
           ${valuesSql.join(",\n")}
         ON CONFLICT (period_start, grain, dim_type, dim_key)
         DO UPDATE SET
           period_end = EXCLUDED.period_end,
           total_count = EXCLUDED.total_count,
           verified_count = EXCLUDED.verified_count,
           accepting_any_count = EXCLUDED.accepting_any_count,
           breakdown_json = EXCLUDED.breakdown_json,
           generated_at = EXCLUDED.generated_at`,
        params,
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const runStatsTimeseriesGeneration = async (options: GenerateTimeseriesOptions): Promise<GenerateTimeseriesResult> => {
  const route = options.route ?? "stats_timeseries_generation";

  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required.");
  }

  await ensureHistoryTable(route);

  const tablePresent = await tableExists(route, "stats_timeseries");
  if (!tablePresent) {
    throw new Error("stats_timeseries table is missing. Run migrations first.");
  }

  const resolvedOptions: ResolvedGenerationOptions = {
    ...options,
    sinceHours: options.sinceHours ?? DEFAULT_SINCE_HOURS,
    topN: options.topN ?? TOP_DIM_LIMIT_DEFAULT,
  };

  const window = resolveWindow(resolvedOptions);
  const facts = await loadFacts(route, resolvedOptions, window);
  const rows = buildRows(facts, resolvedOptions, window);

  await upsertRows(route, rows);

  return {
    grain: resolvedOptions.grain,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    facts: facts.length,
    upserted: rows.length,
    topN: resolvedOptions.topN,
  };
};

export const runStatsTimeseriesJob = async (job: TimeseriesJob, options: Omit<GenerateTimeseriesOptions, "grain"> = {}) => {
  if (job === "hourly") {
    return runStatsTimeseriesGeneration({ ...options, grain: "1h", sinceHours: options.sinceHours ?? DEFAULT_SINCE_HOURS });
  }

  if (job === "daily") {
    return runStatsTimeseriesGeneration({ ...options, grain: "1d" });
  }

  return runStatsTimeseriesGeneration({ ...options, grain: "1w" });
};

export const DEFAULT_STATS_TIMESERIES_TOP_N = TOP_DIM_LIMIT_DEFAULT;
export const DEFAULT_STATS_TIMESERIES_SINCE_HOURS = DEFAULT_SINCE_HOURS;
