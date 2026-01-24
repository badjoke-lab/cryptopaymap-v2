import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { ensureSubmissionColumns, mapSubmissionRow, tableExists } from "@/lib/internal-submissions";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

const MAX_LIMIT = 200;

const parseLimit = (value: string | null) => {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  return Math.min(parsed, MAX_LIMIT);
};

export async function GET(request: NextRequest) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: "DB_UNAVAILABLE" },
      { status: 503, headers: buildDataSourceHeaders("db", true) },
    );
  }

  const route = "api_internal_submissions_list";
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") ?? "pending";
  const limit = parseLimit(searchParams.get("limit"));

  try {
    const submissionsTableExists = await tableExists(route, "submissions");
    if (!submissionsTableExists) {
      return NextResponse.json(
        { error: "submissions table is missing" },
        { status: 500, headers: buildDataSourceHeaders("db", true) },
      );
    }

    await ensureSubmissionColumns(route);

    const params: unknown[] = [];
    const where: string[] = [];
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    const query = `SELECT id, status, kind, level, created_at, updated_at, name, country, city, place_id,
      submitted_by, reviewed_by, review_note, payload, published_place_id, approved_at, rejected_at, reject_reason
      FROM submissions
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}`;

    params.push(limit);

    const { rows } = await dbQuery<{
      id: string;
      status: string;
      kind: string;
      level: string | null;
      created_at: string;
      updated_at: string | null;
      name: string;
      country: string;
      city: string;
      place_id: string | null;
      submitted_by: Record<string, unknown> | null;
      reviewed_by: Record<string, unknown> | null;
      review_note: string | null;
      payload: Parameters<typeof mapSubmissionRow>[0]["payload"];
      published_place_id: string | null;
      approved_at: string | null;
      rejected_at: string | null;
      reject_reason: string | null;
    }>(query, params, { route });

    const submissions = rows.map(mapSubmissionRow);
    return NextResponse.json({ submissions }, { headers: buildDataSourceHeaders("db", false) });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "DB_UNAVAILABLE" },
        { status: 503, headers: buildDataSourceHeaders("db", true) },
      );
    }
    console.error("[internal submissions] failed to list", error);
    return NextResponse.json(
      { error: "Failed to load submissions" },
      { status: 500, headers: buildDataSourceHeaders("db", true) },
    );
  }
}
