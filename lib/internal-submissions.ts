import type { PoolClient } from "pg";

import { dbQuery } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/submissions";

export type InternalSubmission = {
  id: string;
  status: string;
  kind: string;
  createdAt: string;
  name: string;
  country: string;
  city: string;
  payload: SubmissionPayload;
  publishedPlaceId?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
};

export const ensureSubmissionColumns = async (route: string, client?: PoolClient) => {
  await dbQuery(
    `ALTER TABLE IF EXISTS public.submissions
      ADD COLUMN IF NOT EXISTS published_place_id TEXT,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reject_reason TEXT`,
    [],
    { route, client },
  );
};

export const tableExists = async (route: string, table: string, client?: PoolClient) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    `SELECT to_regclass($1) AS present`,
    [`public.${table}`],
    { route, client },
  );

  return Boolean(rows[0]?.present);
};

export const hasColumn = async (route: string, table: string, column: string, client?: PoolClient) => {
  const { rows } = await dbQuery<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists`,
    [table, column],
    { route, client },
  );

  return Boolean(rows[0]?.exists);
};

export const mapSubmissionRow = (row: {
  id: string;
  status: string;
  kind: string;
  created_at: string;
  name: string;
  country: string;
  city: string;
  payload: SubmissionPayload;
  published_place_id?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  reject_reason?: string | null;
}): InternalSubmission => ({
  id: row.id,
  status: row.status,
  kind: row.kind,
  createdAt: row.created_at,
  name: row.name,
  country: row.country,
  city: row.city,
  payload: row.payload,
  publishedPlaceId: row.published_place_id ?? null,
  approvedAt: row.approved_at ?? null,
  rejectedAt: row.rejected_at ?? null,
  rejectReason: row.reject_reason ?? null,
});
