"use client";

import { useMemo } from "react";

import { useHealthStatus } from "@/components/status/useHealthStatus";

type StatusClientProps = {
  buildSha: string | null;
};

const formatTimestamp = (value: Date | null) => {
  if (!value) return "Checking…";
  return value.toLocaleString();
};

export default function StatusClient({ buildSha }: StatusClientProps) {
  const { status, lastUpdated } = useHealthStatus();

  const overall = useMemo(() => {
    if (!status) {
      return {
        label: "CHECKING",
        className: "border-gray-200 bg-gray-50 text-gray-600",
      };
    }

    if (status.ok && status.db.ok) {
      return {
        label: "OK",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      };
    }

    return {
      label: "DEGRADED",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }, [status]);

  const dbLabel = status?.db.ok ? "OK" : "DOWN";
  const latency = status?.db.latencyMs;
  const shortSha = buildSha ? buildSha.slice(0, 7) : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">System Status</h1>
        <p className="text-sm text-gray-600">
          Live health checks for API and database availability.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-600">Overall</p>
            <div
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${overall.className}`}
            >
              <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
              {overall.label}
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Last checked</p>
            <p className="font-medium text-gray-700">
              {formatTimestamp(lastUpdated)}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">API</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {status?.ok ? "OK" : "DOWN"}
            </p>
            {!status?.ok && (
              <p className="mt-1 text-xs text-gray-600">
                Temporary data issue. Please try again shortly.
              </p>
            )}
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Database</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{dbLabel}</p>
            <p className="mt-1 text-xs text-gray-600">
              {status?.db.ok
                ? `Latency: ${latency ?? "-"} ms`
                : "Temporary data issue. Data may be delayed."}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-500">
          <p>
            Timestamp: <span className="text-gray-700">{formatTimestamp(lastUpdated)}</span>
          </p>
          <p>
            Build:{" "}
            <span className="text-gray-700">
              {shortSha ? `commit ${shortSha}` : "unknown"}
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
