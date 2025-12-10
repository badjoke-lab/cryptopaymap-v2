import { NextResponse } from "next/server";

import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";

export async function GET() {
  const weekly = weeklyTrends.map((point) => ({
    ...point,
    total: point.owner + point.community + point.directory + point.unverified,
  }));

  const monthly = monthlyTrends.map((point) => ({
    ...point,
    total: point.owner + point.community + point.directory + point.unverified,
  }));

  return NextResponse.json({ weekly, monthly });
}
