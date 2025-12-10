import { NextResponse } from "next/server";

import { categoryTrends, countryRankings } from "@/lib/stats/dashboard";
import { monthlyTrends, weeklyTrends } from "@/lib/stats/trends";

export async function GET() {
  const verificationTrends = {
    weekly: weeklyTrends.map((point) => ({
      ...point,
      total: point.owner + point.community + point.directory + point.unverified,
    })),
    monthly: monthlyTrends.map((point) => ({
      ...point,
      total: point.owner + point.community + point.directory + point.unverified,
    })),
  };

  const countries = countryRankings.map((country) => ({
    ...country,
    total: country.owner + country.community + country.directory + country.unverified,
  }));

  const categoryTrendsWithTotals = {
    weekly: categoryTrends.weekly.map((point) => ({
      ...point,
      total: point.owner + point.community + point.directory + point.unverified,
    })),
    monthly: categoryTrends.monthly.map((point) => ({
      ...point,
      total: point.owner + point.community + point.directory + point.unverified,
    })),
  };

  return NextResponse.json({
    verificationTrends,
    countries,
    categoryTrends: categoryTrendsWithTotals,
  });
}
