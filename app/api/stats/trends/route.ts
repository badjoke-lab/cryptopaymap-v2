import { NextResponse } from "next/server";

import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";

export async function GET() {
  return NextResponse.json({ weekly: weeklyTrends, monthly: monthlyTrends });
}
