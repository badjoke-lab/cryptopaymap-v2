import { NextRequest, NextResponse } from "next/server";

import { DbUnavailableError } from "@/lib/db";
import { getPlaceDetail } from "@/lib/places/detail";

const decodePlaceId = (rawId: string) => {
  try {
    return { ok: true, id: decodeURIComponent(rawId) };
  } catch {
    return { ok: false, id: rawId };
  }
};

export async function GET(request: NextRequest) {
  const rawId = request.nextUrl.searchParams.get("id");
  if (!rawId) {
    return NextResponse.json(
      { error: "Missing place id", hint: "use /api/places/by-id?id=cpm:..." },
      { status: 400 },
    );
  }

  const dryRunParam = request.nextUrl.searchParams.get("dryRun") ?? "";
  const dryRun = ["1", "true", "yes"].includes(dryRunParam.toLowerCase());
  const decoded = decodePlaceId(rawId);
  if (!decoded.ok) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  if (dryRun || decoded.id.startsWith("cpm:dryrun-")) {
    return NextResponse.json({
      id: decoded.id,
      name: "[DRY RUN]",
      dryRun: true,
    });
  }

  try {
    const result = await getPlaceDetail(decoded.id);
    if (result.place) {
      return NextResponse.json(result.place);
    }
  } catch (error) {
    if (error instanceof DbUnavailableError) {
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    throw error;
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
