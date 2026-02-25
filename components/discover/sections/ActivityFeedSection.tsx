'use client';

import { useCallback, useEffect, useState } from 'react';
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
  renderAssetList,
  useBreakpoint,
} from './shared';

const activityTabs: Array<{ key: DiscoverActivityTab; label: string }> = [
  { key: 'added', label: 'Just Added' },
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
  const breakpoint = useBreakpoint();

  const limit = breakpoint === 'mobile' ? 6 : 8;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchDiscover<DiscoverActivityItem[]>(`/api/discover/activity?tab=${activeTab}&limit=${limit}`);
      setItems(payload.data);
      setLimited(payload.limited);
      setLimitedReason(payload.reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load activity feed');
    } finally {
      setLoading(false);
    }
  }, [activeTab, limit]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SectionShell title="Activity Feed" description="Recent directory updates by source and verification type.">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {activityTabs.map((tab) => (
          <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </TabButton>
        ))}
      </div>

      {loading ? <SimpleSkeletonRows rows={4} /> : null}
      {error ? (
        <SectionError
          summary="We could not load activity updates."
          details={error}
          onRetry={load}
        />
      ) : null}
      {!loading && !error && items.length === 0 ? <SectionEmpty message="No recent updates yet." /> : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="hidden space-y-3 sm:block">
            {items.map((item) => (
              <MapLink
                key={item.placeId}
                href={`/map?place=${encodeURIComponent(item.placeId)}`}
                className="block rounded-lg border border-gray-200 p-3 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${verificationTone[item.verificationLevel]}`}>{item.verificationLevel}</span>
                </div>
                <p className="text-sm text-gray-600">{item.city}, {item.country}</p>
                <p className="mt-1 text-sm text-gray-700">{renderAssetList(item.assets, 3)}</p>
                <p className="mt-1 text-xs text-gray-500">{formatTimeLabel(item.timeLabelISO)}</p>
              </MapLink>
            ))}
          </div>

          <div className="space-y-3 sm:hidden">
            {items.map((item) => (
              <MapLink
                key={item.placeId}
                href={`/map?place=${encodeURIComponent(item.placeId)}`}
                className="block rounded-lg border border-gray-200 p-3"
              >
                <p className="font-semibold text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-600">{item.city}, {item.country}</p>
                <p className="mt-1 text-sm text-gray-700">{renderAssetList(item.assets, 3)}</p>
                <p className="mt-1 text-xs text-gray-500">{formatTimeLabel(item.timeLabelISO)}</p>
              </MapLink>
            ))}
          </div>
          {limited ? <LimitedDataNote reason={limitedReason} /> : null}
        </>
      ) : null}
    </SectionShell>
  );
}
