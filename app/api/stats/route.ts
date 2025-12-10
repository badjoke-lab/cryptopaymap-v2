import { NextResponse } from "next/server";

import { categoryTrends, countryRankings } from "@/lib/stats/dashboard";
import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";
import {
  normalizeCategoryTrendPoint,
  normalizeCountryRanking,
  normalizeTrendPoint,
} from "@/lib/stats/utils";

export async function GET() {
  const verificationTrends = {
    weekly: weeklyTrends.map(normalizeTrendPoint),
    monthly: monthlyTrends.map(normalizeTrendPoint),
  };

  const countries = countryRankings.map(normalizeCountryRanking);

  const categoryTrendsWithTotals = {
    weekly: categoryTrends.weekly.map(normalizeCategoryTrendPoint),
    monthly: categoryTrends.monthly.map(normalizeCategoryTrendPoint),
  };

  return NextResponse.json({
    verificationTrends,
    countries,
    categoryTrends: categoryTrendsWithTotals,
  });
}
