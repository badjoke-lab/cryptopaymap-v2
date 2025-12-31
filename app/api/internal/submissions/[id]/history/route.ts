import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { ensureHistoryTable, mapHistoryRow } from "@/lib/history";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const route = "api_internal_submissions_history";
  const { id } = params;

  try {
    await ensureHistoryTable(route);

    const { rows } = await dbQuery<{
      id: string;
      actor: string;
      action: string;
      submission_id: string;
      place_id: string | null;
      created_at: string;
      meta: Record<string, unknown> | null;
    }>(
      `SELECT id, actor, action, submission_id, place_id, created_at, meta
       FROM public.history
       WHERE submission_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id],
      { route },
    );

    return NextResponse.json({ entries: rows.map(mapHistoryRow) });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] failed to load history", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }
}
