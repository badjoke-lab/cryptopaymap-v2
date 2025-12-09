import { NextResponse } from "next/server";

import { mockPlaces } from "../../../lib/mockPlaces";

export async function GET() {
  return NextResponse.json(mockPlaces);
}
