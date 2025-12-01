"use client";

import type React from "react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import type { Place } from "../../types/places";

type Props = {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
};

type SheetStage = "peek" | "expanded";

const VERIFICATION_COLORS: Record<Place["verification"], string> = {
  owner: "#F59E0B",
  community: "#3B82F6",
  directory: "#14B8A6",
  unverified: "#9CA3AF",
};

const VERIFICATION_LABELS: Record<Place["verification"], string> = {
  owner: "Owner Verified",
  community: "Community Verified",
  directory: "Directory",
  unverified: "Unverified",
};

const formatAccepted = (accepted: string[]) => {
  const ordered = ["BTC", "Lightning", "ETH", "USDT"];
  const prioritized = [
    ...ordered.filter((item) => accepted.includes(item)),
    ...accepted
      .filter((item) => !ordered.includes(item))
      .sort((a, b) => a.localeCompare(b)),
  ];

  const unique = Array.from(new Set(prioritized));
  const visible = unique.slice(0, 4);
  const remaining = unique.length - visible.length;

  return {
    visible,
    remaining,
  };
};

const MobileBottomSheet = forwardRef<HTMLDivElement, Props>(
  ({ place, isOpen, onClose }, ref) => {
    const [stage, setStage] = useState<SheetStage>("peek");
    const touchStartY = useRef<number | null>(null);
    const touchCurrentY = useRef<number | null>(null);

    useEffect(() => {
      if (isOpen) {
        setStage("peek");
      }
    }, [isOpen, place]);

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
      touchStartY.current = event.touches[0]?.clientY ?? null;
      touchCurrentY.current = touchStartY.current;
    };

    const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
      touchCurrentY.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchEnd = () => {
      if (touchStartY.current === null || touchCurrentY.current === null) {
        return;
      }

      const deltaY = touchCurrentY.current - touchStartY.current;
      const threshold = 40;

      if (deltaY < -threshold) {
        setStage("expanded");
      } else if (deltaY > threshold) {
        if (stage === "expanded") {
          setStage("peek");
        } else {
          onClose();
        }
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    const sheetHeight = stage === "expanded" ? "88vh" : "32vh";

    const translateClass = useMemo(() => {
      if (!isOpen || !place) return "translate-y-full";
      return stage === "expanded"
        ? "translate-y-[calc(100vh-88vh)]"
        : "translate-y-[calc(100vh-32vh)]";
    }, [isOpen, place, stage]);

    const { visible: visibleAccepted, remaining: remainingAccepted } = useMemo(
      () => formatAccepted(place?.accepted ?? []),
      [place?.accepted],
    );

    if (!place) return null;

    return (
      <>
        <div
          ref={ref}
          className={`fixed inset-x-0 top-0 z-[10000] transform-gpu transition-transform duration-300 ease-out ${translateClass}`}
          style={{ height: sheetHeight }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="flex h-full flex-col overflow-hidden rounded-t-2xl bg-[#F7F7F7] shadow-xl">
            <div className="flex flex-col gap-4 p-4">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-300" aria-hidden />

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-gray-900">{place.name}</h2>
                  <span
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                    style={{
                      color: VERIFICATION_COLORS[place.verification],
                      borderColor: VERIFICATION_COLORS[place.verification],
                      backgroundColor: `${VERIFICATION_COLORS[place.verification]}1A`,
                    }}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: VERIFICATION_COLORS[place.verification] }}
                      aria-hidden
                    />
                    {VERIFICATION_LABELS[place.verification]}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="truncate capitalize">{place.category}</span>
                  <span className="text-gray-400">•</span>
                  <span className="truncate">
                    {place.city}
                    {place.city && place.country ? ", " : ""}
                    {place.country}
                  </span>
                </div>
              </div>
            </div>

            {((place.verification === "owner" || place.verification === "community") &&
              (place.images?.length ?? 0) > 0) && (
              <div className="flex gap-3 overflow-x-auto px-4 pb-4">
                {place.images?.slice(0, 2).map((image) => (
                  <div key={image} className="relative h-32 w-48 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                    <img src={image} alt={`${place.name} preview`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 pb-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Accepted payments
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-800">
                    {visibleAccepted.length === 0 && <span className="text-gray-500">No payment info</span>}
                    {visibleAccepted.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium shadow-sm"
                      >
                        {item}
                      </span>
                    ))}
                    {remainingAccepted > 0 && (
                      <span className="text-xs font-semibold text-gray-600">+{remainingAccepted}</span>
                    )}
                  </div>
                </div>

                {place.address && (
                  <div className="space-y-1 text-sm text-gray-700">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Address</h3>
                    <p className="leading-relaxed">{place.address}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  },
);

MobileBottomSheet.displayName = "MobileBottomSheet";

export default MobileBottomSheet;
