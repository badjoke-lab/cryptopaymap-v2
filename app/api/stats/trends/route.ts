import { NextResponse } from "next/server";

import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";
import { normalizeTrendPoint } from "@/lib/stats/utils";

export async function GET() {
  const weekly = weeklyTrends.map(normalizeTrendPoint);

  const monthly = monthlyTrends.map(normalizeTrendPoint);

  return NextResponse.json({ weekly, monthly });
}
