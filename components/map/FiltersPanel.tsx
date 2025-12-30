"use client";

import type { ChangeEvent } from "react";

import type { FilterMeta, FilterState } from "@/lib/filters";

export type FiltersPanelProps = {
  filters: FilterState;
  meta: FilterMeta | null;
  onChange: (next: FilterState) => void;
  onClear: () => void;
  disabled?: boolean;
  showHeading?: boolean;
};

const VERIFICATION_LABELS: Record<string, string> = {
  owner: "Owner",
  community: "Community",
  directory: "Directory",
  unverified: "Unverified",
};

export function FiltersPanel({ filters, meta, onChange, onClear, disabled, showHeading = true }: FiltersPanelProps) {
  const handleCheckboxChange = (
    event: ChangeEvent<HTMLInputElement>,
    key: "chains" | "payments" | "verifications",
    value: string,
  ) => {
    const current = new Set(filters[key]);
    if (event.target.checked) {
      current.add(value);
    } else {
      current.delete(value);
    }

    onChange({ ...filters, [key]: Array.from(current) });
  };

  const isCityDisabled = !filters.country;
  const cityOptions: string[] =
    filters.country && meta?.citiesByCountry[filters.country]
      ? meta.citiesByCountry[filters.country]
      : [];

  return (
    <div className="flex flex-col gap-4">
      {showHeading && <h3 className="text-sm font-semibold text-gray-900">Filters</h3>}
      <div className="grid grid-cols-1 gap-4 text-sm">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Search</span>
          <input
            type="search"
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Search by name or address"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            disabled={disabled}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Category</span>
          <select
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={filters.category ?? ""}
            onChange={(event) =>
              onChange({ ...filters, category: event.target.value ? event.target.value : null })
            }
            disabled={disabled || !meta}
          >
            <option value="">All categories</option>
            {meta?.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-600">Chain</legend>
          <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-sm shadow-inner">
            {meta?.chains.map((chain) => (
              <label key={chain} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={filters.chains.includes(chain)}
                  onChange={(event) => handleCheckboxChange(event, "chains", chain)}
                  disabled={disabled}
                />
                <span>{chain}</span>
              </label>
            ))}
            {!meta && <span className="text-xs text-gray-500">Loading options…</span>}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-600">Payment</legend>
          <div className="grid max-h-32 grid-cols-2 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 text-sm shadow-inner">
            {meta?.payments.map((payment) => (
              <label key={payment} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={filters.payments.includes(payment)}
                  onChange={(event) => handleCheckboxChange(event, "payments", payment)}
                  disabled={disabled}
                />
                <span>{payment}</span>
              </label>
            ))}
            {!meta && <span className="text-xs text-gray-500">Loading options…</span>}
            {meta?.payments.length === 0 && (
              <span className="text-xs text-gray-500">No payment options</span>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-gray-600">Verification</legend>
          <div className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 bg-white p-3 shadow-inner">
            {(meta?.verificationStatuses ?? Object.keys(VERIFICATION_LABELS)).map((status) => (
              <label key={status} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={filters.verifications.includes(status as FilterState["verifications"][number])}
                  onChange={(event) => handleCheckboxChange(event, "verifications", status)}
                  disabled={disabled}
                />
                <span className="capitalize">{VERIFICATION_LABELS[status] ?? status}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">Country</span>
          <select
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={filters.country ?? ""}
            onChange={(event) =>
              onChange({
                ...filters,
                country: event.target.value ? event.target.value : null,
                city: null,
              })
            }
            disabled={disabled || !meta}
          >
            <option value="">All countries</option>
            {meta?.countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">City</span>
          <select
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50"
            value={filters.city ?? ""}
            onChange={(event) =>
            onChange({ ...filters, city: event.target.value ? event.target.value : null })
          }
          disabled={disabled || isCityDisabled}
        >
          <option value="">All cities</option>
          {cityOptions.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{meta ? "Options loaded" : "Loading filters…"}</span>
        <button
          type="button"
          className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
          onClick={onClear}
          disabled={disabled}
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}

export default FiltersPanel;
