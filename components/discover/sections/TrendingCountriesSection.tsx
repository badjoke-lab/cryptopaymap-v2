'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DiscoverTrendingCountry } from '@/lib/discover/types';
import { LimitedDataNote, MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, fetchDiscover } from './shared';

export default function TrendingCountriesSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverTrendingCountry[]>([]);
  const [limited, setLimited] = useState(false);
  const [limitedReason, setLimitedReason] = useState<string | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchDiscover<DiscoverTrendingCountry[]>('/api/discover/trending-countries?window=30d');
      setItems(payload.data.slice(0, 5));
      setLimited(payload.limited);
      setLimitedReason(payload.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load trends');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shouldShowEmpty = !loading && !error && (items.length === 0 || limited);

  return (
    <SectionShell title="Trending Countries" description="Top 5 by 30-day listing growth.">
      {loading ? <SimpleSkeletonRows rows={5} /> : null}
      {error ? (
        <SectionError
          summary="Trend data is temporarily unavailable."
          details={error}
          onRetry={load}
        />
      ) : null}
      {shouldShowEmpty ? <SectionEmpty message="No trend data yet." /> : null}

      {!loading && !error && !shouldShowEmpty ? (
        <ol className="space-y-2">
          {items.map((item, index) => (
            <li key={item.countryCode}>
              <MapLink
                href={`/map?country=${encodeURIComponent(item.countryCode)}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm transition hover:bg-gray-50"
              >
                <span className="font-medium text-gray-800">{index + 1}. {item.countryName ?? item.countryCode}</span>
                <span className="font-semibold text-emerald-600">+{item.delta30d}</span>
              </MapLink>
            </li>
          ))}
        </ol>
      ) : null}
      {limited ? <LimitedDataNote reason={limitedReason} /> : null}
    </SectionShell>
  );
}
