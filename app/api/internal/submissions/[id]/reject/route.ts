import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { recordHistoryEntry, resolveActorFromRequest } from "@/lib/history";
import { ensureSubmissionColumns, tableExists } from "@/lib/internal-submissions";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const { id } = params;
  const route = "api_internal_submissions_reject";
  const actor = resolveActorFromRequest(request, "internal");
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reason = typeof (body as { reason?: string }).reason === "string" ? (body as { reason: string }).reason : "";
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    return NextResponse.json({ error: "Reject reason is required" }, { status: 400 });
  }

  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);

    const submissionsTableExists = await tableExists(route, "submissions", client);
    if (!submissionsTableExists) {
      return NextResponse.json({ error: "submissions table is missing" }, { status: 500 });
    }

    await ensureSubmissionColumns(route, client);

    await dbQuery("BEGIN", [], { route, client, retry: false });

    const { rows } = await dbQuery<{
      status: string;
      country: string;
      city: string;
      kind: string;
      category: string;
    }>(
      `SELECT status, country, city, kind, category
       FROM submissions
       WHERE id = $1
       FOR UPDATE`,
      [id],
      { route, client, retry: false },
    );

    const submission = rows[0];
    if (!submission) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "pending") {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      if (submission.status === "rejected") {
        return NextResponse.json({ status: "rejected" });
      }
      return NextResponse.json({ error: `Submission already ${submission.status}` }, { status: 409 });
    }

    await dbQuery(
      `UPDATE submissions
       SET status = 'rejected',
           reject_reason = $2,
           rejected_at = NOW()
       WHERE id = $1`,
      [id, trimmedReason],
      { route, client, retry: false },
    );

    await recordHistoryEntry({
      route,
      client,
      actor,
      action: "reject",
      submissionId: id,
      meta: {
        statusBefore: submission.status,
        statusAfter: "rejected",
        rejectReason: trimmedReason,
        country: submission.country,
        city: submission.city,
        kind: submission.kind,
        category: submission.category,
      },
    });

    await dbQuery("COMMIT", [], { route, client, retry: false });

    return NextResponse.json({ status: "rejected" });
  } catch (error) {
    if (client) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    }
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] reject failed", error);
    return NextResponse.json({ error: "Failed to reject submission" }, { status: 500 });
  } finally {
    client?.release();
  }
}
