"use client";

import { useMemo, useState } from "react";

type AssetTypeaheadProps = {
  options: string[];
  selectedAssets: string[];
  onAddAsset: (asset: string) => void;
};

const normalizeAsset = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();

export default function AssetTypeahead({ options, selectedAssets, onAddAsset }: AssetTypeaheadProps) {
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selectedAssets), [selectedAssets]);
  const normalizedQuery = normalizeAsset(query);

  const filtered = useMemo(
    () =>
      options
        .map(normalizeAsset)
        .filter(Boolean)
        .filter((asset, index, arr) => arr.indexOf(asset) === index)
        .filter((asset) => !selectedSet.has(asset))
        .filter((asset) => asset.includes(normalizedQuery))
        .slice(0, 8),
    [normalizedQuery, options, selectedSet],
  );

  const addAsset = (value: string) => {
    const normalized = normalizeAsset(value);
    if (!normalized || selectedSet.has(normalized)) return;
    onAddAsset(normalized);
    setQuery("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          className="w-full rounded-md border px-3 py-2"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type asset symbol, e.g. BTC, USDT"
        />
        <button
          type="button"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
          onClick={() => addAsset(query)}
        >
          Add asset
        </button>
      </div>
      {filtered.length ? (
        <div className="flex flex-wrap gap-2">
          {filtered.map((asset) => (
            <button
              key={asset}
              type="button"
              onClick={() => addAsset(asset)}
              className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700"
            >
              {asset}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
