import { NextResponse } from "next/server";

import { places } from "@/lib/data/places";

export async function GET() {
  return NextResponse.json(places);
}
