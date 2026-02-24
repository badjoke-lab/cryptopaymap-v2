"use client";

import { useState } from "react";

import { NETWORK_LABELS, NETWORKS_BY_ASSET, normalizeNetworkKey } from "@/lib/networks";

import AssetTypeahead from "./AssetTypeahead";
import type { PaymentAcceptDraft } from "./types";

type PaymentAcceptsEditorProps = {
  value: PaymentAcceptDraft[];
  assetOptions: string[];
  onChange: (next: PaymentAcceptDraft[]) => void;
};

export default function PaymentAcceptsEditor({ value, assetOptions, onChange }: PaymentAcceptsEditorProps) {
  const selectedAssets = value.map((entry) => entry.assetKey);

  const addAsset = ({ assetKey, displayLabel }: { assetKey: string; displayLabel: string }) => {
    if (!assetKey || value.some((entry) => entry.assetKey === assetKey)) return;
    onChange([...value, { assetKey, assetLabel: displayLabel, rails: [], customRails: [] }]);
  };

  const removeAsset = (assetKey: string) => {
    onChange(value.filter((entry) => entry.assetKey !== assetKey));
  };

  const toggleNetwork = (assetKey: string, network: string, checked: boolean) => {
    onChange(
      value.map((entry) => {
        if (entry.assetKey !== assetKey) return entry;
        const nextNetworks = checked
          ? [...entry.rails, network]
          : entry.rails.filter((existingNetwork) => existingNetwork !== network);
        return { ...entry, rails: nextNetworks };
      }),
    );
  };

  const addCustomNetwork = (assetKey: string, raw: string) => {
    const customNetwork = normalizeNetworkKey(raw);
    if (!customNetwork) return;
    onChange(
      value.map((entry) => {
        if (entry.assetKey !== assetKey) return entry;
        if (entry.customRails.includes(customNetwork)) return entry;
        return { ...entry, customRails: [...entry.customRails, customNetwork] };
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
              onToggleNetwork={toggleNetwork}
              onAddCustomNetwork={addCustomNetwork}
              onRemoveCustomRail={removeCustomRail}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-600">No assets added yet.</p>
      )}
      <p className="text-xs text-gray-500">If not specified, we’ll record it as ‘unspecified’.</p>
    </div>
  );
}

function AssetRailsCard({
  entry,
  onRemoveAsset,
  onToggleNetwork,
  onAddCustomNetwork,
  onRemoveCustomRail,
}: {
  entry: PaymentAcceptDraft;
  onRemoveAsset: (assetKey: string) => void;
  onToggleNetwork: (assetKey: string, network: string, checked: boolean) => void;
  onAddCustomNetwork: (assetKey: string, network: string) => void;
  onRemoveCustomRail: (assetKey: string, rail: string) => void;
}) {
  const allowedNetworks = NETWORKS_BY_ASSET[entry.assetKey] ?? [];

  return (
    <div className="rounded-md border border-gray-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-gray-900">{entry.assetLabel ?? entry.assetKey}</p>
        <button type="button" className="text-xs text-red-600 underline" onClick={() => onRemoveAsset(entry.assetKey)}>
          Remove asset
        </button>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-gray-500">Network (optional)</p>
        <div className="flex flex-wrap gap-2">
          {allowedNetworks.map((network) => (
            <label
              key={`${entry.assetKey}-${network}`}
              className="flex items-center gap-2 rounded border px-2 py-1 text-sm"
            >
              <input
                type="checkbox"
                checked={entry.rails.includes(network)}
                onChange={(e) => onToggleNetwork(entry.assetKey, network, e.target.checked)}
              />
              <span>{NETWORK_LABELS[network] ?? network}</span>
            </label>
          ))}
        </div>
        {!allowedNetworks.length ? (
          <p className="text-xs text-gray-500">No predefined networks for this asset. Use custom network below.</p>
        ) : null}
      </div>

      <CustomRailInput
        assetKey={entry.assetKey}
        customRails={entry.customRails}
        onAddCustomRail={onAddCustomNetwork}
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
          placeholder="Custom network (e.g. BEP20, Arbitrum)"
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
          Add custom network
        </button>
      </div>
      {customRails.length ? (
        <div className="flex flex-wrap gap-2">
          {customRails.map((rail) => (
            <span
              key={`${assetKey}-${rail}`}
              className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs"
            >
              {NETWORK_LABELS[rail] ?? rail}
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
