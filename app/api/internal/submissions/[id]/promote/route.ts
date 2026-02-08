import { NextResponse } from "next/server";

import { DbUnavailableError, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { resolveActorFromRequest } from "@/lib/history";
import { requireInternalAuth } from "@/lib/internalAuth";
import { promoteSubmission } from "@/lib/submissions/promote";

export const runtime = "nodejs";

const parseOptionalJson = async <T extends Record<string, unknown>>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false }> => {
  const text = await request.text();
  if (!text || text.trim().length === 0) {
    return { ok: true, value: {} as T };
  }

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = requireInternalAuth(request);
  if (!("ok" in auth)) {
    return auth;
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const { id } = params;
  const route = "api_internal_submissions_promote";
  const actor = resolveActorFromRequest(request, "internal");
  let galleryMediaIds: string[] | undefined;

  const parsedBody = await parseOptionalJson<{ galleryMediaIds?: unknown }>(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: "Invalid JSON", hint: "Send {} with content-type: application/json" },
      { status: 400 },
    );
  }
  const payload = parsedBody.value;
  if (payload && typeof payload === "object" && Array.isArray(payload.galleryMediaIds)) {
    galleryMediaIds = payload.galleryMediaIds.filter((item: unknown) => typeof item === "string");
  }

  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);
    const result = await promoteSubmission(route, client, actor, id, {
      galleryMediaIds,
    });

    if (!result.ok) {
      return NextResponse.json({ ...result.body, submissionId: id }, { status: result.status });
    }

    return NextResponse.json({
      status: "promoted",
      placeId: result.placeId,
      mode: result.mode,
      sourceSubmissionId: id,
      promoted: result.promoted,
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[internal submissions] promote failed", error);
    return NextResponse.json(
      {
        error: "Failed to promote submission",
        detail: process.env.NODE_ENV !== "production" ? detail : undefined,
        code: "PROMOTE_FAILED",
        submissionId: id,
      },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
