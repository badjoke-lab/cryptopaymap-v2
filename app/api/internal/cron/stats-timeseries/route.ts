import { NextResponse } from "next/server";

import { runStatsTimeseriesJob, TimeseriesJob } from "@/lib/stats/generateTimeseries";

const NO_STORE = "no-store";

const normalizeJob = (value: string | null): TimeseriesJob | null => {
  if (value === "hourly" || value === "daily" || value === "weekly") {
    return value;
  }
  return null;
};

const getJobFromRequest = async (request: Request) => {
  const url = new URL(request.url);
  const queryJob = normalizeJob(url.searchParams.get("job"));
  if (queryJob) return queryJob;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { job?: string } | null;
    return normalizeJob(body?.job ?? null);
  }

  return null;
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

const handle = async (request: Request) => {
  const startedAt = new Date();
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return jsonNoStore(
      {
        ok: false,
        error: "misconfigured",
        startedAt: startedAt.toISOString(),
      },
      500,
    );
  }

  if (!hasCronSecret(request, cronSecret)) {
    return jsonNoStore(
      {
        ok: false,
        error: "forbidden",
        startedAt: startedAt.toISOString(),
      },
      403,
    );
  }

  const job = await getJobFromRequest(request);
  if (!job) {
    return jsonNoStore(
      {
        ok: false,
        error: "invalid_job",
        startedAt: startedAt.toISOString(),
      },
      400,
    );
  }

  const logPrefix = "[cron][stats-timeseries]";

  try {
    console.log(`${logPrefix} start job=${job}`);

    const result = await runStatsTimeseriesJob(job, {
      route: `cron_stats_timeseries_${job}`,
    });

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    console.log(`${logPrefix} done job=${job} upserted=${result.upserted} facts=${result.facts} durationMs=${durationMs}`);

    return jsonNoStore({
      ok: true,
      job,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      counts: {
        facts: result.facts,
        upserted: result.upserted,
        topN: result.topN,
      },
    });
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "generation_failed";
    console.error(`${logPrefix} failed job=${job} error=${message}`, error);

    return jsonNoStore(
      {
        ok: false,
        job,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        error: message,
      },
      500,
    );
  }
};

export const GET = handle;
export const POST = handle;
