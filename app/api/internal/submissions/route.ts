import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { ensureSubmissionColumns, mapSubmissionRow, tableExists } from "@/lib/internal-submissions";

export const runtime = "nodejs";

const MAX_LIMIT = 200;

const parseLimit = (value: string | null) => {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, MAX_LIMIT);
};

export async function GET(request: NextRequest) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const route = "api_internal_submissions_list";
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "pending";
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const submissionsTableExists = await tableExists(route, "submissions");
    if (!submissionsTableExists) {
      return NextResponse.json({ error: "submissions table is missing" }, { status: 500 });
    }

    await ensureSubmissionColumns(route);

    const params: unknown[] = [];
    const where: string[] = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const query = `SELECT id, status, kind, created_at, name, country, city, payload,
      published_place_id, approved_at, rejected_at, reject_reason
      FROM submissions
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}`;

    params.push(limit);

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
    }>(query, params, { route });

    const submissions = rows.map(mapSubmissionRow);
    return NextResponse.json({ submissions });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] failed to list", error);
    return NextResponse.json({ error: "Failed to load submissions" }, { status: 500 });
  }
}
