import { dbQuery } from "@/lib/db";

export type StatsGrain = "1h" | "1d" | "1w";

export type StalenessStatus = "fresh" | "stale";

export type StalenessThreshold = {
  maxPeriodLagHours: number;
  maxGeneratedAgeHours: number;
};

export type StatsStaleness = {
  grain: StatsGrain;
  dimType: string;
  dimKey: string;
  status: StalenessStatus;
  reason: "missing" | "period_lag" | "generated_at_lag" | "fresh";
  now: string;
  lastPeriodStart: string | null;
  lastGeneratedAt: string | null;
  ageHours: number | null;
  generatedAgeHours: number | null;
  threshold: StalenessThreshold;
};

export const STALENESS_THRESHOLDS: Record<StatsGrain, StalenessThreshold> = {
  "1h": {
    maxPeriodLagHours: 3,
    maxGeneratedAgeHours: 3,
  },
  "1d": {
    maxPeriodLagHours: 48,
    maxGeneratedAgeHours: 48,
  },
  "1w": {
    maxPeriodLagHours: 24 * 14,
    maxGeneratedAgeHours: 24 * 14,
  },
};

const toHours = (valueMs: number) => Number((valueMs / (1000 * 60 * 60)).toFixed(2));

const staleMissing = (grain: StatsGrain, dimType: string, dimKey: string, now: Date): StatsStaleness => ({
  grain,
  dimType,
  dimKey,
  status: "stale",
  reason: "missing",
  now: now.toISOString(),
  lastPeriodStart: null,
  lastGeneratedAt: null,
  ageHours: null,
  generatedAgeHours: null,
  threshold: STALENESS_THRESHOLDS[grain],
});

export const evaluateStatsStaleness = (params: {
  grain: StatsGrain;
  dimType: string;
  dimKey: string;
  now?: Date;
  lastPeriodStart: string | null;
  lastGeneratedAt: string | null;
}): StatsStaleness => {
  const now = params.now ?? new Date();
  const threshold = STALENESS_THRESHOLDS[params.grain];

  if (!params.lastPeriodStart) {
    return staleMissing(params.grain, params.dimType, params.dimKey, now);
  }

  const lastPeriodStartDate = new Date(params.lastPeriodStart);
  if (Number.isNaN(lastPeriodStartDate.getTime())) {
    return staleMissing(params.grain, params.dimType, params.dimKey, now);
  }

  const ageHours = toHours(now.getTime() - lastPeriodStartDate.getTime());
  const generatedAgeHours = (() => {
    if (!params.lastGeneratedAt) return null;
    const generatedDate = new Date(params.lastGeneratedAt);
    if (Number.isNaN(generatedDate.getTime())) return null;
    return toHours(now.getTime() - generatedDate.getTime());
  })();

  if (ageHours > threshold.maxPeriodLagHours) {
    return {
      grain: params.grain,
      dimType: params.dimType,
      dimKey: params.dimKey,
      status: "stale",
      reason: "period_lag",
      now: now.toISOString(),
      lastPeriodStart: lastPeriodStartDate.toISOString(),
      lastGeneratedAt: params.lastGeneratedAt,
      ageHours,
      generatedAgeHours,
      threshold,
    };
  }

  if (generatedAgeHours !== null && generatedAgeHours > threshold.maxGeneratedAgeHours) {
    return {
      grain: params.grain,
      dimType: params.dimType,
      dimKey: params.dimKey,
      status: "stale",
      reason: "generated_at_lag",
      now: now.toISOString(),
      lastPeriodStart: lastPeriodStartDate.toISOString(),
      lastGeneratedAt: params.lastGeneratedAt,
      ageHours,
      generatedAgeHours,
      threshold,
    };
  }

  return {
    grain: params.grain,
    dimType: params.dimType,
    dimKey: params.dimKey,
    status: "fresh",
    reason: "fresh",
    now: now.toISOString(),
    lastPeriodStart: lastPeriodStartDate.toISOString(),
    lastGeneratedAt: params.lastGeneratedAt,
    ageHours,
    generatedAgeHours,
    threshold,
  };
};

export const getStatsStaleness = async (params: {
  grain: StatsGrain;
  dimType?: string;
  dimKey?: string;
  route?: string;
  now?: Date;
}) => {
  const dimType = params.dimType ?? "all";
  const dimKey = params.dimKey ?? "all";
  const route = params.route ?? "stats_staleness";

  const { rows } = await dbQuery<{ period_start: string; generated_at: string | null }>(
    `SELECT period_start, generated_at
     FROM public.stats_timeseries
     WHERE grain = $1
       AND dim_type = $2
       AND dim_key = $3
     ORDER BY period_start DESC
     LIMIT 1`,
    [params.grain, dimType, dimKey],
    { route },
  );

  const latest = rows[0];

  return evaluateStatsStaleness({
    grain: params.grain,
    dimType,
    dimKey,
    now: params.now,
    lastPeriodStart: latest?.period_start ?? null,
    lastGeneratedAt: latest?.generated_at ?? null,
  });
};
