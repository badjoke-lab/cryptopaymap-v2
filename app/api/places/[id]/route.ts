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

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const decoded = decodePlaceId(params.id);
  if (!decoded.ok) {
    return NextResponse.json({ error: "Invalid place id" }, { status: 400 });
  }

  if (decoded.id.startsWith("cpm:dryrun-")) {
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
