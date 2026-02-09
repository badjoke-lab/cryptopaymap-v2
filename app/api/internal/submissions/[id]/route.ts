import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { buildDataSourceHeaders } from "@/lib/dataSource";
import { buildSubmissionMediaUrl } from "@/lib/media/submissionMedia";
import { ensureSubmissionColumns, mapSubmissionRow, tableExists } from "@/lib/internal-submissions";
import type { SubmissionMediaKind } from "@/lib/storage/r2";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

const extractMediaIdFromKey = (key?: string | null) => {
  if (!key) return null;
  const match = key.match(/\/([^/]+)\.webp$/);
  return match ? match[1] : key;
};

const extractMediaIdFromUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : url;
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  const { id } = params;
  const dryRunParam = new URL(request.url).searchParams.get("dryRun") ?? "";
  const dryRun = id.startsWith("dryrun-") || ["1", "true", "yes"].includes(dryRunParam.toLowerCase());
  if (dryRun) {
    const kindMatch = id.match(/^dryrun-(owner|community|report)-/);
    const kind = kindMatch?.[1] ?? "community";
    return NextResponse.json({
      submission: {
        id,
        status: "approved",
        kind,
        dryRun: true,
      },
    });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json(
      { error: "DB_UNAVAILABLE" },
      { status: 503, headers: buildDataSourceHeaders("db", true) },
    );
  }

  const route = "api_internal_submissions_detail";
  const { id: submissionId } = params;

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
      `SELECT id, status, kind, level, created_at, updated_at,
        COALESCE(payload->>'name','') AS name,
        COALESCE(payload->>'country','') AS country,
        COALESCE(payload->>'city','') AS city,
        place_id,
        submitted_by, reviewed_by, review_note, payload, published_place_id, approved_at, rejected_at, reject_reason
       FROM submissions
      WHERE id = $1`,
      [submissionId],
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
      ? await dbQuery<{ column_name: string }>(
          `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'submission_media'
          `,
          [],
          { route },
        )
      : { rows: [] };

    const mediaColumns = new Set(mediaRows.rows.map((row) => row.column_name));

    const mediaRecords = hasMediaTable
      ? await dbQuery<{
          id: number;
          kind: SubmissionMediaKind;
          media_id: string | null;
          r2_key: string | null;
          mime: string | null;
          width: number | null;
          height: number | null;
          created_at: string | null;
          url: string | null;
        }>(
          `SELECT id,
              kind,
              ${mediaColumns.has("media_id") ? "media_id" : "NULL::text AS media_id"},
              ${mediaColumns.has("r2_key") ? "r2_key" : "NULL::text AS r2_key"},
              ${mediaColumns.has("mime") ? "mime" : "NULL::text AS mime"},
              ${mediaColumns.has("width") ? "width" : "NULL::int AS width"},
              ${mediaColumns.has("height") ? "height" : "NULL::int AS height"},
              ${mediaColumns.has("created_at") ? "created_at" : "NULL::timestamptz AS created_at"},
              ${mediaColumns.has("url") ? "url" : "NULL::text AS url"}
           FROM submission_media
           WHERE submission_id = $1
           ORDER BY id ASC`,
          [submissionId],
          { route },
        )
      : { rows: [] };

    const media = mediaRecords.rows
      .map((mediaRow) => {
        const mediaId =
          mediaRow.media_id ??
          extractMediaIdFromKey(mediaRow.r2_key) ??
          extractMediaIdFromUrl(mediaRow.url);
        if (!mediaId) {
          return null;
        }

        return {
          kind: mediaRow.kind,
          mediaId,
          url: buildSubmissionMediaUrl(submissionId, mediaRow.kind, mediaId),
          mime: mediaRow.mime,
          width: mediaRow.width,
          height: mediaRow.height,
          createdAt: mediaRow.created_at,
        };
      })
      .filter(Boolean);

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
