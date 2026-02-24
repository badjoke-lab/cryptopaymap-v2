"use client";

import { useState } from "react";

import AssetTypeahead from "./AssetTypeahead";
import type { PaymentAcceptDraft } from "./types";

const KNOWN_RAILS = [
  "bitcoin",
  "lightning",
  "ethereum",
  "solana",
  "tron",
  "polygon",
  "bsc",
  "base",
  "arbitrum",
  "optimism",
  "liquid",
] as const;

type PaymentAcceptsEditorProps = {
  value: PaymentAcceptDraft[];
  assetOptions: string[];
  onChange: (next: PaymentAcceptDraft[]) => void;
};

const normalizeAsset = (value: string) => value.trim().replace(/\s+/g, "").toUpperCase();
const normalizeRail = (value: string) => value.trim().toLowerCase();

export default function PaymentAcceptsEditor({ value, assetOptions, onChange }: PaymentAcceptsEditorProps) {
  const selectedAssets = value.map((entry) => entry.assetKey);

  const addAsset = (assetKey: string) => {
    const normalizedAsset = normalizeAsset(assetKey);
    if (!normalizedAsset || value.some((entry) => entry.assetKey === normalizedAsset)) return;
    onChange([...value, { assetKey: normalizedAsset, rails: [], customRails: [] }]);
  };

  const removeAsset = (assetKey: string) => {
    onChange(value.filter((entry) => entry.assetKey !== assetKey));
  };

  const toggleRail = (assetKey: string, rail: string, checked: boolean) => {
    onChange(
      value.map((entry) => {
        if (entry.assetKey !== assetKey) return entry;
        const rails = checked ? [...entry.rails, rail] : entry.rails.filter((r) => r !== rail);
        return { ...entry, rails };
      }),
    );
  };

  const addCustomRail = (assetKey: string, raw: string) => {
    const customRail = normalizeRail(raw);
    if (!customRail) return;
    onChange(
      value.map((entry) => {
        if (entry.assetKey !== assetKey) return entry;
        if (entry.customRails.includes(customRail)) return entry;
        return { ...entry, customRails: [...entry.customRails, customRail] };
      }),
    );
  };

  const removeCustomRail = (assetKey: string, rail: string) => {
    onChange(
      value.map((entry) =>
        entry.assetKey === assetKey ? { ...entry, customRails: entry.customRails.filter((r) => r !== rail) } : entry,
      ),
    );
  };

  return (
    <div className="space-y-3">
      <AssetTypeahead options={assetOptions} selectedAssets={selectedAssets} onAddAsset={addAsset} />

      {value.length ? (
        <div className="space-y-3">
          {value.map((entry) => (
            <AssetRailsCard
              key={entry.assetKey}
              entry={entry}
              onRemoveAsset={removeAsset}
              onToggleRail={toggleRail}
              onAddCustomRail={addCustomRail}
              onRemoveCustomRail={removeCustomRail}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-600">No assets added yet.</p>
      )}
      <p className="text-xs text-gray-500">If an asset has no rails selected, it will be sent with rail_key=&quot;unknown&quot;.</p>
    </div>
  );
}

function AssetRailsCard({
  entry,
  onRemoveAsset,
  onToggleRail,
  onAddCustomRail,
  onRemoveCustomRail,
}: {
  entry: PaymentAcceptDraft;
  onRemoveAsset: (assetKey: string) => void;
  onToggleRail: (assetKey: string, rail: string, checked: boolean) => void;
  onAddCustomRail: (assetKey: string, rail: string) => void;
  onRemoveCustomRail: (assetKey: string, rail: string) => void;
}) {
  return (
    <div className="rounded-md border border-gray-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-900">{entry.assetKey}</p>
        <button type="button" className="text-xs text-red-600 underline" onClick={() => onRemoveAsset(entry.assetKey)}>
          Remove asset
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {KNOWN_RAILS.map((rail) => (
          <label key={`${entry.assetKey}-${rail}`} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
            <input
              type="checkbox"
              checked={entry.rails.includes(rail)}
              onChange={(e) => onToggleRail(entry.assetKey, rail, e.target.checked)}
            />
            <span>{rail}</span>
          </label>
        ))}
      </div>
      <CustomRailInput
        assetKey={entry.assetKey}
        customRails={entry.customRails}
        onAddCustomRail={onAddCustomRail}
        onRemoveCustomRail={onRemoveCustomRail}
      />
    </div>
  );
}

function CustomRailInput({
  assetKey,
  customRails,
  onAddCustomRail,
  onRemoveCustomRail,
}: {
  assetKey: string;
  customRails: string[];
  onAddCustomRail: (assetKey: string, rail: string) => void;
  onRemoveCustomRail: (assetKey: string, rail: string) => void;
}) {
  const [customInput, setCustomInput] = useState("");
  const commit = () => {
    onAddCustomRail(assetKey, customInput);
    setCustomInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          className="w-full rounded-md border px-3 py-2"
          placeholder="Custom rail"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            commit();
          }}
        />
        <button
          type="button"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          onClick={commit}
        >
          Add custom rail
        </button>
      </div>
      {customRails.length ? (
        <div className="flex flex-wrap gap-2">
          {customRails.map((rail) => (
            <span key={`${assetKey}-${rail}`} className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs">
              {rail}
              <button type="button" className="text-red-600" onClick={() => onRemoveCustomRail(assetKey, rail)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
