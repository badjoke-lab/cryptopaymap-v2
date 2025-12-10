import { places } from "@/lib/data/places";
import type { Place } from "@/types/places";

import { normalizeVerificationTotals, VERIFICATION_KEYS } from "./utils";

export type CountryStats = ReturnType<typeof normalizeVerificationTotals> & { country: string };

export type CategoryStats = ReturnType<typeof normalizeVerificationTotals> & { category: string };

export type ChainStats = { chain: string; total: number };

export type StatsKPI = {
  totalPlaces: number;
  ownerCount: number;
  communityCount: number;
  directoryCount: number;
  unverifiedCount: number;
  ownerRatio: number;
  communityRatio: number;
};

type VerificationBucket = ReturnType<typeof normalizeVerificationTotals>;

function getEmptyVerificationBucket(): VerificationBucket {
  return normalizeVerificationTotals({ total: 0, owner: 0, community: 0, directory: 0, unverified: 0 });
}

function normalizeChain(chain: string): string {
  const lower = chain.toLowerCase();
  if (lower.includes("lightning")) return "lightning";
  return lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function collectChains(place: Place): string[] {
  const chains = new Set<string>();
  [...(place.accepted ?? []), ...(place.supported_crypto ?? [])].forEach((entry) => {
    const normalized = normalizeChain(entry);
    if (normalized) {
      chains.add(normalized);
    }
  });
  return Array.from(chains);
}

export function computeDashboardStats(source: Place[] = places): {
  byCountry: CountryStats[];
  byCategory: CategoryStats[];
  byChain: ChainStats[];
  kpi: StatsKPI;
} {
  const countryMap = new Map<string, VerificationBucket>();
  const categoryMap = new Map<string, VerificationBucket>();
  const chainMap = new Map<string, Set<string>>();
  const totals = getEmptyVerificationBucket();

  source.forEach((place) => {
    totals.total += 1;
    totals[place.verification] += 1;

    const countryBucket = countryMap.get(place.country) ?? getEmptyVerificationBucket();
    countryBucket.total += 1;
    countryBucket[place.verification] += 1;
    countryMap.set(place.country, countryBucket);

    const categoryBucket = categoryMap.get(place.category) ?? getEmptyVerificationBucket();
    categoryBucket.total += 1;
    categoryBucket[place.verification] += 1;
    categoryMap.set(place.category, categoryBucket);

    collectChains(place).forEach((chain) => {
      const holders = chainMap.get(chain) ?? new Set<string>();
      holders.add(place.id);
      chainMap.set(chain, holders);
    });
  });

  const byCountry = Array.from(countryMap.entries())
    .map(([country, bucket]) => ({ country, ...bucket }))
    .sort((a, b) => b.total - a.total);

  const byCategory = Array.from(categoryMap.entries())
    .map(([category, bucket]) => ({ category, ...bucket }))
    .sort((a, b) => b.total - a.total);

  const byChain = Array.from(chainMap.entries())
    .map(([chain, holders]) => ({ chain, total: holders.size }))
    .sort((a, b) => b.total - a.total);

  const kpi: StatsKPI = {
    totalPlaces: totals.total,
    ownerCount: totals.owner,
    communityCount: totals.community,
    directoryCount: totals.directory,
    unverifiedCount: totals.unverified,
    ownerRatio: totals.total ? totals.owner / totals.total : 0,
    communityRatio: totals.total ? totals.community / totals.total : 0,
  };

  return { byCountry, byCategory, byChain, kpi };
}

export function getVerificationTotals(): VerificationBucket {
  return VERIFICATION_KEYS.reduce((acc, key) => ({ ...acc, [key]: 0 }), {} as VerificationBucket);
}
