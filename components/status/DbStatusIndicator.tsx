"use client";

import { useMemo } from "react";

import { useHealthStatus } from "./useHealthStatus";

type DbStatusIndicatorProps = {
  className?: string;
  showBanner?: boolean;
};

export default function DbStatusIndicator({
  className,
  showBanner = false,
}: DbStatusIndicatorProps) {
  const { status } = useHealthStatus();
  const { label, badgeClass, dotClass, isDown } = useMemo(() => {
    if (!status) {
      return {
        label: "CHECKING",
        badgeClass: "border-gray-200 bg-gray-50 text-gray-600",
        dotClass: "bg-gray-400",
        isDown: false,
      };
    }

    if (status.db.ok) {
      return {
        label: "OK",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dotClass: "bg-emerald-500",
        isDown: false,
      };
    }

    return {
      label: "DOWN",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      dotClass: "bg-rose-500",
      isDown: true,
    };
  }, [status]);

  return (
    <div className={className}>
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
      >
        <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        DB: {label}
      </div>
      {showBanner && isDown && (
        <div className="mt-2 w-full max-w-sm rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
          <p className="font-semibold">Temporary data issue</p>
          <p>Some data may not load while the database is unavailable. Please try again shortly.</p>
        </div>
      )}
    </div>
  );
}
