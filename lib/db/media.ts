import type { PoolClient } from "pg";

import { dbQuery, getDbClient } from "@/lib/db";
import { buildSubmissionMediaUrl } from "@/lib/media/submissionMedia";
import type { SubmissionMediaKind } from "@/lib/storage/r2";
import { buildSubmissionMediaKey } from "@/lib/storage/r2";

type InsertSubmissionMediaParams = {
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId: string;
  r2Key: string;
  mime: string;
  width: number | null;
  height: number | null;
  client?: PoolClient;
  route?: string;
};

type SubmissionMediaRow = {
  id: number;
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId: string | null;
  r2Key: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
};

type SubmissionMediaLookupParams = {
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId: string;
  client?: PoolClient;
  route?: string;
};

const DEFAULT_ROUTE = "/api/submissions";
type SubmissionMediaColumns = {
  mediaId: boolean;
  r2Key: boolean;
  url: boolean;
};

let cachedMediaColumns: SubmissionMediaColumns | null = null;

const getSubmissionMediaColumns = async (route: string, client?: PoolClient) => {
  if (cachedMediaColumns) {
    return cachedMediaColumns;
  }

  const result = await dbQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'submission_media'
        AND column_name = ANY($1::text[])
    `,
    [["media_id", "r2_key", "url"]],
    { route, client },
  );

  const columns = new Set(result.rows.map((row) => row.column_name));
  cachedMediaColumns = {
    mediaId: columns.has("media_id"),
    r2Key: columns.has("r2_key"),
    url: columns.has("url"),
  };

  return cachedMediaColumns;
};

export const insertSubmissionMedia = async ({
  submissionId,
  kind,
  mediaId,
  r2Key,
  mime,
  width,
  height,
  client,
  route = DEFAULT_ROUTE,
}: InsertSubmissionMediaParams): Promise<SubmissionMediaRow> => {
  const result = await dbQuery<SubmissionMediaRow>(
    `
      INSERT INTO public.submission_media (submission_id, kind, media_id, r2_key, mime, width, height)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id,
        submission_id AS "submissionId",
        kind,
        media_id AS "mediaId",
        r2_key AS "r2Key",
        mime,
        width,
        height,
        created_at AS "createdAt"
    `,
    [submissionId, kind, mediaId, r2Key, mime, width, height],
    { route, client },
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("SUBMISSION_MEDIA_INSERT_FAILED");
  }

  return row;
};

export const findSubmissionMediaById = async ({
  submissionId,
  kind,
  mediaId,
  client,
  route = DEFAULT_ROUTE,
}: SubmissionMediaLookupParams): Promise<SubmissionMediaRow | null> => {
  const columns = await getSubmissionMediaColumns(route, client);
  const expectedKey = buildSubmissionMediaKey(submissionId, kind, mediaId);
  const expectedUrl = buildSubmissionMediaUrl(submissionId, kind, mediaId);

  const filters: string[] = [];
  const values: Array<string> = [submissionId, kind];
  let index = 3;

  if (columns.mediaId) {
    filters.push(`media_id = $${index}`);
    values.push(mediaId);
    index += 1;
  }

  if (columns.r2Key) {
    filters.push(`r2_key = $${index}`);
    values.push(expectedKey);
    index += 1;
  }

  if (columns.url) {
    filters.push(`url = $${index}`);
    values.push(expectedUrl);
    index += 1;
  }

  if (filters.length === 0) {
    return null;
  }

  const urlSelect = columns.url ? 'url AS "url",' : 'NULL AS "url",';

  const { rows } = await dbQuery<SubmissionMediaRow>(
    `
      SELECT id,
        submission_id AS "submissionId",
        kind,
        ${columns.mediaId ? 'media_id AS "mediaId",' : 'NULL AS "mediaId",'}
        ${columns.r2Key ? 'r2_key AS "r2Key",' : 'NULL AS "r2Key",'}
        ${urlSelect}
        mime,
        width,
        height,
        created_at AS "createdAt"
      FROM public.submission_media
      WHERE submission_id = $1
        AND kind = $2
        AND (${filters.join(" OR ")})
      LIMIT 1
    `,
    values,
    { route, client },
  );

  return rows[0] ?? null;
};

export const deleteSubmissionMediaByUrls = async (params: {
  submissionId: string;
  urls: string[];
  client?: PoolClient;
  route?: string;
}) => {
  const { submissionId, urls, client, route = DEFAULT_ROUTE } = params;
  if (urls.length === 0) return;

  const columns = await getSubmissionMediaColumns(route, client);
  if (!columns.url) return;

  await dbQuery(
    `
      DELETE FROM public.submission_media
      WHERE submission_id = $1
        AND url = ANY($2::text[])
    `,
    [submissionId, urls],
    { route, client },
  );
};

export const withSubmissionMediaClient = async <T>(
  route: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await getDbClient(route);
  try {
    return await fn(client);
  } finally {
    client.release();
  }
};
