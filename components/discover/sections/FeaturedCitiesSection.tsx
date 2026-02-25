'use client';

import { discoverMockData, type SectionStatus } from '@/components/discover/mock';
import { MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, renderAssetList } from './shared';

export default function FeaturedCitiesSection({ status, onRetry }: { status: SectionStatus; onRetry: () => void }) {
  const items = discoverMockData.featuredCities.slice(0, 6);

  const barWidth = (value: number, total: number) => `${Math.max((value / Math.max(total, 1)) * 100, 8)}%`;

  return (
    <SectionShell title="Featured Crypto Cities" description="Top city clusters by active crypto-friendly places.">
      {status === 'loading' ? <SimpleSkeletonRows rows={3} /> : null}
      {status === 'error' ? (
        <SectionError
          summary="Featured city cards are unavailable."
          details="Local mock city payload failed in this section state. Retry to re-render city cards."
          onRetry={onRetry}
        />
      ) : null}
      {status === 'success' && items.length === 0 ? <SectionEmpty message="No cities available yet." /> : null}

      {status === 'success' && items.length > 0 ? (
        <>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {items.map((city) => {
              const totalVerification = city.verificationCounts.owner + city.verificationCounts.community + city.verificationCounts.directory + city.verificationCounts.unverified;
              return (
                <MapLink
                  key={`${city.countryCode}-${city.city}`}
                  href={`/map?country=${encodeURIComponent(city.countryCode)}&city=${encodeURIComponent(city.city)}`}
                  className="min-w-[82%] snap-start rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50 sm:min-w-0"
                >
                  <p className="font-semibold text-gray-900">{city.city}, {city.country}</p>
                  <p className="text-sm text-gray-600">{city.totalPlaces} places</p>
                  <p className="mt-1 text-sm text-gray-700">Top: {city.topCategory}</p>
                  <p className="mt-1 text-sm text-gray-700">{renderAssetList(city.topAssets, 3)}</p>
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 rounded bg-gray-100">
                      <div className="h-1.5 rounded bg-emerald-500" style={{ width: barWidth(city.verificationCounts.owner, totalVerification) }} />
                    </div>
                    <p className="text-xs text-gray-500">Owner {city.verificationCounts.owner} · Community {city.verificationCounts.community} · Directory {city.verificationCounts.directory} · Unverified {city.verificationCounts.unverified}</p>
                  </div>
                </MapLink>
              );
            })}
          </div>
        </>
      ) : null}
    </SectionShell>
  );
}
