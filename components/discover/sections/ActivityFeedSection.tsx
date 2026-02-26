'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DiscoverActivityItem, DiscoverActivityTab } from '@/lib/discover/types';
import {
  LimitedDataNote,
  MapLink,
  SectionEmpty,
  SectionError,
  SectionShell,
  SimpleSkeletonRows,
  TabButton,
  fetchDiscover,
  formatTimeLabel,
  formatTimeTitle,
  renderAssetList,
  useBreakpoint,
} from './shared';

const activityTabs: Array<{ key: DiscoverActivityTab; label: string }> = [
  { key: 'added', label: 'Added' },
  { key: 'owner', label: 'Owner' },
  { key: 'community', label: 'Community' },
  { key: 'promoted', label: 'Promoted' },
];

const verificationTone: Record<string, string> = {
  owner: 'bg-emerald-100 text-emerald-700',
  community: 'bg-blue-100 text-blue-700',
  directory: 'bg-violet-100 text-violet-700',
  unverified: 'bg-gray-200 text-gray-700',
};

export default function ActivityFeedSection() {
  const [activeTab, setActiveTab] = useState<DiscoverActivityTab>('added');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<DiscoverActivityItem[]>([]);
  const [limited, setLimited] = useState(false);
  const [limitedReason, setLimitedReason] = useState<string | undefined>();
  const [retrying, setRetrying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breakpoint = useBreakpoint();

  const limit = breakpoint === 'mobile' ? 6 : 8;

  const load = useCallback(async (force = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const cacheKey = `activity:${activeTab}:${limit}`;
      const payload = await fetchDiscover<DiscoverActivityItem[]>(`/api/discover/activity?tab=${activeTab}&limit=${limit}`, {
        cacheKey,
        signal: controller.signal,
        force,
      });
      if (controller.signal.aborted) return;
      setItems(payload.data);
      setLimited(payload.limited);
      setLimitedReason(payload.reason);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Unable to load activity feed');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRetrying(false);
      }
    }
  }, [activeTab, limit]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  }, []);

  const handleRetry = () => {
    if (retrying) return;
    setRetrying(true);
    retryTimeoutRef.current = setTimeout(() => load(true), 300);
  };

  const activeIndex = activityTabs.findIndex((tab) => tab.key === activeTab);

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = activityTabs.findIndex((tab) => tab.key === activeTab);
    if (event.key === 'Home') return setActiveTab(activityTabs[0].key);
    if (event.key === 'End') return setActiveTab(activityTabs[activityTabs.length - 1].key);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (current + delta + activityTabs.length) % activityTabs.length;
    setActiveTab(activityTabs[next].key);
  };

  return (
    <SectionShell title="Activity Feed" description="Recent directory updates by source and verification type.">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Activity feed tabs" onKeyDown={onTabKeyDown}>
        {activityTabs.map((tab) => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            id={`activity-tab-${tab.key}`}
            controls={`activity-panel-${tab.key}`}
          >
            {tab.label}
          </TabButton>
        ))}
      </div>

      {loading ? <SimpleSkeletonRows rows={4} rowClassName="h-[92px]" /> : null}
      {error ? (
        <SectionError
          summary="We could not load activity updates."
          details={error}
          onRetry={handleRetry}
          retrying={retrying}
        />
      ) : null}
      {!loading && !error && items.length === 0 ? <SectionEmpty message="No recent updates yet." /> : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div
            id={`activity-panel-${activityTabs[activeIndex]?.key ?? 'added'}`}
            role="tabpanel"
            aria-labelledby={`activity-tab-${activityTabs[activeIndex]?.key ?? 'added'}`}
            className="space-y-3"
          >
            {items.map((item) => (
              <MapLink
                key={item.placeId}
                href={`/map?place=${encodeURIComponent(item.placeId)}`}
                className="block rounded-lg border border-gray-200 p-3 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate font-semibold text-gray-900">{item.name}</p>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${verificationTone[item.verificationLevel]}`}>{item.verificationLevel}</span>
                </div>
                <p className="truncate text-sm text-gray-600">{item.city}, {item.country}</p>
                <p className="mt-1 line-clamp-1 text-sm text-gray-700">{renderAssetList(item.assets, 3)}</p>
                <p className="mt-1 text-xs text-gray-500" title={formatTimeTitle(item.timeLabelISO)}>{formatTimeLabel(item.timeLabelISO)}</p>
              </MapLink>
            ))}
          </div>
          {limited ? <LimitedDataNote reason={limitedReason} /> : null}
        </>
      ) : null}
      {!loading && !error && items.length === 0 && limited ? <LimitedDataNote reason={limitedReason} /> : null}
    </SectionShell>
  );
}
