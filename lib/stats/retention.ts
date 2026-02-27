import { Grain } from "@/lib/stats/generateTimeseries";

export const STATS_TIMESERIES_RETENTION_BUCKETS: Record<Grain, number> = {
  "1h": 24 * 60,
  "1d": 365 * 2,
  "1w": 52 * 5,
};
