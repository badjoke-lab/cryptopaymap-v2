import { NextResponse } from "next/server";

import type { Place } from "../../../types/places";
import { places } from "../places/route";

type VerificationCategory = Place["verification"];

type StatsResponse = {
  totalPlaces: number;
  categories: Record<VerificationCategory, number>;
  verification: Record<VerificationCategory, number>;
};

const verificationBuckets: VerificationCategory[] = [
  "owner",
  "community",
  "directory",
  "unverified",
];

function initializeBucketCounts(): Record<VerificationCategory, number> {
  return verificationBuckets.reduce(
    (acc, bucket) => {
      acc[bucket] = 0;
      return acc;
    },
    {} as Record<VerificationCategory, number>
  );
}

function calculateStats(data: Place[]): StatsResponse {
  const categoryCounts = initializeBucketCounts();
  const verificationCounts = initializeBucketCounts();

  for (const place of data) {
    categoryCounts[place.verification] += 1;
    verificationCounts[place.verification] += 1;
  }

  return {
    totalPlaces: data.length,
    categories: categoryCounts,
    verification: verificationCounts,
  };
}

export async function GET() {
  // In a real implementation this would query Neon and transform the data.
  // For now, use the available place dataset as the ETL source.
  const stats = calculateStats(places);

  return NextResponse.json(stats);
}
