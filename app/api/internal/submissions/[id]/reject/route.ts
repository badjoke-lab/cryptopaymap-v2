import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { recordHistoryEntry, resolveActorFromRequest } from "@/lib/history";
import { ensureSubmissionColumns, hasColumn, tableExists } from "@/lib/internal-submissions";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

type RejectBody = {
  reject_reason?: unknown;
  reason?: unknown;
  review_note?: unknown;
};

type SubmissionRow = {
  status: string;
  country: string;
  city: string;
  kind: string;
  category: string;
};

const parseRejectReason = (body: RejectBody) => {
  const value = typeof body.reject_reason === "string" ? body.reject_reason : body.reason;
  return typeof value === "string" ? value.trim() : "";
};

const parseReviewNote = (body: RejectBody) =>
  typeof body.review_note === "string" ? body.review_note.trim() : null;

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

  let body: RejectBody = {};
  try {
    body = (await request.json()) as RejectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rejectReason = parseRejectReason(body);
  if (!rejectReason) {
    return NextResponse.json({ error: "Reject reason is required" }, { status: 400 });
  }

  const reviewNote = parseReviewNote(body);

  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);

    const submissionsTableExists = await tableExists(route, "submissions", client);
    if (!submissionsTableExists) {
      return NextResponse.json({ error: "submissions table is missing" }, { status: 500 });
    }

    await ensureSubmissionColumns(route, client);

    await dbQuery("BEGIN", [], { route, client, retry: false });

    const { rows } = await dbQuery<SubmissionRow>(
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

    const hasReviewedBy = await hasColumn(route, "submissions", "reviewed_by", client);
    const hasReviewNote = await hasColumn(route, "submissions", "review_note", client);

    const updates = ["status = 'rejected'", "reject_reason = $2", "rejected_at = NOW()"];
    const paramsList: unknown[] = [id, rejectReason];

    if (hasReviewedBy) {
      updates.push(`reviewed_by = $${paramsList.length + 1}`);
      paramsList.push(actor);
    }

    if (hasReviewNote && reviewNote !== null) {
      updates.push(`review_note = $${paramsList.length + 1}`);
      paramsList.push(reviewNote);
    }

    await dbQuery(
      `UPDATE submissions
       SET ${updates.join(", ")}
       WHERE id = $1`,
      paramsList,
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
        rejectReason,
        reviewNote: reviewNote ?? undefined,
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
