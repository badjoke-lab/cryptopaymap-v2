"use client";

import { useMemo, useState } from "react";

import { ASSET_CATALOG, getAssetSuggestions, normalizeAssetKey } from "@/lib/assets";

type AddAssetInput = {
  assetKey: string;
  displayLabel: string;
};

type AssetTypeaheadProps = {
  options: string[];
  selectedAssets: string[];
  onAddAsset: (asset: AddAssetInput) => void;
};

const prettyCustomLabel = (raw: string, normalized: string) => {
  const trimmed = raw.trim();
  return trimmed || normalized;
};

export default function AssetTypeahead({ options, selectedAssets, onAddAsset }: AssetTypeaheadProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const mergedOptions = useMemo(() => {
    const bySymbol = new Map(ASSET_CATALOG.map((entry) => [entry.symbol, entry]));
    options.forEach((option) => {
      const symbol = normalizeAssetKey(option);
      if (!symbol || symbol === "LIGHTNING" || bySymbol.has(symbol)) return;
      bySymbol.set(symbol, { symbol, name: symbol, aliases: [] });
    });
    return Array.from(bySymbol.values());
  }, [options]);

  const suggestions = useMemo(() => getAssetSuggestions(query, mergedOptions, selectedAssets, 12), [query, mergedOptions, selectedAssets]);

  const selectAsset = ({ assetKey, displayLabel }: AddAssetInput) => {
    if (selectedAssets.includes(assetKey)) return;
    onAddAsset({ assetKey, displayLabel });
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  };

  const addFromRawInput = () => {
    const normalized = normalizeAssetKey(query);
    if (!normalized) return;

    const exact = mergedOptions.find((entry) => normalizeAssetKey(entry.symbol) === normalized);
    if (exact) {
      selectAsset({
        assetKey: normalized,
        displayLabel: `${exact.name} (${normalized})`,
      });
      return;
    }

    selectAsset({ assetKey: normalized, displayLabel: prettyCustomLabel(query, normalized) });
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="flex gap-2">
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(e.target.value.trim().length >= 1);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(query.trim().length >= 1)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                return;
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!suggestions.length) return;
                setOpen(true);
                setActiveIndex((prev) => (prev + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!suggestions.length) return;
                setOpen(true);
                setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (open && suggestions[activeIndex]) {
                  const selected = suggestions[activeIndex];
                  selectAsset({ assetKey: selected.symbol, displayLabel: selected.label });
                  return;
                }
                addFromRawInput();
              }
            }}
            placeholder="Search crypto (e.g. Bitcoin, USDT)"
          />
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
            onClick={addFromRawInput}
          >
            Add asset
          </button>
        </div>

        {open && query.trim().length >= 1 && suggestions.length ? (
          <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.symbol}>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-gray-100" : "bg-white"}`}
                  onMouseDown={() => selectAsset({ assetKey: suggestion.symbol, displayLabel: suggestion.label })}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {suggestions.length ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 5).map((suggestion) => (
            <button
              key={`chip-${suggestion.symbol}`}
              type="button"
              onClick={() => selectAsset({ assetKey: suggestion.symbol, displayLabel: suggestion.label })}
              className="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
