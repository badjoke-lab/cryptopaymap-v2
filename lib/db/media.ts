import type { PoolClient } from "pg";

import { dbQuery, getDbClient } from "@/lib/db";
import type { SubmissionMediaKind } from "@/lib/storage/r2";

type InsertSubmissionMediaParams = {
  submissionId: string;
  kind: SubmissionMediaKind;
  url: string;
  client?: PoolClient;
  route?: string;
};

type SubmissionMediaRow = {
  id: number;
  url: string;
};

const DEFAULT_ROUTE = "/api/submissions";

export const insertSubmissionMedia = async ({
  submissionId,
  kind,
  url,
  client,
  route = DEFAULT_ROUTE,
}: InsertSubmissionMediaParams): Promise<SubmissionMediaRow> => {
  const result = await dbQuery<SubmissionMediaRow>(
    `
      INSERT INTO public.submission_media (submission_id, kind, url)
      VALUES ($1, $2, $3)
      RETURNING id, url
    `,
    [submissionId, kind, url],
    { route, client },
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("SUBMISSION_MEDIA_INSERT_FAILED");
  }

  return row;
};

export const deleteSubmissionMediaByUrls = async (params: {
  submissionId: string;
  urls: string[];
  client?: PoolClient;
  route?: string;
}) => {
  const { submissionId, urls, client, route = DEFAULT_ROUTE } = params;
  if (urls.length === 0) return;

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
