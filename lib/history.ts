import { randomUUID } from "crypto";

import type { PoolClient } from "pg";

import { dbQuery } from "@/lib/db";

export type AuditAction = "approve" | "reject" | "promote";

export type HistoryEntry = {
  id: string;
  actor: string;
  action: string;
  submissionId: string;
  placeId: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
};

export const resolveActorFromRequest = (request: Request, fallback = "system") => {
  const authorization = request.headers.get("authorization");
  if (!authorization) return fallback;

  const [scheme, encoded] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return fallback;

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const username = decoded.split(":")[0]?.trim();
    return username || fallback;
  } catch {
    return fallback;
  }
};

export const ensureHistoryTable = async (route: string, client?: PoolClient) => {
  await dbQuery(
    `CREATE TABLE IF NOT EXISTS public.history (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      submission_id TEXT NOT NULL,
      place_id TEXT,
      meta JSONB
    )`,
    [],
    { route, client },
  );

  await dbQuery(
    `ALTER TABLE public.history
      ADD COLUMN IF NOT EXISTS actor TEXT,
      ADD COLUMN IF NOT EXISTS action TEXT,
      ADD COLUMN IF NOT EXISTS submission_id TEXT,
      ADD COLUMN IF NOT EXISTS place_id TEXT,
      ADD COLUMN IF NOT EXISTS meta JSONB`,
    [],
    { route, client },
  );

  await dbQuery(
    `CREATE INDEX IF NOT EXISTS history_submission_id_idx
     ON public.history (submission_id, created_at DESC)`,
    [],
    { route, client },
  );

  await dbQuery(
    `CREATE INDEX IF NOT EXISTS history_place_id_idx
     ON public.history (place_id, created_at DESC)`,
    [],
    { route, client },
  );

  await dbQuery(
    `CREATE INDEX IF NOT EXISTS history_created_at_idx
     ON public.history (created_at DESC)`,
    [],
    { route, client },
  );

  await dbQuery(
    `CREATE INDEX IF NOT EXISTS history_action_idx
     ON public.history (action)`,
    [],
    { route, client },
  );
};

export const recordHistoryEntry = async (options: {
  route: string;
  client?: PoolClient;
  actor: string;
  action: AuditAction | string;
  submissionId: string;
  placeId?: string | null;
  meta?: Record<string, unknown> | null;
}) => {
  const { route, client, actor, action, submissionId, placeId, meta } = options;

  await ensureHistoryTable(route, client);

  const id = randomUUID();

  await dbQuery(
    `INSERT INTO public.history (id, actor, action, submission_id, place_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, actor, action, submissionId, placeId ?? null, meta ? JSON.stringify(meta) : null],
    { route, client, retry: false },
  );

  return id;
};

export const mapHistoryRow = (row: {
  id: string;
  actor: string;
  action: string;
  submission_id: string;
  place_id: string | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}): HistoryEntry => ({
  id: row.id,
  actor: row.actor,
  action: row.action,
  submissionId: row.submission_id,
  placeId: row.place_id ?? null,
  createdAt: row.created_at,
  meta: row.meta ?? null,
});
