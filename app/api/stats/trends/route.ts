import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { ensureHistoryTable } from "@/lib/history";

export type StatsTrendsPoint = {
  date: string;
  delta: number;
  total: number;
};

export type StatsTrendsResponse = {
  points: StatsTrendsPoint[];
  meta?: { reason: "no_history_data" };
};

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const TREND_DAYS = 30;
const HISTORY_ACTIONS = ["approve", "promote"];

const startOfUtcDay = (date: Date) => {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const buildDateRange = (days: number) => {
  const today = startOfUtcDay(new Date());
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const dates: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + i);
    dates.push(formatDate(current));
  }
  return { start, dates };
};

export async function GET() {
  const route = "api_stats_trends";

  if (!hasDatabaseUrl()) {
    return NextResponse.json<StatsTrendsResponse>(
      { points: [], meta: { reason: "no_history_data" } },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          ...buildDataSourceHeaders("db", true),
        },
      },
    );
  }

  try {
    await ensureHistoryTable(route);

    const { start, dates } = buildDateRange(TREND_DAYS);

    const { rows } = await dbQuery<{ day: string; total: string }>(
      `SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*) AS total
       FROM public.history
       WHERE action = ANY($1::text[])
         AND place_id IS NOT NULL
         AND created_at >= $2
       GROUP BY day
       ORDER BY day ASC`,
      [HISTORY_ACTIONS, start.toISOString()],
      { route },
    );

    if (!rows.length) {
      return NextResponse.json<StatsTrendsResponse>(
        { points: [], meta: { reason: "no_history_data" } },
        {
          headers: {
            "Cache-Control": CACHE_CONTROL,
            ...buildDataSourceHeaders("db", false),
          },
        },
      );
    }

    const deltas = new Map<string, number>();
    rows.forEach((row) => {
      deltas.set(row.day, Number(row.total ?? 0));
    });

    let runningTotal = 0;
    const points = dates.map((date) => {
      const delta = deltas.get(date) ?? 0;
      runningTotal += delta;
      return {
        date,
        delta,
        total: runningTotal,
      };
    });

    return NextResponse.json<StatsTrendsResponse>(
      { points },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
          ...buildDataSourceHeaders("db", false),
        },
      },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "DB_UNAVAILABLE" },
        { status: 503, headers: buildDataSourceHeaders("db", true) },
      );
    }
    console.error("[stats] failed to load trends", error);
    return NextResponse.json(
      { error: "Failed to load trends" },
      { status: 500, headers: buildDataSourceHeaders("db", true) },
    );
  }
}
