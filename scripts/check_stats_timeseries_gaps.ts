import { dbQuery, hasDatabaseUrl } from "@/lib/db";
import { Grain } from "@/lib/stats/generateTimeseries";

type CliOptions = {
  grain: Grain;
  since?: string;
  until?: string;
  days?: number;
  weeks?: number;
  hours?: number;
  dimType: string;
  dimKey: string;
  maxList: number;
  failIfGapsAbove?: number;
};

const printHelp = () => {
  console.log(`Usage:\n  pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1d --days=90\n  pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1w --weeks=52\n  pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1h --hours=48 --dim-type=all --dim-key=all\n  pnpm tsx scripts/check_stats_timeseries_gaps.ts --grain=1d --since=2026-01-01 --until=2026-03-01 --fail-if-gaps-above=0`);
};

const parseIntValue = (name: string, raw: string) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number.`);
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
  if (grain === "1h") value.setUTCHours(value.getUTCHours() + count);
  else if (grain === "1d") value.setUTCDate(value.getUTCDate() + count);
  else value.setUTCDate(value.getUTCDate() + count * 7);
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
    dimType: "all",
    dimKey: "all",
    maxList: 10,
  };

  for (const arg of args) {
    const [rawKey, rawValue] = arg.split("=");
    const key = rawKey?.trim();
    const value = rawValue?.trim();
    if (!key?.startsWith("--") || value === undefined) continue;

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
    } else if (key === "--dim-type") {
      options.dimType = value || "all";
    } else if (key === "--dim-key") {
      options.dimKey = value || "all";
    } else if (key === "--max-list") {
      options.maxList = parseIntValue("--max-list", value);
    } else if (key === "--fail-if-gaps-above") {
      options.failIfGapsAbove = parseIntValue("--fail-if-gaps-above", value);
    }
  }

  if (!options.grain) {
    throw new Error("--grain is required (1h | 1d | 1w)");
  }

  return options as CliOptions;
};

const resolveRange = (options: CliOptions) => {
  const now = new Date();
  const endExclusive = options.until
    ? addBucket(bucketStart(parseUtcDate(options.until), options.grain), options.grain, 1)
    : addBucket(bucketStart(now, options.grain), options.grain, 1);

  const since = options.since ? bucketStart(parseUtcDate(options.since), options.grain) : null;

  const lookback = (() => {
    if (options.grain === "1h") return options.hours ?? 48;
    if (options.grain === "1d") return options.days ?? 90;
    return options.weeks ?? 52;
  })();

  const start = since ?? addBucket(endExclusive, options.grain, -lookback);
  if (start >= endExclusive) {
    throw new Error("Invalid range: start must be earlier than end.");
  }

  return { start, endExclusive };
};

const compressRanges = (gaps: string[], grain: Grain) => {
  if (gaps.length === 0) return [] as Array<{ start: string; end: string; length: number }>;

  const ranges: Array<{ start: string; end: string; length: number }> = [];
  let rangeStart = new Date(gaps[0]);
  let previous = new Date(gaps[0]);
  let count = 1;

  for (let index = 1; index < gaps.length; index += 1) {
    const current = new Date(gaps[index]);
    const expectedNext = addBucket(previous, grain, 1);
    if (expectedNext.getTime() === current.getTime()) {
      previous = current;
      count += 1;
      continue;
    }

    ranges.push({ start: rangeStart.toISOString(), end: previous.toISOString(), length: count });
    rangeStart = current;
    previous = current;
    count = 1;
  }

  ranges.push({ start: rangeStart.toISOString(), end: previous.toISOString(), length: count });
  return ranges;
};

const main = async () => {
  const options = parseArgs();

  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required.");
  }

  const { start, endExclusive } = resolveRange(options);

  const { rows } = await dbQuery<{ period_start: string }>(
    `SELECT period_start
     FROM public.stats_timeseries
     WHERE grain = $1
       AND dim_type = $2
       AND dim_key = $3
       AND period_start >= $4
       AND period_start < $5
     ORDER BY period_start ASC`,
    [options.grain, options.dimType, options.dimKey, start.toISOString(), endExclusive.toISOString()],
    { route: "scripts_check_stats_timeseries_gaps" },
  );

  const existing = new Set(rows.map((row) => new Date(row.period_start).toISOString()));

  const expected: string[] = [];
  for (let cursor = new Date(start); cursor < endExclusive; cursor = addBucket(cursor, options.grain, 1)) {
    expected.push(cursor.toISOString());
  }

  const gaps = expected.filter((bucket) => !existing.has(bucket));
  const ranges = compressRanges(gaps, options.grain);

  console.log("[check_stats_timeseries_gaps] result", {
    grain: options.grain,
    dim_type: options.dimType,
    dim_key: options.dimKey,
    since: start.toISOString(),
    until_exclusive: endExclusive.toISOString(),
    expected_count: expected.length,
    actual_count: rows.length,
    gaps_count: gaps.length,
    gap_samples: gaps.slice(0, options.maxList),
    gap_ranges: ranges.slice(0, options.maxList),
  });

  if (options.failIfGapsAbove !== undefined && gaps.length > options.failIfGapsAbove) {
    console.error("[check_stats_timeseries_gaps] threshold exceeded", {
      fail_if_gaps_above: options.failIfGapsAbove,
      gaps_count: gaps.length,
    });
    process.exitCode = 2;
  }
};

main().catch((error) => {
  console.error("[check_stats_timeseries_gaps] failed", error);
  process.exitCode = 1;
});
