'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DiscoverAssetListItem, DiscoverAssetPanel } from '@/lib/discover/types';
import { LimitedDataNote, MapLink, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, fetchDiscover } from './shared';

const EMPTY_PANEL = (asset: string): DiscoverAssetPanel => ({ asset, countriesTop5: [], categoriesTop5: [], recent5: [] });

export default function AssetExplorerSection() {
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assets, setAssets] = useState<DiscoverAssetListItem[]>([]);
  const [assetsLimited, setAssetsLimited] = useState(false);
  const [assetsLimitedReason, setAssetsLimitedReason] = useState<string | undefined>();
  const [assetsRetrying, setAssetsRetrying] = useState(false);

  const [selectedAsset, setSelectedAsset] = useState('');
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panel, setPanel] = useState<DiscoverAssetPanel>(EMPTY_PANEL(''));
  const [panelLimited, setPanelLimited] = useState(false);
  const [panelLimitedReason, setPanelLimitedReason] = useState<string | undefined>();
  const [panelRetrying, setPanelRetrying] = useState(false);

  const panelAbortRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAssets = useCallback(async (force = false) => {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const payload = await fetchDiscover<DiscoverAssetListItem[]>('/api/discover/assets', {
        cacheKey: 'assets:list',
        force,
      });
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
      setAssetsRetrying(false);
    }
  }, [selectedAsset]);

  const loadPanel = useCallback(async (asset: string, force = false) => {
    if (!asset) return;
    panelAbortRef.current?.abort();
    const controller = new AbortController();
    panelAbortRef.current = controller;
    setPanelLoading(true);
    setPanelError(null);
    try {
      const payload = await fetchDiscover<DiscoverAssetPanel>(`/api/discover/assets/${encodeURIComponent(asset)}`, {
        cacheKey: `assets:panel:${asset}`,
        signal: controller.signal,
        force,
      });
      if (controller.signal.aborted) return;
      setPanel(payload.data);
      setPanelLimited(payload.limited);
      setPanelLimitedReason(payload.reason);
    } catch (err) {
      if (controller.signal.aborted) return;
      setPanelError(err instanceof Error ? err.message : 'Unable to load asset panel');
      setPanel(EMPTY_PANEL(asset));
    } finally {
      if (!controller.signal.aborted) {
        setPanelLoading(false);
        setPanelRetrying(false);
      }
    }
  }, []);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    if (selectedAsset) loadPanel(selectedAsset);
  }, [selectedAsset, loadPanel]);

  useEffect(() => () => {
    panelAbortRef.current?.abort();
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  }, []);

  const activeAsset = selectedAsset || assets[0]?.asset || '';

  const retryAssets = () => {
    if (assetsRetrying) return;
    setAssetsRetrying(true);
    retryTimeoutRef.current = setTimeout(() => loadAssets(true), 300);
  };

  const retryPanel = () => {
    if (panelRetrying || !activeAsset) return;
    setPanelRetrying(true);
    retryTimeoutRef.current = setTimeout(() => loadPanel(activeAsset, true), 300);
  };

  return (
    <SectionShell title="Asset Explorer" description="Explore top countries, categories, and recent places by selected asset.">
      <div className="mb-4 flex flex-wrap gap-2">
        {assets.slice(0, 12).map((asset) => (
          <button
            type="button"
            key={asset.asset}
            onClick={() => setSelectedAsset(asset.asset)}
            className={`max-w-full rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm ${
              activeAsset === asset.asset ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700'
            }`}
            title={asset.asset}
          >
            <span className="block max-w-[120px] truncate">{asset.asset}</span>
          </button>
        ))}
      </div>

      {assetsLoading ? <SimpleSkeletonRows rows={2} rowClassName="h-10" /> : null}
      {assetsError ? (
        <SectionError
          summary="Asset list is temporarily unavailable."
          details={assetsError}
          onRetry={retryAssets}
          retrying={assetsRetrying}
        />
      ) : null}

      {panelLoading ? <div className="mt-3"><SimpleSkeletonRows rows={4} rowClassName="h-[56px]" /></div> : null}
      {panelError ? (
        <div className="mt-3">
          <SectionError
            summary="Asset details are temporarily unavailable."
            details={panelError}
            onRetry={retryPanel}
            retrying={panelRetrying}
          />
        </div>
      ) : null}

      {!assetsLoading && !assetsError && !panelLoading && !panelError && panel.recent5.length === 0 ? <SectionEmpty message="No places found for this asset." /> : null}

      {!panelLoading && !panelError && panel.recent5.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Countries</h3>
            <ol className="mt-2 space-y-2 text-sm">
              {panel.countriesTop5.slice(0, 5).map((item, index) => (
                <li key={item.countryCode}>
                  <MapLink href={`/map?country=${encodeURIComponent(item.countryCode)}&asset=${encodeURIComponent(activeAsset)}`} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-50">
                    <span className="min-w-0 flex-1 truncate">{index + 1}. {item.countryCode}</span>
                    <span className="shrink-0 font-semibold">{item.total}</span>
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
                  <MapLink href={`/map?category=${encodeURIComponent(item.category)}&asset=${encodeURIComponent(activeAsset)}`} className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-gray-50">
                    <span className="min-w-0 flex-1 truncate">{index + 1}. {item.category}</span>
                    <span className="shrink-0 font-semibold">{item.total}</span>
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
                    <p className="truncate font-medium text-gray-900">{item.name}</p>
                    <p className="truncate text-xs text-gray-600">{item.city}, {item.country}</p>
                  </MapLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {!assetsLoading && !assetsError && (assetsLimited || panelLimited) ? <LimitedDataNote reason={assetsLimitedReason || panelLimitedReason} /> : null}
    </SectionShell>
  );
}
