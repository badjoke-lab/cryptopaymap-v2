import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { ensureSubmissionColumns, mapSubmissionRow, tableExists } from "@/lib/internal-submissions";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

const extractMediaId = (url: string) => {
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : url;
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
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

  const route = "api_internal_submissions_detail";
  const { id } = params;

  try {
    const submissionsTableExists = await tableExists(route, "submissions");
    if (!submissionsTableExists) {
      return NextResponse.json(
        { error: "submissions table is missing" },
        { status: 500, headers: buildDataSourceHeaders("db", true) },
      );
    }

    await ensureSubmissionColumns(route);

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
    }>(
      `SELECT id, status, kind, level, created_at, updated_at, name, country, city, place_id,
        submitted_by, reviewed_by, review_note, payload, published_place_id, approved_at, rejected_at, reject_reason
       FROM submissions
       WHERE id = $1`,
      [id],
      { route },
    );

    const row = rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404, headers: buildDataSourceHeaders("db", false) },
      );
    }

    const mediaTableResult = await dbQuery<{ present: string | null }>(
      "SELECT to_regclass('public.submission_media') AS present",
      [],
      { route },
    );
    const hasMediaTable = Boolean(mediaTableResult.rows[0]?.present);
    const mediaRows = hasMediaTable
      ? await dbQuery<{ id: number; kind: string; url: string }>(
          `SELECT id, kind, url
           FROM submission_media
           WHERE submission_id = $1
           ORDER BY id ASC`,
          [id],
          { route },
        )
      : { rows: [] };

    const media = mediaRows.rows.map((mediaRow) => ({
      kind: mediaRow.kind,
      url: mediaRow.url,
      mediaId: extractMediaId(mediaRow.url),
    }));

    return NextResponse.json(
      { submission: { ...mapSubmissionRow(row), media } },
      { headers: buildDataSourceHeaders("db", false) },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json(
        { error: "DB_UNAVAILABLE" },
        { status: 503, headers: buildDataSourceHeaders("db", true) },
      );
    }
    console.error("[internal submissions] failed to load", error);
    return NextResponse.json(
      { error: "Failed to load submission" },
      { status: 500, headers: buildDataSourceHeaders("db", true) },
    );
  }
}
