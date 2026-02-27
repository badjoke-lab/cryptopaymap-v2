import { dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { ensureHistoryTable } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";

type Grain = "1h" | "1d" | "1w";
type Verification = "owner" | "community" | "directory" | "unverified";

type CliOptions = {
  grain: Grain;
  date?: string;
  weekStart?: string;
  sinceHours: number;
  topN: number;
};

type TimeWindow = {
  start: Date;
  end: Date;
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

const ROUTE = "scripts_generate_stats_timeseries";
const HISTORY_ACTIONS = ["approve", "promote"];
const TOP_DIM_LIMIT_DEFAULT = 50;
const DEFAULT_SINCE_HOURS = 48;
const CHUNK_SIZE = 500;
const VERIFICATION_KEYS: Verification[] = ["owner", "community", "directory", "unverified"];

const printHelp = () => {
  console.log(`Usage:\n  pnpm tsx scripts/generate_stats_timeseries.ts --grain=1h [--since-hours=48] [--top-n=50]\n  pnpm tsx scripts/generate_stats_timeseries.ts --grain=1d [--date=YYYY-MM-DD] [--top-n=50]\n  pnpm tsx scripts/generate_stats_timeseries.ts --grain=1w [--week-start=YYYY-MM-DD] [--top-n=50]`);
};

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const options: Partial<CliOptions> = {
    sinceHours: DEFAULT_SINCE_HOURS,
    topN: TOP_DIM_LIMIT_DEFAULT,
  };

  for (const arg of args) {
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();

    if (!key?.startsWith("--")) continue;

    if (key === "--grain" && value && ["1h", "1d", "1w"].includes(value)) {
      options.grain = value as Grain;
    } else if (key === "--date" && value) {
      options.date = value;
    } else if (key === "--week-start" && value) {
      options.weekStart = value;
    } else if (key === "--since-hours" && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--since-hours must be a positive number.");
      }
      options.sinceHours = Math.floor(parsed);
    } else if (key === "--top-n" && value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("--top-n must be a positive number.");
      }
      options.topN = Math.floor(parsed);
    }
  }

  if (!options.grain) {
    throw new Error("--grain is required (1h | 1d | 1w)");
  }

  return options as CliOptions;
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

const resolveWindow = (options: CliOptions): TimeWindow => {
  const now = new Date();

  if (options.grain === "1h") {
    const end = addBucket(startOfUtcHour(now), "1h", 1);
    const start = addBucket(end, "1h", -options.sinceHours);
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

const buildBreakdownJson = (aggregation: Aggregation) =>
  JSON.stringify({
    verification: aggregation.verification,
    top_categories: [],
    top_assets: [],
  });

const buildRows = (facts: PlaceFactRow[], options: CliOptions, window: TimeWindow): TimeseriesRow[] => {
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

  const topCountries = sortTopKeys(byCountry, options.topN);
  const topCategories = sortTopKeys(byCategory, options.topN);
  const topAssets = sortTopKeys(byAsset, options.topN);

  const allAgg = new Map<string, Aggregation>();
  const verificationAgg = new Map<string, Aggregation>();
  const countryAgg = new Map<string, Aggregation>();
  const categoryAgg = new Map<string, Aggregation>();
  const assetAgg = new Map<string, Aggregation>();

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
  };

  for (const row of facts) {
    const bucket = bucketStart(new Date(row.first_published_at), options.grain).toISOString();
    if (!bucketSet.has(bucket)) continue;

    apply(getOrCreateAgg(allAgg, `${bucket}::all`), row);
    apply(getOrCreateAgg(verificationAgg, `${bucket}::${row.verification}`), row);

    const country = sanitizeKey(row.country);
    if (country && topCountries.includes(country)) {
      apply(getOrCreateAgg(countryAgg, `${bucket}::${country}`), row);
    }

    const category = sanitizeKey(row.category);
    if (category && topCategories.includes(category)) {
      apply(getOrCreateAgg(categoryAgg, `${bucket}::${category}`), row);
    }

    const dedupAssets = new Set((row.assets ?? []).map((asset) => sanitizeKey(asset)).filter(Boolean));
    for (const asset of dedupAssets) {
      if (topAssets.includes(asset)) {
        apply(getOrCreateAgg(assetAgg, `${bucket}::${asset}`), row);
      }
    }
  }

  const rows: TimeseriesRow[] = [];
  const toRows = (dimType: string, map: Map<string, Aggregation>) => {
    for (const [key, aggregation] of map.entries()) {
      const [periodStartIso, dimKey] = key.split("::");
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
        breakdownJson: buildBreakdownJson(aggregation),
      });
    }
  };

  toRows("all", allAgg);
  toRows("verification", verificationAgg);
  toRows("country", countryAgg);
  toRows("category", categoryAgg);
  toRows("asset", assetAgg);

  rows.sort((a, b) => {
    const byDate = a.periodStart.getTime() - b.periodStart.getTime();
    if (byDate !== 0) return byDate;
    const byDimType = a.dimType.localeCompare(b.dimType);
    if (byDimType !== 0) return byDimType;
    return a.dimKey.localeCompare(b.dimKey);
  });

  return rows;
};

const loadFacts = async (options: CliOptions, window: TimeWindow): Promise<PlaceFactRow[]> => {
  const hasPlaces = await tableExists(ROUTE, "places");
  if (!hasPlaces) {
    throw new Error("places table is required.");
  }

  const hasVerifications = await tableExists(ROUTE, "verifications");
  const verificationColumn = hasVerifications
    ? (await hasColumn(ROUTE, "verifications", "level"))
      ? "level"
      : (await hasColumn(ROUTE, "verifications", "status"))
        ? "status"
        : null
    : null;

  const hasPayments = await tableExists(ROUTE, "payment_accepts");
  const hasPaymentPlaceId = hasPayments ? await hasColumn(ROUTE, "payment_accepts", "place_id") : false;
  const hasPaymentAsset = hasPayments ? await hasColumn(ROUTE, "payment_accepts", "asset") : false;
  const hasPaymentChain = hasPayments ? await hasColumn(ROUTE, "payment_accepts", "chain") : false;

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
    { route: ROUTE },
  );

  return rows;
};

const upsertRows = async (rows: TimeseriesRow[]) => {
  const client = await getDbClient(ROUTE);

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

const main = async () => {
  const options = parseArgs();

  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required.");
  }

  await ensureHistoryTable(ROUTE);

  const tablePresent = await tableExists(ROUTE, "stats_timeseries");
  if (!tablePresent) {
    throw new Error("stats_timeseries table is missing. Run migrations first.");
  }

  const window = resolveWindow(options);
  const facts = await loadFacts(options, window);
  const rows = buildRows(facts, options, window);

  await upsertRows(rows);

  console.log("[generate_stats_timeseries] done", {
    grain: options.grain,
    window_start: window.start.toISOString(),
    window_end: window.end.toISOString(),
    facts: facts.length,
    upserted: rows.length,
    top_n: options.topN,
  });
};

main().catch((error) => {
  console.error("[generate_stats_timeseries] failed", error);
  process.exitCode = 1;
});
