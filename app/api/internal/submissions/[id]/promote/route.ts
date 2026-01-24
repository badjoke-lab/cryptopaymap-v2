import { NextResponse } from "next/server";

import { DbUnavailableError, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { resolveActorFromRequest } from "@/lib/history";
import { requireInternalAuth } from "@/lib/internalAuth";
import { promoteSubmission } from "@/lib/submissions/promote";

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
  const route = "api_internal_submissions_promote";
  const actor = resolveActorFromRequest(request, "internal");

  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);
    const result = await promoteSubmission(route, client, actor, id);

    if (!result.ok) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json({ placeId: result.placeId, promoted: result.promoted });
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] promote failed", error);
    return NextResponse.json({ error: "Failed to promote submission" }, { status: 500 });
  } finally {
    client?.release();
  }
}
