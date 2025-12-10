import type { VerificationKey, VerificationTotals } from "@/lib/types/stats";
import type { CategoryTrendPoint, CountryRanking } from "./dashboard";

export const VERIFICATION_KEYS: VerificationKey[] = [
  "total",
  "owner",
  "community",
  "directory",
  "unverified",
];

export type CountrySortKey = "total" | "owner" | "community";

export function normalizeVerificationTotals(values: Partial<Record<VerificationKey, number>>): VerificationTotals {
  const owner = values.owner ?? 0;
  const community = values.community ?? 0;
  const directory = values.directory ?? 0;
  const unverified = values.unverified ?? 0;
  const total = values.total ?? owner + community + directory + unverified;

  return { total, owner, community, directory, unverified };
}

export function normalizeTrendPoint<T extends { label: string }>(
  point: T & Partial<Record<VerificationKey, number>>,
): T & VerificationTotals {
  return {
    ...point,
    ...normalizeVerificationTotals(point),
  };
}

export function normalizeCountryRanking(
  country: { country: string } & Partial<Record<VerificationKey, number>>,
): CountryRanking {
  return {
    country: country.country,
    ...normalizeVerificationTotals(country),
  };
}

export function normalizeCategoryTrendPoint(
  trend: { period: string; category: string } & Partial<Record<VerificationKey, number>>,
): CategoryTrendPoint {
  return {
    period: trend.period,
    category: trend.category,
    ...normalizeVerificationTotals(trend),
  };
}

export function sortCountries(
  countries: CountryRanking[],
  sortBy: CountrySortKey = "total",
  limit = countries.length,
): CountryRanking[] {
  const sorted = [...countries].sort((a, b) => b[sortBy] - a[sortBy]);
  return sorted.slice(0, Math.max(0, limit));
}

export function getCategoryNames(trends: CategoryTrendPoint[]): string[] {
  return Array.from(new Set(trends.map((entry) => entry.category)));
}

export function filterCategoryTrends(trends: CategoryTrendPoint[], category: string): CategoryTrendPoint[] {
  return trends.filter((entry) => entry.category === category);
}

export function formatPeriodLabel(period: string): string {
  if (period.length === 7) {
    const [year, month] = period.split("-");
    const date = new Date(Date.UTC(Number(year), Number(month) - 1));
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }

  const parsedDate = new Date(`${period}T00:00:00Z`);
  return parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
