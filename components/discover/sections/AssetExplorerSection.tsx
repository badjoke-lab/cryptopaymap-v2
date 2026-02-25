'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DiscoverAssetListItem, DiscoverAssetPanel } from '@/lib/discover/types';
import { LimitedDataNote, MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, fetchDiscover } from './shared';

const EMPTY_PANEL = (asset: string): DiscoverAssetPanel => ({ asset, countriesTop5: [], categoriesTop5: [], recent5: [] });

export default function AssetExplorerSection() {
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assets, setAssets] = useState<DiscoverAssetListItem[]>([]);
  const [assetsLimited, setAssetsLimited] = useState(false);
  const [assetsLimitedReason, setAssetsLimitedReason] = useState<string | undefined>();

  const [selectedAsset, setSelectedAsset] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panel, setPanel] = useState<DiscoverAssetPanel>(EMPTY_PANEL(''));
  const [panelLimited, setPanelLimited] = useState(false);
  const [panelLimitedReason, setPanelLimitedReason] = useState<string | undefined>();

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const payload = await fetchDiscover<DiscoverAssetListItem[]>('/api/discover/assets');
      setAssets(payload.data);
      setAssetsLimited(payload.limited);
      setAssetsLimitedReason(payload.reason);
      if (!selectedAsset && payload.data[0]) {
        setSelectedAsset(payload.data[0].asset);
      }
    } catch (err) {
      setAssetsError(err instanceof Error ? err.message : 'Unable to load asset list');
    } finally {
      setAssetsLoading(false);
    }
  }, [selectedAsset]);

  const loadPanel = useCallback(async (asset: string) => {
    if (!asset) return;
    setPanelLoading(true);
    setPanelError(null);
    try {
      const payload = await fetchDiscover<DiscoverAssetPanel>(`/api/discover/assets/${encodeURIComponent(asset)}`);
      setPanel(payload.data);
      setPanelLimited(payload.limited);
      setPanelLimitedReason(payload.reason);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Unable to load asset panel');
      setPanel(EMPTY_PANEL(asset));
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (selectedAsset) loadPanel(selectedAsset);
  }, [selectedAsset, loadPanel]);

  const isLoading = assetsLoading || panelLoading;
  const hasError = assetsError || panelError;
  const activeAsset = selectedAsset || assets[0]?.asset || '';

  return (
    <SectionShell title="Asset Explorer" description="Explore top countries, categories, and recent places by selected asset.">
      <div className="mb-4 flex flex-wrap gap-2">
        {assets.slice(0, 12).map((asset) => (
          <button
            type="button"
            key={asset.asset}
            onClick={() => setSelectedAsset(asset.asset)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${
              activeAsset === asset.asset ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700'
            }`}
          >
            {asset.asset}
          </button>
        ))}
      </div>

      {isLoading ? <SimpleSkeletonRows rows={4} /> : null}
      {hasError ? (
        <SectionError
          summary="Asset explorer is temporarily unavailable."
          details={hasError}
          onRetry={() => {
            loadAssets();
            if (activeAsset) loadPanel(activeAsset);
          }}
        />
      ) : null}
      {!isLoading && !hasError && panel.recent5.length === 0 ? <SectionEmpty message="No places found for this asset." /> : null}

      {!isLoading && !hasError && panel.recent5.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Countries</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {panel.countriesTop5.slice(0, 5).map((item, index) => (
                <li key={item.countryCode}>
                  <MapLink href={`/map?country=${encodeURIComponent(item.countryCode)}&asset=${encodeURIComponent(activeAsset)}`} className="flex justify-between rounded px-1 py-1 hover:bg-gray-50">
                    <span>{index + 1}. {item.countryCode}</span>
                    <span className="font-semibold">{item.total}</span>
                  </MapLink>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Categories</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {panel.categoriesTop5.slice(0, 5).map((item, index) => (
                <li key={item.category}>
                  <MapLink href={`/map?category=${encodeURIComponent(item.category)}&asset=${encodeURIComponent(activeAsset)}`} className="flex justify-between rounded px-1 py-1 hover:bg-gray-50">
                    <span>{index + 1}. {item.category}</span>
                    <span className="font-semibold">{item.total}</span>
                  </MapLink>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Recent Items</h3>
            <ul className="mt-2 space-y-2 text-sm">
              {panel.recent5.slice(0, 5).map((item) => (
                <li key={item.placeId}>
                  <MapLink href={`/map?place=${encodeURIComponent(item.placeId)}`} className="block rounded px-1 py-1 hover:bg-gray-50">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-xs text-gray-600">{item.city}, {item.country}</p>
                  </MapLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {assetsLimited || panelLimited ? <LimitedDataNote reason={assetsLimitedReason || panelLimitedReason} /> : null}
    </SectionShell>
  );
}
