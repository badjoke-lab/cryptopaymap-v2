import { NextResponse } from "next/server";

import { DbUnavailableError, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { resolveActorFromRequest } from "@/lib/history";
import { requireInternalAuth } from "@/lib/internalAuth";
import { promoteSubmission } from "@/lib/submissions/promote";

export const runtime = "nodejs";

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
    return NextResponse.json({
      status: "promoted",
      placeId: `cpm:dryrun-${id}`,
      mode: "insert",
      sourceSubmissionId: id,
      dryRun: true,
    });
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE", hint: "Database unavailable." }, { status: 503 });
  }
  const route = "api_internal_submissions_promote";
  const actor = resolveActorFromRequest(request, "internal");
  let galleryMediaIds: string[] | undefined;

  const parsedBody = await parseJsonBody<{ galleryMediaIds?: unknown }>(request);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: "Invalid JSON", hint: "send {} with content-type: application/json" },
      { status: 400 },
    );
  }
  const payload = parsedBody.body;
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
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json({
      status: "promoted",
      placeId: result.placeId,
      mode: result.mode,
      sourceSubmissionId: id,
    });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] promote failed", error);
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Failed to promote submission", detail },
      { status: 500 },
    );
  } finally {
    client?.release();
  }
}
