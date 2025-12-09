import type { CategoryTrendPoint, CountryRanking } from "./dashboard";

export type CountrySortKey = "total" | "owner" | "community";

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
