'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscoverFeaturedCity } from '@/lib/discover/types';
import { LimitedDataNote, MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, fetchDiscover, renderAssetList } from './shared';

export default function FeaturedCitiesSection() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverFeaturedCity[]>([]);
  const [limited, setLimited] = useState(false);
  const [limitedReason, setLimitedReason] = useState<string | undefined>();
  const [retrying, setRetrying] = useState(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchDiscover<DiscoverFeaturedCity[]>('/api/discover/featured-cities', {
        cacheKey: 'cities:featured',
        force,
      });
      setItems(payload.data.slice(0, 6));
      setLimited(payload.limited);
      setLimitedReason(payload.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load featured cities');
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  }, []);

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    retryTimeoutRef.current = setTimeout(() => load(true), 300);
  };

  const barWidth = (value: number, total: number) => `${Math.max((value / Math.max(total, 1)) * 100, 8)}%`;

  const scrollCities = (direction: 'prev' | 'next') => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const firstCard = carousel.firstElementChild as HTMLElement | null;
    const cardWidth = firstCard?.offsetWidth ?? carousel.clientWidth * 0.85;
    const gap = 12;
    const delta = cardWidth + gap;

    carousel.scrollBy({
      left: direction === 'next' ? delta : -delta,
      behavior: 'smooth',
    });
  };

  return (
    <SectionShell title="Featured Crypto Cities" description="Top city clusters by active crypto-friendly places.">
      {loading ? <SimpleSkeletonRows rows={3} rowClassName="h-[152px]" /> : null}
      {error ? <SectionError summary="Featured city cards are unavailable." details={error} onRetry={handleRetry} retrying={retrying} /> : null}
      {!loading && !error && items.length === 0 ? <SectionEmpty message="No cities available yet." /> : null}

      {!loading && !error && items.length > 0 ? (
        <div className="overflow-hidden">
          <div className="mb-2 flex items-center justify-end gap-2 px-4 md:hidden">
            <button
              type="button"
              aria-label="Previous city"
              data-testid="cities-prev"
              className="rounded border border-gray-200 px-2 py-1 text-sm font-semibold text-gray-700"
              onClick={() => scrollCities('prev')}
            >
              Prev
            </button>
            <button
              type="button"
              aria-label="Next city"
              data-testid="cities-next"
              className="rounded border border-gray-200 px-2 py-1 text-sm font-semibold text-gray-700"
              onClick={() => scrollCities('next')}
            >
              Next
            </button>
          </div>
          <div
            ref={carouselRef}
            data-testid="cities-carousel"
            className="mx-0 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:grid md:snap-none md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3"
          >
            {items.map((city) => {
              const totalVerification = city.verificationBreakdown.owner + city.verificationBreakdown.community + city.verificationBreakdown.directory + city.verificationBreakdown.unverified;
              return (
                <MapLink
                  key={`${city.countryCode}-${city.city}`}
                  href={`/map?country=${encodeURIComponent(city.countryCode)}&city=${encodeURIComponent(city.city)}`}
                  className="min-w-[83.333%] snap-start rounded-lg border border-gray-200 p-4 transition hover:bg-gray-50 md:min-w-0"
                >
                  <p className="truncate font-semibold text-gray-900">{city.city}, {city.countryCode}</p>
                  <p className="text-sm text-gray-600">{city.totalPlaces} places</p>
                  <p className="mt-1 truncate text-sm text-gray-700">Top: {city.topCategory}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-gray-700">{renderAssetList(city.topAssets, 3)}</p>
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
        </div>
      ) : null}
      {!loading && !error && limited ? <LimitedDataNote reason={limitedReason} /> : null}
    </SectionShell>
  );
}
