import { NextResponse } from "next/server";

import { places } from "@/lib/data/places";
import { deriveFilterMeta } from "@/lib/filters";

export async function GET() {
  const meta = deriveFilterMeta(places);
  return NextResponse.json(meta);
}
