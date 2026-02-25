'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DiscoverFeaturedCity } from '@/lib/discover/types';
import { LimitedDataNote, MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, fetchDiscover, renderAssetList } from './shared';

export default function FeaturedCitiesSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverFeaturedCity[]>([]);
  const [limited, setLimited] = useState(false);
  const [limitedReason, setLimitedReason] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchDiscover<DiscoverFeaturedCity[]>('/api/discover/featured-cities');
      setItems(payload.data.slice(0, 6));
      setLimited(payload.limited);
      setLimitedReason(payload.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load featured cities');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const barWidth = (value: number, total: number) => `${Math.max((value / Math.max(total, 1)) * 100, 8)}%`;

  return (
    <SectionShell title="Featured Crypto Cities" description="Top city clusters by active crypto-friendly places.">
      {loading ? <SimpleSkeletonRows rows={3} /> : null}
      {error ? <SectionError summary="Featured city cards are unavailable." details={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? <SectionEmpty message="No cities available yet." /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
          {items.map((city) => {
            const totalVerification = city.verificationBreakdown.owner + city.verificationBreakdown.community + city.verificationBreakdown.directory + city.verificationBreakdown.unverified;
            return (
              <MapLink
                key={`${city.countryCode}-${city.city}`}
                href={`/map?country=${encodeURIComponent(city.countryCode)}&city=${encodeURIComponent(city.city)}`}
                className="min-w-[82%] snap-start rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50 sm:min-w-0"
              >
                <p className="font-semibold text-gray-900">{city.city}, {city.countryCode}</p>
                <p className="text-sm text-gray-600">{city.totalPlaces} places</p>
                <p className="mt-1 text-sm text-gray-700">Top: {city.topCategory}</p>
                <p className="mt-1 text-sm text-gray-700">{renderAssetList(city.topAssets, 3)}</p>
                <div className="mt-3 space-y-1">
                  <div className="h-1.5 rounded bg-gray-100">
                    <div className="h-1.5 rounded bg-emerald-500" style={{ width: barWidth(city.verificationBreakdown.owner, totalVerification) }} />
                  </div>
                  <p className="text-xs text-gray-500">Owner {city.verificationBreakdown.owner} · Community {city.verificationBreakdown.community} · Directory {city.verificationBreakdown.directory} · Unverified {city.verificationBreakdown.unverified}</p>
                </div>
              </MapLink>
            );
          })}
        </div>
      ) : null}
      {limited ? <LimitedDataNote reason={limitedReason} /> : null}
    </SectionShell>
  );
}
