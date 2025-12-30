import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";

export async function GET() {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ ok: false, db: { ok: false } }, { status: 503 });
  }

  const start = Date.now();

  try {
    await dbQuery("SELECT 1", [], { route: "api_health" });
    const latencyMs = Date.now() - start;
    return NextResponse.json({ ok: true, db: { ok: true, latencyMs } });
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      return NextResponse.json({ ok: false, db: { ok: false } }, { status: 503 });
    }

    console.error("[health] db query failed", error);
    return NextResponse.json({ ok: false, db: { ok: false } }, { status: 503 });
  }
}
