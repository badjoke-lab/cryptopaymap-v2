'use client';

import { useEffect, useMemo, useState } from "react";

type VerificationCategory = "owner" | "community" | "directory" | "unverified";

type StatsResponse = {
  totalPlaces: number;
  categories: Record<VerificationCategory, number>;
  verification: Record<VerificationCategory, number>;
};

type StatBucket = {
  label: string;
  value: number;
};

const categoryOrder: VerificationCategory[] = [
  "owner",
  "community",
  "directory",
  "unverified",
];

function StatBar({ label, value, max }: StatBucket & { max: number }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm font-medium text-gray-700">
        <span className="capitalize">{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-3 rounded-full bg-gray-200">
        <div
          className="h-3 rounded-full bg-blue-500"
          style={{ width: `${width}%` }}
          aria-label={`${label} count bar`}
        />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const response = await fetch("/api/stats");

        if (!response.ok) {
          throw new Error("Unable to load stats");
        }

        const payload = (await response.json()) as StatsResponse;
        setStats(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setIsLoading(false);
      }
    }

    void loadStats();
  }, []);

  const categoryBuckets: StatBucket[] = useMemo(() => {
    if (!stats) return [];
    return categoryOrder.map((key) => ({
      label: key,
      value: stats.categories[key],
    }));
  }, [stats]);

  const verificationBuckets: StatBucket[] = useMemo(() => {
    if (!stats) return [];
    return categoryOrder.map((key) => ({
      label: key,
      value: stats.verification[key],
    }));
  }, [stats]);

  const maxCategoryValue = useMemo(
    () => Math.max(0, ...categoryBuckets.map((bucket) => bucket.value)),
    [categoryBuckets]
  );

  const maxVerificationValue = useMemo(
    () => Math.max(0, ...verificationBuckets.map((bucket) => bucket.value)),
    [verificationBuckets]
  );

  return (
    <main className="mx-auto max-w-5xl space-y-10 px-4 py-10">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          CryptoPayMap Network
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Stats overview</h1>
        <p className="max-w-2xl text-gray-600">
          Aggregated counts by category and verification type to help understand
          coverage across the map.
        </p>
      </div>

      {isLoading && <div className="text-gray-600">Loading stats…</div>}
      {error && !isLoading && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {stats && !error && (
        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-600">Total places</p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {stats.totalPlaces}
              </p>
            </div>
            {categoryBuckets.map((bucket) => (
              <div
                key={bucket.label}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <p className="text-sm text-gray-600 capitalize">{bucket.label}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">
                  {bucket.value}
                </p>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">By category</h2>
              <p className="text-sm text-gray-600">
                Total number of places grouped by submission category.
              </p>
            </div>
            <div className="space-y-4 rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              {categoryBuckets.map((bucket) => (
                <StatBar
                  key={bucket.label}
                  label={bucket.label}
                  value={bucket.value}
                  max={maxCategoryValue}
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">By verification</h2>
              <p className="text-sm text-gray-600">
                Breakdown of places for each verification type.
              </p>
            </div>
            <div className="space-y-4 rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
              {verificationBuckets.map((bucket) => (
                <StatBar
                  key={bucket.label}
                  label={bucket.label}
                  value={bucket.value}
                  max={maxVerificationValue}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
