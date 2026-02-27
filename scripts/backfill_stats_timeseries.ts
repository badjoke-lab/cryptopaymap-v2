import { Grain, runStatsTimeseriesGeneration } from "@/lib/stats/generateTimeseries";

type CliOptions = {
  grain: Grain;
  since?: string;
  until?: string;
  days?: number;
  weeks?: number;
  hours?: number;
  topN: number;
};

const DEFAULTS: Record<Grain, { lookback: number }> = {
  "1h": { lookback: 48 },
  "1d": { lookback: 7 },
  "1w": { lookback: 8 },
};

const printHelp = () => {
  console.log(`Usage:\n  pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1d [--days=90] [--top-n=30]\n  pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1w [--weeks=52] [--top-n=30]\n  pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1h [--hours=48] [--top-n=30]\n  pnpm tsx scripts/backfill_stats_timeseries.ts --grain=1d --since=2026-01-01 --until=2026-02-01`);
};

const parseIntValue = (name: string, value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return Math.floor(parsed);
};

const parseUtcDate = (raw: string) => {
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${raw}. Expected YYYY-MM-DD.`);
  }
  return parsed;
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

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const options: Partial<CliOptions> = {
    topN: 30,
  };

  for (const arg of args) {
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key?.startsWith("--") || !value) continue;

    if (key === "--grain" && ["1h", "1d", "1w"].includes(value)) {
      options.grain = value as Grain;
    } else if (key === "--since") {
      options.since = value;
    } else if (key === "--until") {
      options.until = value;
    } else if (key === "--days") {
      options.days = parseIntValue("--days", value);
    } else if (key === "--weeks") {
      options.weeks = parseIntValue("--weeks", value);
    } else if (key === "--hours") {
      options.hours = parseIntValue("--hours", value);
    } else if (key === "--top-n") {
      options.topN = parseIntValue("--top-n", value);
    }
  }

  if (!options.grain) {
    throw new Error("--grain is required (1h | 1d | 1w)");
  }

  return options as CliOptions;
};

const resolveRange = (options: CliOptions) => {
  const now = new Date();
  const grain = options.grain;
  const endExclusive = (() => {
    if (options.until) {
      return addBucket(bucketStart(parseUtcDate(options.until), grain), grain, 1);
    }
    return addBucket(bucketStart(now, grain), grain, 1);
  })();

  let start = options.since ? bucketStart(parseUtcDate(options.since), grain) : null;

  if (!start) {
    if (grain === "1h") {
      const lookback = options.hours ?? DEFAULTS[grain].lookback;
      start = addBucket(endExclusive, grain, -lookback);
    } else if (grain === "1d") {
      const lookback = options.days ?? DEFAULTS[grain].lookback;
      start = addBucket(endExclusive, grain, -lookback);
    } else {
      const lookback = options.weeks ?? DEFAULTS[grain].lookback;
      start = addBucket(endExclusive, grain, -lookback);
    }
  }

  if (start >= endExclusive) {
    throw new Error("Invalid range: start must be earlier than end.");
  }

  return { start, endExclusive };
};

const runBucket = async (grain: Grain, bucketStartAt: Date, topN: number) => {
  if (grain === "1h") {
    return runStatsTimeseriesGeneration({
      grain,
      hourStart: bucketStartAt.toISOString(),
      topN,
      route: "scripts_backfill_stats_timeseries",
    });
  }

  if (grain === "1d") {
    return runStatsTimeseriesGeneration({
      grain,
      date: bucketStartAt.toISOString().slice(0, 10),
      topN,
      route: "scripts_backfill_stats_timeseries",
    });
  }

  return runStatsTimeseriesGeneration({
    grain,
    weekStart: bucketStartAt.toISOString().slice(0, 10),
    topN,
    route: "scripts_backfill_stats_timeseries",
  });
};

const main = async () => {
  const options = parseArgs();
  const { start, endExclusive } = resolveRange(options);

  const buckets: Date[] = [];
  for (let cursor = new Date(start); cursor < endExclusive; cursor = addBucket(cursor, options.grain, 1)) {
    buckets.push(new Date(cursor));
  }

  console.log("[backfill_stats_timeseries] start", {
    grain: options.grain,
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
    buckets: buckets.length,
    safeDefault: !options.since && !options.until,
  });

  let totalFacts = 0;
  let totalUpserted = 0;

  for (let index = 0; index < buckets.length; index += 1) {
    const bucket = buckets[index];
    const progress = `${index + 1}/${buckets.length}`;

    const result = await runBucket(options.grain, bucket, options.topN);
    totalFacts += result.facts;
    totalUpserted += result.upserted;

    console.log("[backfill_stats_timeseries] bucket", {
      progress,
      bucket_start: bucket.toISOString(),
      window_start: result.windowStart,
      window_end: result.windowEnd,
      facts: result.facts,
      upserted: result.upserted,
    });
  }

  console.log("[backfill_stats_timeseries] done", {
    grain: options.grain,
    buckets: buckets.length,
    facts: totalFacts,
    upserted: totalUpserted,
  });
};

main().catch((error) => {
  console.error("[backfill_stats_timeseries] failed", error);
  process.exitCode = 1;
});
