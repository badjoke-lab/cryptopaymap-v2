import { dbQuery } from "@/lib/db";
import { hasColumn, tableExists } from "@/lib/internal-submissions";
import type { SubmissionMediaKind } from "@/lib/storage/r2";

type SubmissionMediaRetentionRow = {
  id: number;
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId: string | null;
  r2Key: string | null;
  url: string | null;
  createdAt: string | null;
  status: string | null;
  publishedPlaceId: string | null;
};

type SubmissionMediaColumns = {
  mediaId: boolean;
  r2Key: boolean;
  url: boolean;
  createdAt: boolean;
};

const loadSubmissionMediaColumns = async (route: string) => {
  const result = await dbQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'submission_media'
        AND column_name = ANY($1::text[])
    `,
    [["media_id", "r2_key", "url", "created_at"]],
    { route },
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    mediaId: columns.has("media_id"),
    r2Key: columns.has("r2_key"),
    url: columns.has("url"),
    createdAt: columns.has("created_at"),
  };
};

const buildAdoptedClause = (hasStatus: boolean, hasPublishedPlaceId: boolean) => {
  const clauses: string[] = [];
  if (hasStatus) {
    clauses.push("COALESCE(s.status = 'approved', false)");
  }
  if (hasPublishedPlaceId) {
    clauses.push("COALESCE(s.published_place_id IS NOT NULL, false)");
  }
  if (!clauses.length) return null;
  return clauses.length === 1 ? clauses[0] : `(${clauses.join(" OR ")})`;
};

export const findSubmissionMediaRetentionCandidates = async (params: {
  route: string;
  kind: SubmissionMediaKind;
  before: Date;
  requireUnadoptedGallery?: boolean;
}) => {
  const { route, kind, before, requireUnadoptedGallery } = params;
  const warnings: string[] = [];

  const hasSubmissionMediaTable = await tableExists(route, "submission_media");
  if (!hasSubmissionMediaTable) {
    warnings.push("submission_media table is missing");
    return { rows: [] as SubmissionMediaRetentionRow[], warnings };
  }

  const columns = await loadSubmissionMediaColumns(route);
  if (!columns.createdAt) {
    warnings.push("submission_media.created_at column is missing");
    return { rows: [] as SubmissionMediaRetentionRow[], warnings };
  }

  let joinClause = "";
  let adoptedClause: string | null = null;
  if (requireUnadoptedGallery) {
    const hasSubmissionsTable = await tableExists(route, "submissions");
    if (!hasSubmissionsTable) {
      warnings.push("submissions table is missing; skipping gallery retention");
      return { rows: [] as SubmissionMediaRetentionRow[], warnings };
    }
    const hasStatus = await hasColumn(route, "submissions", "status");
    const hasPublishedPlaceId = await hasColumn(route, "submissions", "published_place_id");
    adoptedClause = buildAdoptedClause(hasStatus, hasPublishedPlaceId);
    if (!adoptedClause) {
      warnings.push("submissions adoption columns missing; skipping gallery retention");
      return { rows: [] as SubmissionMediaRetentionRow[], warnings };
    }
    joinClause = "LEFT JOIN submissions s ON s.id = sm.submission_id";
  }

  const filters = ["sm.kind = $1", "sm.created_at < $2"];
  if (adoptedClause) {
    filters.push(`NOT (${adoptedClause})`);
  }

  const { rows } = await dbQuery<SubmissionMediaRetentionRow>(
    `
      SELECT sm.id,
        sm.submission_id AS "submissionId",
        sm.kind,
        ${columns.mediaId ? 'sm.media_id AS "mediaId",' : 'NULL::text AS "mediaId",'}
        ${columns.r2Key ? 'sm.r2_key AS "r2Key",' : 'NULL::text AS "r2Key",'}
        ${columns.url ? 'sm.url AS "url",' : 'NULL::text AS "url",'}
        ${columns.createdAt ? 'sm.created_at AS "createdAt",' : 'NULL::timestamptz AS "createdAt",'}
        ${adoptedClause ? 's.status AS "status",' : 'NULL::text AS "status",'}
        ${adoptedClause ? 's.published_place_id AS "publishedPlaceId"' : 'NULL::text AS "publishedPlaceId"'}
      FROM submission_media sm
      ${joinClause}
      WHERE ${filters.join(" AND ")}
      ORDER BY sm.created_at ASC
    `,
    [kind, before.toISOString()],
    { route },
  );

  return { rows, warnings };
};

export const deleteSubmissionMediaRetentionRows = async (params: {
  route: string;
  ids: number[];
}) => {
  const { route, ids } = params;
  if (!ids.length) return;

  await dbQuery(
    `
      DELETE FROM submission_media
      WHERE id = ANY($1::bigint[])
    `,
    [ids],
    { route },
  );
};

export type { SubmissionMediaRetentionRow };

