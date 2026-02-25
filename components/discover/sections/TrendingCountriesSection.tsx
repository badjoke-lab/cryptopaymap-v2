'use client';

import { discoverMockData, type SectionStatus } from '@/components/discover/mock';
import { MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows } from './shared';

export default function TrendingCountriesSection({ status, onRetry }: { status: SectionStatus; onRetry: () => void }) {
  const items = discoverMockData.trendingCountries.slice(0, 5);

  return (
    <SectionShell title="Trending Countries" description="Top 5 by 30-day listing growth.">
      {status === 'loading' ? <SimpleSkeletonRows rows={5} /> : null}
      {status === 'error' ? (
        <SectionError
          summary="Trend data is temporarily unavailable."
          details="Mock trend dataset did not load in the current section state."
          onRetry={onRetry}
        />
      ) : null}
      {status === 'success' && items.length === 0 ? <SectionEmpty message="No trend data yet." /> : null}

      {status === 'success' && items.length > 0 ? (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li key={item.code}>
              <MapLink
                href={`/map?country=${encodeURIComponent(item.code)}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800">{index + 1}. {item.country}</span>
                <span className="font-semibold text-emerald-600">+{item.growth30d}</span>
              </MapLink>
            </li>
          ))}
        </ol>
      ) : null}
    </SectionShell>
  );
}
