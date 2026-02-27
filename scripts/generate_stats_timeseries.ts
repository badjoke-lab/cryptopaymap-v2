import {
  DEFAULT_STATS_TIMESERIES_SINCE_HOURS,
  DEFAULT_STATS_TIMESERIES_TOP_N,
  Grain,
  runStatsTimeseriesGeneration,
} from "@/lib/stats/generateTimeseries";

type CliOptions = {
  grain: Grain;
  date?: string;
  weekStart?: string;
  sinceHours: number;
  topN: number;
};

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
    sinceHours: DEFAULT_STATS_TIMESERIES_SINCE_HOURS,
    topN: DEFAULT_STATS_TIMESERIES_TOP_N,
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

const main = async () => {
  const options = parseArgs();

  const result = await runStatsTimeseriesGeneration({
    ...options,
    route: "scripts_generate_stats_timeseries",
  });

  console.log("[generate_stats_timeseries] done", {
    grain: result.grain,
    window_start: result.windowStart,
    window_end: result.windowEnd,
    facts: result.facts,
    upserted: result.upserted,
    top_n: result.topN,
  });
};

main().catch((error) => {
  console.error("[generate_stats_timeseries] failed", error);
  process.exitCode = 1;
});
