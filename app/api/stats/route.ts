import { NextResponse } from "next/server";

import { categoryTrends, countryRankings } from "@/lib/stats/dashboard";
import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";

export async function GET() {
  return NextResponse.json({
    verificationTrends: { weekly: weeklyTrends, monthly: monthlyTrends },
    countries: countryRankings,
    categoryTrends,
  });
}
