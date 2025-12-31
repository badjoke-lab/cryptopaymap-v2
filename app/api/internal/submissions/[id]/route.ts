import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { ensureSubmissionColumns, mapSubmissionRow, tableExists } from "@/lib/internal-submissions";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const route = "api_internal_submissions_detail";
  const { id } = params;

  try {
    const submissionsTableExists = await tableExists(route, "submissions");
    if (!submissionsTableExists) {
      return NextResponse.json({ error: "submissions table is missing" }, { status: 500 });
    }

    await ensureSubmissionColumns(route);

    const { rows } = await dbQuery<{
      id: string;
      status: string;
      kind: string;
      created_at: string;
      name: string;
      country: string;
      city: string;
      payload: Parameters<typeof mapSubmissionRow>[0]["payload"];
      published_place_id: string | null;
      approved_at: string | null;
      rejected_at: string | null;
      reject_reason: string | null;
    }>(
      `SELECT id, status, kind, created_at, name, country, city, payload,
        published_place_id, approved_at, rejected_at, reject_reason
       FROM submissions
       WHERE id = $1`,
      [id],
      { route },
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    return NextResponse.json({ submission: mapSubmissionRow(row) });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] failed to load", error);
    return NextResponse.json({ error: "Failed to load submission" }, { status: 500 });
  }
}
