import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError } from "@/lib/db";
import { loadPlaceDetail } from "@/lib/places/detail";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get("id");
  if (!rawId) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  try {
    const place = await loadPlaceDetail(rawId);
    if (place) {
      return NextResponse.json(place);
    }
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    throw error;
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
