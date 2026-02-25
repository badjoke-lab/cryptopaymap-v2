'use client';

import { useState } from 'react';
import { discoverMockData, type ActivityTabKey, type SectionStatus } from '@/components/discover/mock';
import { MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, TabButton, renderAssetList } from './shared';

type Props = {
  status: SectionStatus;
  onRetry: () => void;
};

const verificationTone: Record<string, string> = {
  'Owner Verified': 'bg-emerald-100 text-emerald-700',
  'Community Verified': 'bg-blue-100 text-blue-700',
  Directory: 'bg-violet-100 text-violet-700',
  Unverified: 'bg-gray-200 text-gray-700',
};

export default function ActivityFeedSection({ status, onRetry }: Props) {
  const [activeTab, setActiveTab] = useState<ActivityTabKey>('just-added');
  const items = discoverMockData.activityFeed[activeTab] ?? [];
  const mobileCapped = items.slice(0, 6);
  const desktopCapped = items.slice(0, 8);

  return (
    <SectionShell title="Activity Feed" description="Recent directory updates by source and verification type.">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {discoverMockData.activityTabs.map((tab) => (
          <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </TabButton>
        ))}
      </div>

      {status === 'loading' ? <SimpleSkeletonRows rows={4} /> : null}
      {status === 'error' ? (
        <SectionError
          summary="We could not load activity updates."
          details="Mock section state failed to resolve. Retry to restore local Discover data."
          onRetry={onRetry}
        />
      ) : null}
      {status === 'success' && items.length === 0 ? <SectionEmpty message="No recent updates yet." /> : null}

      {status === 'success' && items.length > 0 ? (
        <>
          <div className="hidden space-y-3 sm:block">
            {desktopCapped.map((item) => (
              <MapLink
                key={item.id}
                href={`/map?place=${encodeURIComponent(item.id)}`}
                className="block rounded-lg border border-gray-200 p-3 transition hover:border-gray-300 hover:bg-gray-50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-gray-900">{item.name}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${verificationTone[item.verification]}`}>{item.verification}</span>
                </div>
                <p className="text-sm text-gray-600">{item.city}, {item.country}</p>
                <p className="mt-1 text-sm text-gray-700">{renderAssetList(item.assets, 3)}</p>
                <p className="mt-1 text-xs text-gray-500">{item.timeLabel}</p>
              </MapLink>
            ))}
          </div>

          <div className="space-y-3 sm:hidden">
            {mobileCapped.map((item) => (
              <MapLink
                key={item.id}
                href={`/map?place=${encodeURIComponent(item.id)}`}
                className="block rounded-lg border border-gray-200 p-3"
              >
                <p className="font-semibold text-gray-900">{item.name}</p>
                <p className="text-sm text-gray-600">{item.city}, {item.country}</p>
                <p className="mt-1 text-sm text-gray-700">{renderAssetList(item.assets, 3)}</p>
                <p className="mt-1 text-xs text-gray-500">{item.timeLabel}</p>
              </MapLink>
            ))}
          </div>
        </>
      ) : null}
    </SectionShell>
  );
}
