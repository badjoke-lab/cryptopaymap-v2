import { NextResponse } from "next/server";

import { places } from "@/lib/data/places";
import { categoryTrends } from "@/lib/stats/dashboard";
import { computeDashboardStats } from "@/lib/stats/aggregate";
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

  const { byCountry, byCategory, byChain, kpi } = computeDashboardStats(places);
  const countries = byCountry.map(normalizeCountryRanking);

  const categoryTrendsWithTotals = {
    weekly: categoryTrends.weekly.map(normalizeCategoryTrendPoint),
    monthly: categoryTrends.monthly.map(normalizeCategoryTrendPoint),
  };

  return NextResponse.json({
    verificationTrends,
    countries,
    categoryTrends: categoryTrendsWithTotals,
    byCountry,
    byCategory,
    byChain,
    kpi,
  });
}
