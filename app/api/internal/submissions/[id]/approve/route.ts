import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { recordHistoryEntry, resolveActorFromRequest } from "@/lib/history";
import { ensureSubmissionColumns, hasColumn, tableExists } from "@/lib/internal-submissions";
import { requireInternalAuth } from "@/lib/internalAuth";

export const runtime = "nodejs";

type ApproveBody = {
  review_note?: unknown;
};

type SubmissionRow = {
  status: string;
  country: string;
  city: string;
  kind: string;
  category: string;
};

const parseJsonBody = async <T>(request: Request): Promise<{ ok: true; body: T } | { ok: false }> => {
  const text = await request.text();
  if (!text.trim()) {
    return { ok: true, body: {} as T };
  }
  try {
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
};

const parseReviewNote = (body: ApproveBody) =>
  typeof body.review_note === "string" ? body.review_note.trim() : null;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  const { id } = params;
  const dryRunParam = new URL(request.url).searchParams.get("dryRun") ?? "";
  const dryRun =
    id.startsWith("dryrun-") || ["1", "true", "yes"].includes(dryRunParam.toLowerCase());

  if (dryRun) {
    return NextResponse.json({ status: "approved", dryRun: true, id });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE", hint: "Database unavailable." }, { status: 503 });
  }
  const route = "api_internal_submissions_approve";
  const actor = resolveActorFromRequest(request, "internal");

  const parsedBody = await parseJsonBody<ApproveBody>(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: "Invalid JSON", hint: "send {} with content-type: application/json" },
      { status: 400 },
    );
  }
  const body = parsedBody.body;

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
      if (submission.status === "approved") {
        return NextResponse.json({ status: "approved" });
      }
      return NextResponse.json({ error: `Submission already ${submission.status}` }, { status: 409 });
    }

    const hasReviewedBy = await hasColumn(route, "submissions", "reviewed_by", client);
    const hasReviewNote = await hasColumn(route, "submissions", "review_note", client);

    // Approve only updates submission status metadata and must not touch places.
    const updates = ["status = 'approved'", "approved_at = NOW()"];
    const paramsList: unknown[] = [id];

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
      action: "approve",
      submissionId: id,
      meta: {
        statusBefore: submission.status,
        statusAfter: "approved",
        country: submission.country,
        city: submission.city,
        kind: submission.kind,
        category: submission.category,
        reviewNote: reviewNote ?? undefined,
      },
    });

    await dbQuery("COMMIT", [], { route, client, retry: false });

    return NextResponse.json({ status: "approved" });
  } catch (error) {
    if (client) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    }
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] approve failed", error);
    return NextResponse.json({ error: "Failed to approve submission" }, { status: 500 });
  } finally {
    client?.release();
  }
}
