import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { tableExists } from "@/lib/internal-submissions";

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
  ok?: true;
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
  meta?: {
    reason?: "no_history_data" | "db_unavailable" | "internal_error";
    grain: TrendGrain;
    dim_type: string;
    dim_key: string;
    has_data: boolean;
    missing_reason?: "no_saved_cube";
    last_updated: string | null;
    requested?: {
      dim_type: string;
      dim_key: string;
      filters_summary: Partial<Record<CanonicalFilter, string>>;
    };
    used?: {
      dim_type: string;
      dim_key: string;
    };
    fallback?: {
      applied: boolean;
      reason: string;
      dropped_filters: CanonicalFilter[];
      warnings?: string[];
    };
  };
  response_meta?: {
    source: "db";
    as_of: string;
  };
};

type TrendsUnavailableResponse = {
  ok: false;
  error: "stats_unavailable";
  reason: "db_error";
};

type CanonicalFilter = "country" | "city" | "category" | "asset" | "verification" | "promoted" | "source";

type NormalizedFilters = {
  values: Partial<Record<CanonicalFilter, string>>;
  warnings: string[];
};

type DimSelection = {
  dimType: string;
  dimKey: string;
  keys: CanonicalFilter[];
};

type TrendsBadRequestResponse = {
  ok: false;
  error: "invalid_range";
};

const NO_STORE = "no-store";
const VALID_RANGES: TrendRange[] = ["24h", "7d", "30d", "all"];
const DEFAULT_RANGE: TrendRange = "7d";

const RANGE_CONFIG: Record<TrendRange, { grain: TrendGrain; lookbackHours?: number; lookbackDays?: number; lookbackWeeks?: number }> = {
  "24h": { grain: "1h", lookbackHours: 24 },
  "7d": { grain: "1d", lookbackDays: 7 },
  "30d": { grain: "1d", lookbackDays: 30 },
  all: { grain: "1w", lookbackWeeks: 52 },
};

const CACHE_CONTROL_BY_GRAIN: Record<TrendGrain, string> = {
  "1h": "public, s-maxage=600, stale-while-revalidate=120",
  "1d": "public, s-maxage=7200, stale-while-revalidate=900",
  "1w": "public, s-maxage=43200, stale-while-revalidate=3600",
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

const parseRange = (request: Request): TrendRange | null => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("range");
  if (!raw) return DEFAULT_RANGE;
  if (VALID_RANGES.includes(raw as TrendRange)) {
    return raw as TrendRange;
  }
  return null;
};

const parseFirstFilterValue = (rawValue: string | null, key: CanonicalFilter, warnings: string[]) => {
  if (!rawValue) return "";
  const values = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length > 1) {
    warnings.push(`multi_not_supported:${key}`);
  }

  return values[0] ?? "";
};

const resolveFilters = (request: Request): NormalizedFilters => {
  const url = new URL(request.url);
  const warnings: string[] = [];
  const country = parseFirstFilterValue(url.searchParams.get("country"), "country", warnings);
  const city = parseFirstFilterValue(url.searchParams.get("city"), "city", warnings);
  const category = parseFirstFilterValue(url.searchParams.get("category"), "category", warnings);
  const asset = parseFirstFilterValue(url.searchParams.get("asset") ?? url.searchParams.get("accepted"), "asset", warnings);
  const verification = parseFirstFilterValue(url.searchParams.get("verification"), "verification", warnings);
  const promoted = parseFirstFilterValue(url.searchParams.get("promoted"), "promoted", warnings);
  const source = parseFirstFilterValue(url.searchParams.get("source"), "source", warnings);

  return {
    values: {
      ...(country ? { country } : {}),
      ...(city ? { city } : {}),
      ...(category ? { category } : {}),
      ...(asset ? { asset } : {}),
      ...(verification ? { verification } : {}),
      ...(promoted ? { promoted } : {}),
      ...(source ? { source } : {}),
    },
    warnings,
  };
};

const buildRequestedDim = (filters: Partial<Record<CanonicalFilter, string>>): DimSelection => {
  const orderedKeys: CanonicalFilter[] = ["country", "city", "category", "asset", "verification", "promoted", "source"];
  const keys = orderedKeys.filter((key) => Boolean(filters[key]));
  if (keys.length === 0) {
    return { dimType: "all", dimKey: "all", keys: [] };
  }

  const compositeKeyEligible = keys.every((key) => key === "country" || key === "category" || key === "asset") && keys.length >= 2;

  return {
    dimType: keys.join("|"),
    dimKey: keys.map((key) => filters[key] as string).join(compositeKeyEligible ? "::" : "|"),
    keys,
  };
};

const buildFallbackCandidates = (filters: Partial<Record<CanonicalFilter, string>>): DimSelection[] => {
  const requested = buildRequestedDim(filters);
  const list: DimSelection[] = [];

  if (requested.keys.length > 0) {
    list.push(requested);
  }
  const pushCandidate = (keys: CanonicalFilter[]) => {
    if (keys.some((key) => !filters[key])) return;
    const compositeKeyEligible = keys.every((key) => key === "country" || key === "category" || key === "asset") && keys.length >= 2;
    list.push({
      dimType: keys.join("|"),
      dimKey: keys.map((key) => filters[key] as string).join(compositeKeyEligible ? "::" : "|"),
      keys,
    });
  };

  pushCandidate(["country", "category", "asset"]);
  pushCandidate(["country", "category"]);
  pushCandidate(["country", "asset"]);
  pushCandidate(["category", "asset"]);

  pushCandidate(["country"]);
  pushCandidate(["city"]);
  pushCandidate(["category"]);
  pushCandidate(["asset"]);
  pushCandidate(["source"]);
  pushCandidate(["promoted"]);
  pushCandidate(["verification"]);

  list.push({ dimType: "all", dimKey: "all", keys: [] });

  const unique = new Map<string, DimSelection>();
  for (const candidate of list) {
    unique.set(`${candidate.dimType}::${candidate.dimKey}`, candidate);
  }

  return [...unique.values()];
};

const buildRangeStart = (now: Date, range: TrendRange, grain: TrendGrain) => {
  const end = bucketStart(now, grain);
  const config = RANGE_CONFIG[range];

  if (config.lookbackHours) return addBucket(end, "1h", -config.lookbackHours + 1);
  if (config.lookbackDays) return addBucket(end, "1d", -config.lookbackDays + 1);
  if (config.lookbackWeeks) return addBucket(end, "1w", -config.lookbackWeeks + 1);

  return end;
};

export async function GET(request: Request) {
  const route = "api_stats_trends";
  const parsedRange = parseRange(request);

  if (!parsedRange) {
    return NextResponse.json<TrendsBadRequestResponse>({ ok: false, error: "invalid_range" }, {
      status: 400,
      headers: {
        "Cache-Control": NO_STORE,
        ...buildDataSourceHeaders("db", false),
      },
    });
  }

  const range = parsedRange;
  const { grain } = RANGE_CONFIG[range];
  const normalizedFilters = resolveFilters(request);
  const requestedDim = buildRequestedDim(normalizedFilters.values);
  const candidates = buildFallbackCandidates(normalizedFilters.values);
  const queryAsOf = new Date();
  const rangeStart = buildRangeStart(queryAsOf, range, grain);

  if (!hasDatabaseUrl()) {
    return NextResponse.json<TrendsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
      status: 503,
      headers: {
        "Cache-Control": NO_STORE,
        ...buildDataSourceHeaders("db", true),
      },
    });
  }

  try {
    const hasTimeseries = await tableExists(route, "stats_timeseries");
    if (!hasTimeseries) {
      const response: StatsTrendsResponse = {
        ok: true,
        range,
        grain,
        last_updated: queryAsOf.toISOString(),
        points: [],
        stack: [],
        meta: {
          reason: "no_history_data",
          grain,
          dim_type: requestedDim.dimType,
          dim_key: requestedDim.dimKey,
          has_data: false,
          missing_reason: "no_saved_cube",
          last_updated: null,
          requested: {
            dim_type: requestedDim.dimType,
            dim_key: requestedDim.dimKey,
            filters_summary: normalizedFilters.values,
          },
          used: {
            dim_type: "all",
            dim_key: "all",
          },
          fallback: {
            applied: requestedDim.dimType !== "all" || requestedDim.dimKey !== "all",
            reason: "no_saved_cube_for_requested",
            dropped_filters: requestedDim.keys,
            warnings: normalizedFilters.warnings,
          },
        },
        response_meta: { source: "db", as_of: queryAsOf.toISOString() },
      };

      return NextResponse.json(response, {
        headers: {
          "Cache-Control": CACHE_CONTROL_BY_GRAIN[grain],
          ...buildDataSourceHeaders("db", false),
        },
      });
    }

    let usedDim = candidates[candidates.length - 1];
    for (const candidate of candidates) {
      const exists = await dbQuery<{ exists: number }>(
        `SELECT 1 AS exists
         FROM public.stats_timeseries
         WHERE grain = $1
           AND dim_type = $2
           AND dim_key = $3
           AND period_start >= $4
         LIMIT 1`,
        [grain, candidate.dimType, candidate.dimKey, rangeStart.toISOString()],
        { route },
      );
      if (exists.rows.length > 0) {
        usedDim = candidate;
        break;
      }
    }

    const { rows } = await dbQuery<{
      period_start: string;
      total_count: string;
      verified_count: string;
      accepting_any_count: string;
      breakdown_json: {
        verification?: {
          owner?: number;
          community?: number;
          directory?: number;
          unverified?: number;
        };
      } | null;
      generated_at: string;
      max_generated_at: string | null;
    }>(
      `SELECT
         period_start,
         total_count,
         verified_count,
         accepting_any_count,
         breakdown_json,
         generated_at,
         MAX(generated_at) OVER () AS max_generated_at
       FROM public.stats_timeseries
       WHERE grain = $1
         AND dim_type = $2
         AND dim_key = $3
         AND period_start >= $4
       ORDER BY period_start ASC`,
      [grain, usedDim.dimType, usedDim.dimKey, rangeStart.toISOString()],
      { route },
    );

    let runningTotal = 0;
    let runningVerified = 0;
    let runningAcceptingAny = 0;
    let runningOwner = 0;
    let runningCommunity = 0;
    let runningDirectory = 0;
    let runningUnverified = 0;

    const points: StatsTrendsResponse["points"] = [];
    const stack: VerificationStackedPoint[] = [];

    for (const row of rows) {
      const bucketDate = bucketStart(new Date(row.period_start), grain);
      const label = formatBucketLabel(bucketDate, grain);
      const totalDelta = Number(row.total_count ?? 0);
      const verifiedDelta = Number(row.verified_count ?? 0);
      const acceptingAnyDelta = Number(row.accepting_any_count ?? 0);
      const verification = row.breakdown_json?.verification ?? {};
      const ownerDelta = Number(verification.owner ?? 0);
      const communityDelta = Number(verification.community ?? 0);
      const directoryDelta = Number(verification.directory ?? 0);
      const unverifiedDelta = Number(verification.unverified ?? 0);

      runningTotal += totalDelta;
      runningVerified += verifiedDelta;
      runningAcceptingAny += acceptingAnyDelta;
      runningOwner += ownerDelta;
      runningCommunity += communityDelta;
      runningDirectory += directoryDelta;
      runningUnverified += unverifiedDelta;

      points.push({
        date: label,
        total: runningTotal,
        delta: totalDelta,
        verified_total: runningVerified,
        verified_delta: verifiedDelta,
        accepting_any_total: runningAcceptingAny,
        accepting_any_delta: acceptingAnyDelta,
      });

      stack.push({
        date: label,
        owner: runningOwner,
        community: runningCommunity,
        directory: runningDirectory,
        unverified: runningUnverified,
      });
    }

    const lastUpdated = rows[0]?.max_generated_at ?? null;
    const hasData = rows.length > 0;
    const droppedFilters = requestedDim.keys.filter((key) => !usedDim.keys.includes(key));
    const fallbackApplied = requestedDim.dimType !== usedDim.dimType || requestedDim.dimKey !== usedDim.dimKey;

    const response: StatsTrendsResponse = {
      ok: true,
      range,
      grain,
      last_updated: lastUpdated ?? queryAsOf.toISOString(),
      points,
      stack,
      meta: {
        ...(hasData ? {} : { reason: "no_history_data" as const }),
        grain,
        dim_type: usedDim.dimType,
        dim_key: usedDim.dimKey,
        has_data: hasData,
        ...(hasData ? {} : { missing_reason: "no_saved_cube" as const }),
        last_updated: lastUpdated,
        requested: {
          dim_type: requestedDim.dimType,
          dim_key: requestedDim.dimKey,
          filters_summary: normalizedFilters.values,
        },
        used: {
          dim_type: usedDim.dimType,
          dim_key: usedDim.dimKey,
        },
        fallback: {
          applied: fallbackApplied,
          reason: fallbackApplied ? "no_saved_cube_for_requested" : "none",
          dropped_filters: droppedFilters,
          warnings: normalizedFilters.warnings,
        },
      },
      response_meta: { source: "db", as_of: queryAsOf.toISOString() },
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": CACHE_CONTROL_BY_GRAIN[grain],
        ...buildDataSourceHeaders("db", false),
      },
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json<TrendsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
        status: 503,
        headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
      });
    }
    console.error("[stats] failed to load trends", error);
    return NextResponse.json<TrendsUnavailableResponse>({ ok: false, error: "stats_unavailable", reason: "db_error" }, {
      status: 503,
      headers: { "Cache-Control": NO_STORE, ...buildDataSourceHeaders("db", true) },
    });
  }
}
