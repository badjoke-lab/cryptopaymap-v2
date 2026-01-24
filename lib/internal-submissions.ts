import type { PoolClient } from "pg";

import { dbQuery } from "@/lib/db";
import type { SubmissionPayload } from "@/lib/submissions";

export type InternalSubmission = {
  id: string;
  status: string;
  kind: string;
  level?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  name: string;
  country: string;
  city: string;
  payload: SubmissionPayload;
  placeId?: string | null;
  submittedBy?: Record<string, unknown> | null;
  reviewedBy?: Record<string, unknown> | null;
  reviewNote?: string | null;
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
      ADD COLUMN IF NOT EXISTS reject_reason TEXT,
      ADD COLUMN IF NOT EXISTS place_id TEXT,
      ADD COLUMN IF NOT EXISTS submitted_by JSONB,
      ADD COLUMN IF NOT EXISTS reviewed_by JSONB,
      ADD COLUMN IF NOT EXISTS review_note TEXT,
      ADD COLUMN IF NOT EXISTS level TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
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
  level?: string | null;
  created_at: string;
  updated_at?: string | null;
  name: string;
  country: string;
  city: string;
  payload: SubmissionPayload | string;
  place_id?: string | null;
  submitted_by?: Record<string, unknown> | null;
  reviewed_by?: Record<string, unknown> | null;
  review_note?: string | null;
  published_place_id?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  reject_reason?: string | null;
}): InternalSubmission => {
  const payload =
    typeof row.payload === "string"
      ? (JSON.parse(row.payload) as SubmissionPayload)
      : row.payload;

  return {
    id: row.id,
    status: row.status,
    kind: row.kind,
    level: row.level ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    name: row.name,
    country: row.country,
    city: row.city,
    payload,
    placeId: row.place_id ?? payload.placeId ?? null,
    submittedBy: row.submitted_by ?? payload.submittedBy ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewNote: row.review_note ?? null,
    publishedPlaceId: row.published_place_id ?? null,
    approvedAt: row.approved_at ?? null,
    rejectedAt: row.rejected_at ?? null,
    rejectReason: row.reject_reason ?? null,
  };
};
