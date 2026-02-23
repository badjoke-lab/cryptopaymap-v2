import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { ensureHistoryTable } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";

export type TrendRange = "24h" | "7d" | "30d" | "all";
export type TrendGrain = "1h" | "1d" | "1w";

type TrendSeriesPoint = {
  date: string;
  total: number;
  delta: number;
};

type VerificationStackedPoint = {
  date: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
};

export type StatsTrendsResponse = {
  range: TrendRange;
  grain: TrendGrain;
  last_updated: string;
  points: Array<TrendSeriesPoint & {
    verified_total: number;
    verified_delta: number;
    accepting_any_total: number;
    accepting_any_delta: number;
  }>;
  stack: VerificationStackedPoint[];
  meta?: { reason: "no_history_data" | "db_unavailable" | "internal_error" };
};

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const HISTORY_ACTIONS = ["approve", "promote"];
const VALID_RANGES: TrendRange[] = ["24h", "7d", "30d", "all"];
const VERIFIED_LEVELS = ["owner", "community", "directory"];

const RANGE_CONFIG: Record<TrendRange, { grain: TrendGrain; periods?: number }> = {
  "24h": { grain: "1h", periods: 24 },
  "7d": { grain: "1d", periods: 7 },
  "30d": { grain: "1d", periods: 30 },
  all: { grain: "1w" },
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

const bucketStart = (date: Date, grain: TrendGrain) => {
  if (grain === "1h") return startOfUtcHour(date);
  if (grain === "1d") return startOfUtcDay(date);
  return startOfUtcWeek(date);
};

const addBucket = (date: Date, grain: TrendGrain, amount = 1) => {
  const value = new Date(date);
  if (grain === "1h") value.setUTCHours(value.getUTCHours() + amount);
  else if (grain === "1d") value.setUTCDate(value.getUTCDate() + amount);
  else value.setUTCDate(value.getUTCDate() + amount * 7);
  return value;
};

const formatBucketLabel = (date: Date, grain: TrendGrain) => {
  if (grain === "1h") {
    return `${date.toISOString().slice(0, 13)}:00:00Z`;
  }
  return date.toISOString().slice(0, 10);
};

const parseRange = (request: Request): TrendRange => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("range");
  if (raw && VALID_RANGES.includes(raw as TrendRange)) {
    return raw as TrendRange;
  }
  return "7d";
};

const buildBuckets = (range: TrendRange, grain: TrendGrain, oldest: Date | null) => {
  const now = new Date();
  const config = RANGE_CONFIG[range];
  const end = bucketStart(now, grain);
  let start: Date;

  if (config.periods) {
    start = addBucket(end, grain, -(config.periods - 1));
  } else {
    const fallback = addBucket(end, grain, -11);
    start = oldest ? bucketStart(oldest, grain) : fallback;
    if (start > end) start = end;
  }

  const labels: string[] = [];
  for (let current = new Date(start); current <= end; current = addBucket(current, grain)) {
    const label = formatBucketLabel(current, grain);
    labels.push(label);
  }

  if (!labels.length) {
    const label = formatBucketLabel(end, grain);
    labels.push(label);
  }

  return { labels, start };
};

const buildEmptyResponse = (
  range: TrendRange,
  grain: TrendGrain,
  labels: string[],
  reason: NonNullable<StatsTrendsResponse["meta"]>["reason"],
): StatsTrendsResponse => ({
  range,
  grain,
  last_updated: new Date().toISOString(),
  points: labels.map((date) => ({
    date,
    total: 0,
    delta: 0,
    verified_total: 0,
    verified_delta: 0,
    accepting_any_total: 0,
    accepting_any_delta: 0,
  })),
  stack: labels.map((date) => ({
      date,
      owner: 0,
      community: 0,
      directory: 0,
      unverified: 0,
    })),
  meta: { reason },
});

export async function GET(request: Request) {
  const route = "api_stats_trends";
  const range = parseRange(request);
  const { grain } = RANGE_CONFIG[range];

  const responseUpdatedAt = new Date().toISOString();

  if (!hasDatabaseUrl()) {
    const { labels } = buildBuckets(range, grain, null);
    return NextResponse.json<StatsTrendsResponse>({
      ...buildEmptyResponse(range, grain, labels, "no_history_data"),
      last_updated: responseUpdatedAt,
    }, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        ...buildDataSourceHeaders("db", true),
      },
    });
  }

  try {
    await ensureHistoryTable(route);

    const hasVerifications = await tableExists(route, "verifications");
    const verificationColumn = hasVerifications
      ? (await hasColumn(route, "verifications", "level"))
        ? "level"
        : (await hasColumn(route, "verifications", "status"))
          ? "status"
          : null
      : null;

    const hasPayments = await tableExists(route, "payment_accepts");
    const [hasPaymentPlaceId, hasPaymentChain, hasPaymentAsset] = hasPayments
      ? await Promise.all([
          hasColumn(route, "payment_accepts", "place_id"),
          hasColumn(route, "payment_accepts", "chain"),
          hasColumn(route, "payment_accepts", "asset"),
        ])
      : [false, false, false];

    const oldestResult = await dbQuery<{ oldest: string | null }>(
      `SELECT MIN(created_at) AS oldest
       FROM public.history
       WHERE action = ANY($1::text[])
         AND place_id IS NOT NULL`,
      [HISTORY_ACTIONS],
      { route },
    );

    const oldest = oldestResult.rows[0]?.oldest ? new Date(oldestResult.rows[0].oldest) : null;
    const { labels, start } = buildBuckets(range, grain, oldest);

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

    const acceptingAnyExpr = hasPayments && hasPaymentPlaceId && (hasPaymentChain || hasPaymentAsset)
      ? `EXISTS (
           SELECT 1
           FROM payment_accepts pa
           WHERE pa.place_id = fp.place_id
             AND (
               ${hasPaymentChain ? "NULLIF(BTRIM(COALESCE(pa.chain, '')), '') IS NOT NULL" : "FALSE"}
               OR ${hasPaymentAsset ? "NULLIF(BTRIM(COALESCE(pa.asset, '')), '') IS NOT NULL" : "FALSE"}
             )
         )`
      : "FALSE";

    const { rows } = await dbQuery<{
      bucket: string;
      total: string;
      verified: string;
      accepting_any: string;
      owner: string;
      community: string;
      directory: string;
      unverified: string;
    }>(
      `WITH first_published AS (
         SELECT h.place_id, MIN(h.created_at) AS first_published_at
         FROM public.history h
         WHERE h.action = ANY($1::text[])
           AND h.place_id IS NOT NULL
         GROUP BY h.place_id
       ),
       place_dim AS (
         SELECT
           fp.place_id,
           fp.first_published_at,
           ${verificationExpr} AS verification,
           ${acceptingAnyExpr} AS accepting_any
         FROM first_published fp
       )
       SELECT
         to_char(date_trunc($2, first_published_at AT TIME ZONE 'UTC'), CASE WHEN $2 = 'hour' THEN 'YYYY-MM-DD"T"HH24:00:00"Z"' ELSE 'YYYY-MM-DD' END) AS bucket,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE verification = ANY($3::text[])) AS verified,
         COUNT(*) FILTER (WHERE accepting_any) AS accepting_any,
         COUNT(*) FILTER (WHERE verification = 'owner') AS owner,
         COUNT(*) FILTER (WHERE verification = 'community') AS community,
         COUNT(*) FILTER (WHERE verification = 'directory') AS directory,
         COUNT(*) FILTER (WHERE verification = 'unverified') AS unverified
       FROM place_dim
       WHERE first_published_at >= $4
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [HISTORY_ACTIONS, grain === "1h" ? "hour" : grain === "1d" ? "day" : "week", VERIFIED_LEVELS, start.toISOString()],
      { route },
    );

    const bucketMap = new Map(rows.map((row) => [row.bucket, row]));

    let runningTotal = 0;
    let runningVerified = 0;
    let runningAcceptingAny = 0;
    let runningOwner = 0;
    let runningCommunity = 0;
    let runningDirectory = 0;
    let runningUnverified = 0;

    const points: StatsTrendsResponse["points"] = [];
    const verificationStackedSeries: VerificationStackedPoint[] = [];

    for (const label of labels) {
      const row = bucketMap.get(label);
      runningTotal += Number(row?.total ?? 0);
      runningVerified += Number(row?.verified ?? 0);
      runningAcceptingAny += Number(row?.accepting_any ?? 0);
      runningOwner += Number(row?.owner ?? 0);
      runningCommunity += Number(row?.community ?? 0);
      runningDirectory += Number(row?.directory ?? 0);
      runningUnverified += Number(row?.unverified ?? 0);

      points.push({
        date: label,
        total: runningTotal,
        delta: Number(row?.total ?? 0),
        verified_total: runningVerified,
        verified_delta: Number(row?.verified ?? 0),
        accepting_any_total: runningAcceptingAny,
        accepting_any_delta: Number(row?.accepting_any ?? 0),
      });
      verificationStackedSeries.push({
        date: label,
        owner: runningOwner,
        community: runningCommunity,
        directory: runningDirectory,
        unverified: runningUnverified,
      });
    }

    const hasAnyData = rows.length > 0;
    const response: StatsTrendsResponse = {
      range,
      grain,
      last_updated: responseUpdatedAt,
      points,
      stack: verificationStackedSeries,
      ...(hasAnyData ? {} : { meta: { reason: "no_history_data" as const } }),
    };

    return NextResponse.json<StatsTrendsResponse>(response, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        ...buildDataSourceHeaders("db", false),
      },
    });
  } catch (error) {
    const { labels } = buildBuckets(range, grain, null);
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json<StatsTrendsResponse>({
        ...buildEmptyResponse(range, grain, labels, "db_unavailable"),
        last_updated: responseUpdatedAt,
      }, {
        status: 503,
        headers: buildDataSourceHeaders("db", true),
      });
    }
    console.error("[stats] failed to load trends", error);
    return NextResponse.json<StatsTrendsResponse>({
      ...buildEmptyResponse(range, grain, labels, "internal_error"),
      last_updated: responseUpdatedAt,
    }, {
      status: 500,
      headers: buildDataSourceHeaders("db", true),
    });
  }
}
