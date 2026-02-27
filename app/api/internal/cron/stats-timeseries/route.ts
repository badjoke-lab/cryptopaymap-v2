import { NextResponse } from "next/server";

import { runStatsTimeseriesJob } from "@/lib/stats/generateTimeseries";
import { getStatsStaleness } from "@/lib/stats/staleness";

const NO_STORE = "no-store";
const WEEKLY_RUN_UTC_DAY = 1; // Monday (UTC)

type JobResult = {
  facts: number;
  upserted: number;
  topN: number;
};

const hasCronSecret = (request: Request, secret: string) => {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  return bearer === secret || headerSecret === secret;
};

const jsonNoStore = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": NO_STORE,
    },
  });


const logStaleness = async (logPrefix: string) => {
  const targets = [
    { grain: "1h" as const, dimType: "all", dimKey: "all" },
    { grain: "1d" as const, dimType: "all", dimKey: "all" },
    { grain: "1w" as const, dimType: "all", dimKey: "all" },
  ];

  const checks = await Promise.all(
    targets.map((target) => getStatsStaleness({
      grain: target.grain,
      dimType: target.dimType,
      dimKey: target.dimKey,
      route: "cron_stats_timeseries_staleness",
    })),
  );

  for (const check of checks) {
    const status = check.status === "stale" ? "STALE" : "FRESH";
    console.log(`${logPrefix} [stats][stale] grain=${check.grain} dim=${check.dimType}/${check.dimKey} last_period_start=${check.lastPeriodStart ?? "none"} generated_at=${check.lastGeneratedAt ?? "none"} ageHours=${check.ageHours ?? "n/a"} generatedAgeHours=${check.generatedAgeHours ?? "n/a"} status=${status} reason=${check.reason}`);
  }

  return checks;
};

const handle = async (request: Request) => {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const logPrefix = "[cron][stats-timeseries]";

  if (!cronSecret) {
    return jsonNoStore(
      {
        ok: false,
        error: "misconfigured",
        startedAt: startedAtIso,
      },
      500,
    );
  }

  if (!hasCronSecret(request, cronSecret)) {
    return jsonNoStore(
      {
        ok: false,
        error: "forbidden",
        startedAt: startedAtIso,
      },
      403,
    );
  }

  const mode = "daily";

  try {
    console.log(`${logPrefix} start mode=${mode}`);

    const hourlyResult: JobResult = await runStatsTimeseriesJob("hourly", {
      route: "cron_stats_timeseries_hourly",
      sinceHours: 48,
    });
    console.log(`${logPrefix} hourly upserted=${hourlyResult.upserted} facts=${hourlyResult.facts}`);

    const dailyResult: JobResult = await runStatsTimeseriesJob("daily", {
      route: "cron_stats_timeseries_daily",
    });
    console.log(`${logPrefix} daily upserted=${dailyResult.upserted} facts=${dailyResult.facts}`);

    const isWeeklyDay = startedAt.getUTCDay() === WEEKLY_RUN_UTC_DAY;
    let weeklyResult: JobResult | null = null;

    if (isWeeklyDay) {
      weeklyResult = await runStatsTimeseriesJob("weekly", {
        route: "cron_stats_timeseries_weekly",
      });
      console.log(`${logPrefix} weekly upserted=${weeklyResult.upserted} facts=${weeklyResult.facts}`);
    } else {
      console.log(`${logPrefix} weekly skipped reason=not_monday_utc`);
    }

    const staleness = await logStaleness(logPrefix);

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    console.log(`${logPrefix} done mode=${mode} durationMs=${durationMs}`);

    return jsonNoStore({
      ok: true,
      job: mode,
      startedAt: startedAtIso,
      finishedAt: finishedAt.toISOString(),
      durationMs,
      counts: {
        hourly: hourlyResult,
        daily: dailyResult,
        weekly: weeklyResult,
      },
      weekly: {
        ran: Boolean(weeklyResult),
        reason: weeklyResult ? null : "not_monday_utc",
      },
      staleness,
    });
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "generation_failed";
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    console.error(`${logPrefix} failed mode=${mode} error=${message} durationMs=${durationMs}`, error);

    return jsonNoStore(
      {
        ok: false,
        job: mode,
        startedAt: startedAtIso,
        finishedAt: finishedAt.toISOString(),
        durationMs,
        error: message,
      },
      500,
    );
  }
};

export const GET = handle;
export const POST = handle;
