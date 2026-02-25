'use client';

import { useMemo, useState } from 'react';
import { discoverMockData, type SectionStatus } from '@/components/discover/mock';
import { MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows } from './shared';

export default function AssetExplorerSection({ status, onRetry }: { status: SectionStatus; onRetry: () => void }) {
  const defaultAsset = Object.keys(discoverMockData.assetExplorer)[0] ?? 'BTC';
  const [selectedAsset, setSelectedAsset] = useState(defaultAsset);

  const availableAssets = useMemo(() => discoverMockData.assetExplorer[defaultAsset]?.assets.slice(0, 12) ?? [], [defaultAsset]);
  const activeData = discoverMockData.assetExplorer[selectedAsset] ?? discoverMockData.assetExplorer[defaultAsset];

  return (
    <SectionShell title="Asset Explorer" description="Explore top countries, categories, and recent places by selected asset.">
      <div className="mb-4 flex flex-wrap gap-2">
        {availableAssets.map((asset) => (
          <button
            type="button"
            key={asset}
            onClick={() => setSelectedAsset(asset)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${
              selectedAsset === asset ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700'
            }`}
          >
            {asset}
          </button>
        ))}
      </div>

      {status === 'loading' ? <SimpleSkeletonRows rows={4} /> : null}
      {status === 'error' ? (
        <SectionError
          summary="Asset explorer is temporarily unavailable."
          details="Mock asset explorer state did not load for this selection."
          onRetry={onRetry}
        />
      ) : null}
      {status === 'success' && (!activeData || activeData.recent.length === 0) ? <SectionEmpty message="No places found for this asset." /> : null}

      {status === 'success' && activeData && activeData.recent.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Countries</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {activeData.countries.slice(0, 5).map((item, index) => (
                <li key={item.code}>
                  <MapLink href={`/map?country=${encodeURIComponent(item.code)}&payment=${encodeURIComponent(selectedAsset)}&asset=${encodeURIComponent(selectedAsset)}`} className="flex justify-between rounded px-1 py-1 hover:bg-gray-50">
                    <span>{index + 1}. {item.country}</span>
                    <span className="font-semibold">{item.total}</span>
                  </MapLink>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {activeData.categories.slice(0, 5).map((item, index) => (
                <li key={item.key}>
                  <MapLink href={`/map?category=${encodeURIComponent(item.label)}&payment=${encodeURIComponent(selectedAsset)}&asset=${encodeURIComponent(selectedAsset)}`} className="flex justify-between rounded px-1 py-1 hover:bg-gray-50">
                    <span>{index + 1}. {item.label}</span>
                    <span className="font-semibold">{item.total}</span>
                  </MapLink>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Recent Items</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {activeData.recent.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <MapLink href={`/map?place=${encodeURIComponent(item.id)}&payment=${encodeURIComponent(selectedAsset)}&asset=${encodeURIComponent(selectedAsset)}`} className="block rounded px-1 py-1 hover:bg-gray-50">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-600">{item.city}, {item.country}</p>
                  </MapLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </SectionShell>
  );
}
