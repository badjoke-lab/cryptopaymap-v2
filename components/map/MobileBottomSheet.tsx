"use client";

import type React from "react";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";

import type { Place } from "../../types/places";
import { getPlaceViewModel } from "./placeViewModel";
import "./MobileBottomSheet.css";

type Props = {
  place: Place | null;
  isOpen: boolean;
  onClose: () => void;
  selectionStatus?: "idle" | "loading" | "error";
  onStageChange?: (stage: SheetStage) => void;
};

type SheetStage = "peek" | "expanded";
type StageReason = "handleTap" | "dragUp" | "dragDown" | "openInit" | "closeReset" | "placeholder" | "programmatic";
type RenderedPlaceReason =
  | "openFromPlaceProp"
  | "placePropChanged"
  | "detailMerged"
  | "closeReset"
  | "rerenderGuardHit";

type DebugEventCategory = "ALL" | "SHEET" | "MAP" | "INPUT";
type DebugEventEntry = {
  timestamp: string;
  entry: string;
};

const PEEK_HEIGHT = 35;
const EXPANDED_HEIGHT = 88;

const VERIFICATION_COLORS: Record<Place["verification"], string> = {
  owner: "#F59E0B",
  community: "#3B82F6",
  directory: "#14B8A6",
  unverified: "#9CA3AF",
};

const VERIFICATION_LABELS: Record<Place["verification"], string> = {
  owner: "Owner verified",
  community: "Community verified",
  directory: "Directory listing",
  unverified: "Unverified",
};


const areStringArraysEqual = (a?: string[] | null, b?: string[] | null) => {
  if (a === b) return true;
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const hasMeaningfulPlaceDiff = (prev: Place, next: Place) => {
  return (
    prev.name !== next.name ||
    prev.category !== next.category ||
    prev.verification !== next.verification ||
    prev.country !== next.country ||
    prev.city !== next.city ||
    prev.address_full !== next.address_full ||
    prev.description !== next.description ||
    prev.about !== next.about ||
    prev.about_short !== next.about_short ||
    prev.paymentNote !== next.paymentNote ||
    prev.updatedAt !== next.updatedAt ||
    prev.submitterName !== next.submitterName ||
    !areStringArraysEqual(prev.photos, next.photos) ||
    !areStringArraysEqual(prev.images, next.images) ||
    !areStringArraysEqual(prev.accepted, next.accepted) ||
    !areStringArraysEqual(prev.supported_crypto, next.supported_crypto)
  );
};
const MobileBottomSheet = forwardRef<HTMLDivElement, Props>(
  ({ place, isOpen, onClose, selectionStatus = "idle", onStageChange }, ref) => {
    const [stage, setStage] = useState<SheetStage>("peek");
    const [renderedPlace, setRenderedPlace] = useState<Place | null>(null);
    const touchStartY = useRef<number | null>(null);
    const touchCurrentY = useRef<number | null>(null);
    const previousPlaceIdRef = useRef<string | null>(null);
    const stageReasonRef = useRef<StageReason>("programmatic");
    const renderedPlaceReasonRef = useRef<RenderedPlaceReason>("openFromPlaceProp");
    const lastInputAtRef = useRef<number | null>(null);
    const prevIsOpenRef = useRef(isOpen);
    const lastNotifiedStageRef = useRef<SheetStage | null>(null);
    const mountCountRef = useRef(0);
    const eventLogRef = useRef<DebugEventEntry[]>([]);
    const [debugHudEnabled, setDebugHudEnabled] = useState(false);
    const [debugLogVersion, setDebugLogVersion] = useState(0);
    const [debugEventCategory, setDebugEventCategory] = useState<DebugEventCategory>("ALL");

    const pushDebugEvent = (entry: string, broadcast = true) => {
      const timestamp = new Date().toISOString();
      eventLogRef.current = [...eventLogRef.current, { timestamp, entry }].slice(-200);
      setDebugLogVersion((value) => value + 1);
      if (broadcast && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cpm-debug-event", { detail: { source: "sheet", entry } }));
      }
    };

    const markInput = (scope: "root" | "handle", eventName: "pointerdown" | "pointerup" | "click" | "touchstart" | "touchend") => {
      lastInputAtRef.current = Date.now();
      pushDebugEvent(`[input:${scope}] ${eventName}`);
    };

    const setStageWithReason = (nextStage: SheetStage, reason: StageReason) => {
      stageReasonRef.current = reason;
      setStage((current) => {
        if (current === nextStage) {
          pushDebugEvent(`[stage-intent] ${current} -> ${nextStage} reason=${reason} (no-op)`);
          return current;
        }
        pushDebugEvent(`[stage-intent] ${current} -> ${nextStage} reason=${reason}`);
        return nextStage;
      });
    };

    const setRenderedPlaceWithReason = (nextPlace: Place | null, reason: RenderedPlaceReason) => {
      renderedPlaceReasonRef.current = reason;
      setRenderedPlace((current) => {
        const currentId = current?.id ?? null;
        const nextId = nextPlace?.id ?? null;
        const sameId = currentId !== null && currentId === nextId;
        const hasDiff = Boolean(current && nextPlace && hasMeaningfulPlaceDiff(current, nextPlace));
        const shouldSkip = sameId && !hasDiff;
        pushDebugEvent(
          `[renderedPlace-intent] ${currentId ?? "null"} -> ${nextId ?? "null"} reason=${reason}${sameId ? " (sameId)" : ""}${shouldSkip ? " [skip-set]" : ""}`,
        );
        if (shouldSkip) {
          return current;
        }
        return nextPlace;
      });
    };

    useEffect(() => {
      if (place) {
        const hasPrevious = previousPlaceIdRef.current !== null;
        const sameAsPrevious = previousPlaceIdRef.current === place.id;
        const reason: RenderedPlaceReason = !hasPrevious
          ? "openFromPlaceProp"
          : sameAsPrevious
            ? "detailMerged"
            : "placePropChanged";

        previousPlaceIdRef.current = place.id;
        setRenderedPlaceWithReason(place, reason);
        if (!isOpen) {
          setStageWithReason("peek", "openInit");
        }
        return;
      }

      setRenderedPlaceWithReason(null, "closeReset");

      if (!isOpen) {
        previousPlaceIdRef.current = null;
        setStageWithReason("peek", "closeReset");
        const timeout = window.setTimeout(() => setRenderedPlaceWithReason(null, "rerenderGuardHit"), 220);
        return () => window.clearTimeout(timeout);
      }

      return undefined;
    }, [isOpen, place]);

    useEffect(() => {
      mountCountRef.current += 1;
      pushDebugEvent("[mount] MobileBottomSheet");
    }, []);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const key = "cpm_debugHud";
      const update = () => {
        setDebugHudEnabled(window.localStorage.getItem(key) === "1");
      };
      const onExternalDebugEvent = (event: Event) => {
        const detail = (event as CustomEvent<{ source?: string; entry?: string } | string>).detail;
        if (typeof detail === "string") {
          pushDebugEvent(detail, false);
          return;
        }
        if (detail?.source === "sheet") {
          return;
        }
        if (typeof detail?.entry === "string") {
          pushDebugEvent(detail.entry, false);
        }
      };
      update();
      window.addEventListener("storage", update);
      window.addEventListener("cpm-debug-hud-changed", update as EventListener);
      window.addEventListener("cpm-debug-event", onExternalDebugEvent as EventListener);
      return () => {
        window.removeEventListener("storage", update);
        window.removeEventListener("cpm-debug-hud-changed", update as EventListener);
        window.removeEventListener("cpm-debug-event", onExternalDebugEvent as EventListener);
      };
    }, []);

    const viewModel = useMemo(() => getPlaceViewModel(renderedPlace), [renderedPlace]);
    const photos = viewModel.media;

    const isRestricted =
      renderedPlace?.verification === "directory" || renderedPlace?.verification === "unverified";

    useEffect(() => {
      if (!isOpen) {
        lastNotifiedStageRef.current = null;
        return;
      }
      if (lastNotifiedStageRef.current === stage) {
        return;
      }
      lastNotifiedStageRef.current = stage;
      onStageChange?.(stage);
    }, [isOpen, onStageChange, stage]);

    useEffect(() => {
      const prevIsOpen = prevIsOpenRef.current;
      if (!prevIsOpen && isOpen) {
        pushDebugEvent("open");
        if (!place) {
          stageReasonRef.current = "placeholder";
        }
      }

      if (prevIsOpen && !isOpen) {
        pushDebugEvent("close");
      }

      prevIsOpenRef.current = isOpen;
    }, [isOpen, place]);

    useEffect(() => {
      const now = Date.now();
      const recentInput = lastInputAtRef.current !== null && now - lastInputAtRef.current <= 200;
      pushDebugEvent(`[stage-change] ${stage} reason=${stageReasonRef.current} recentInput200ms=${recentInput}`);
    }, [stage]);

    useEffect(() => {
      const now = Date.now();
      const recentInput = lastInputAtRef.current !== null && now - lastInputAtRef.current <= 200;
      pushDebugEvent(
        `[renderedPlace-set] ${renderedPlace ? renderedPlace.id : "null"} reason=${renderedPlaceReasonRef.current} recentInput200ms=${recentInput}`,
      );
    }, [renderedPlace]);

    const canShowPhotos = photos.length > 0;
    const descriptionText = renderedPlace?.description ?? renderedPlace?.about_short ?? renderedPlace?.about ?? null;
    const canShowDescription = Boolean(renderedPlace && !isRestricted && descriptionText);
    const fullAddress = viewModel.fullAddress;
    const shortAddress = [renderedPlace?.city, renderedPlace?.country].filter(Boolean).join(", ");
    const amenities = viewModel.amenities;
    const paymentNote = viewModel.paymentNote;
    const submitter = renderedPlace?.submitterName ?? renderedPlace?.updatedAt;

    useEffect(() => {
      if (!isOpen || !renderedPlace) return undefined;

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onClose();
        }
      };

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose, renderedPlace]);

    const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
      markInput("handle", "touchstart");
      touchStartY.current = event.touches[0]?.clientY ?? null;
      touchCurrentY.current = touchStartY.current;
    };

    const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
      touchCurrentY.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchEnd = () => {
      markInput("handle", "touchend");
      if (touchStartY.current === null || touchCurrentY.current === null) {
        return;
      }

      const deltaY = touchCurrentY.current - touchStartY.current;
      const threshold = 40;

      if (deltaY < -threshold) {
        setStageWithReason("expanded", "dragUp");
      } else if (deltaY > threshold && stage === "expanded") {
        setStageWithReason("peek", "dragDown");
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    const handleSheetRootPointerDown = () => markInput("root", "pointerdown");
    const handleSheetRootPointerUp = () => markInput("root", "pointerup");
    const handleSheetRootClick = () => markInput("root", "click");
    const handleSheetRootTouchStart = () => markInput("root", "touchstart");
    const handleSheetRootTouchEnd = () => markInput("root", "touchend");

    const handleGripPointerDown = () => markInput("handle", "pointerdown");
    const handleGripPointerUp = () => markInput("handle", "pointerup");
    const handleGripClick = () => {
      markInput("handle", "click");
      setStageWithReason(stage === "peek" ? "expanded" : "peek", "handleTap");
    };

    if (!renderedPlace && !isOpen) {
      return null;
    }

    const showPlaceholder = isOpen && !renderedPlace;
    const effectiveStage = stage;
    const sheetHeight = effectiveStage === "expanded" ? `${EXPANDED_HEIGHT}vh` : `${PEEK_HEIGHT}vh`;
    const showDetails = effectiveStage === "expanded";
    const isVisible = isOpen && (Boolean(renderedPlace) || showPlaceholder);

    const panelHeightPx =
      typeof window !== "undefined"
        ? Math.round(
            (window.innerHeight * (effectiveStage === "expanded" ? EXPANDED_HEIGHT : PEEK_HEIGHT)) / 100,
          )
        : null;
    const panelTransform = `translateY(${isVisible ? "0" : "100%"})`;

    const categorizedEvents = eventLogRef.current.map((eventItem) => {
      const logLine = `${eventItem.timestamp} ${eventItem.entry}`;
      if (eventItem.entry.startsWith("[map]")) {
        return { ...eventItem, logLine, category: "MAP" as const };
      }
      if (eventItem.entry.startsWith("[input:")) {
        return { ...eventItem, logLine, category: "INPUT" as const };
      }
      return { ...eventItem, logLine, category: "SHEET" as const };
    });

    const pinnedMapEvents = categorizedEvents
      .filter((eventItem) => eventItem.category === "MAP")
      .slice(-10)
      .reverse();

    const filteredEvents = categorizedEvents.filter((eventItem) => {
      if (debugEventCategory === "ALL") return true;
      return eventItem.category === debugEventCategory;
    });

    const displayedEvents = filteredEvents.slice(-30).reverse();

    const debugHudContent = debugHudEnabled ? (
      <section
        style={{
          margin: "8px 12px 0",
          borderRadius: "8px",
          border: "1px solid #fca5a5",
          background: "rgba(127, 29, 29, 0.92)",
          color: "#fee2e2",
          padding: "8px",
          fontSize: "11px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          maxHeight: "180px",
          overflow: "auto",
        }}
      >
        <div>isOpen: {String(isOpen)}</div>
        <div>stage: {stage}</div>
        <div>effectiveStage: {effectiveStage}</div>
        <div>showPlaceholder: {String(showPlaceholder)}</div>
        <div>renderedPlace: {renderedPlace ? `yes (${renderedPlace.id})` : "no"}</div>
        <div>place prop: {place ? `yes (${place.id})` : "no"}</div>
        <div>panel height(px): {panelHeightPx ?? "n/a"}</div>
        <div>panel transform: {panelTransform}</div>
        <div>mountCount: {mountCountRef.current}</div>
        <div style={{ marginTop: "6px", fontWeight: 700 }}>events filter</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
          {(["ALL", "SHEET", "MAP", "INPUT"] as DebugEventCategory[]).map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setDebugEventCategory(category)}
              style={{
                border: "1px solid #fca5a5",
                borderRadius: "6px",
                padding: "2px 6px",
                background: debugEventCategory === category ? "#7f1d1d" : "transparent",
                color: "#fee2e2",
                fontSize: "10px",
              }}
            >
              {category}
            </button>
          ))}
        </div>
        <div style={{ marginTop: "6px", fontWeight: 700 }}>
          pinned [map] (latest 10)
        </div>
        {pinnedMapEvents.length === 0 ? <div>none</div> : null}
        {pinnedMapEvents.map((eventItem, index) => (
          <div key={`map-${index}-${debugLogVersion}`}>{eventItem.logLine}</div>
        ))}
        <div style={{ marginTop: "6px", fontWeight: 700 }}>
          events ({debugEventCategory}) latest 30 / stored {categorizedEvents.length}
        </div>
        {displayedEvents.length === 0 ? <div>none</div> : null}
        {displayedEvents.map((eventItem, index) => (
          <div key={`${eventItem.timestamp}-${index}-${debugLogVersion}`}>{eventItem.logLine}</div>
        ))}
      </section>
    ) : null;

    if (showPlaceholder) {
      const placeholderMessage =
        selectionStatus === "loading"
          ? "Loading place details..."
          : "Place details are unavailable right now.";
      return (
        <div
          className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`}
          ref={ref}
          onPointerDown={handleSheetRootPointerDown}
          onPointerUp={handleSheetRootPointerUp}
          onClick={handleSheetRootClick}
          onTouchStart={handleSheetRootTouchStart}
          onTouchEnd={handleSheetRootTouchEnd}
        >
          {isOpen ? (
            <button
              type="button"
              className="cpm-bottom-sheet__backdrop"
              aria-label="Close"
              onClick={onClose}
            />
          ) : null}
          <div
            className="cpm-bottom-sheet__panel"
            style={{ height: sheetHeight, transform: panelTransform }}
          >
            <div className="cpm-bottom-sheet__handle">
              <span className="cpm-bottom-sheet__handle-bar" aria-hidden />
            </div>
            <header className="cpm-bottom-sheet__header">
              <div className="cpm-bottom-sheet__title-block">
                <div className="cpm-bottom-sheet__title-row">
                  <h2 className="cpm-bottom-sheet__title">Place details</h2>
                </div>
              </div>
              <button
                type="button"
                className="cpm-bottom-sheet__close"
                onClick={onClose}
                aria-label="Close drawer"
              >
                ×
              </button>
            </header>
            {debugHudContent}
            <div className="cpm-bottom-sheet__content" role="presentation">
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Status</h3>
                </div>
                <p className="cpm-bottom-sheet__muted">{placeholderMessage}</p>
              </section>
            </div>
          </div>
        </div>
      );
    }

    if (!renderedPlace) {
      return null;
    }

    return (
      <div
        className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`}
        ref={ref}
        onPointerDown={handleSheetRootPointerDown}
        onPointerUp={handleSheetRootPointerUp}
        onClick={handleSheetRootClick}
        onTouchStart={handleSheetRootTouchStart}
        onTouchEnd={handleSheetRootTouchEnd}
      >
        <div
          className="cpm-bottom-sheet__panel"
          style={{ height: sheetHeight, transform: panelTransform }}
        >
          <div
            className="cpm-bottom-sheet__handle"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onPointerDown={handleGripPointerDown}
            onPointerUp={handleGripPointerUp}
            onClick={handleGripClick}
          >
            <span className="cpm-bottom-sheet__handle-bar" aria-hidden />
          </div>

          <header className="cpm-bottom-sheet__header">
            <div className="cpm-bottom-sheet__title-block">
              <div className="cpm-bottom-sheet__title-row">
                <h2 className="cpm-bottom-sheet__title">{renderedPlace.name}</h2>
                <span
                  className="cpm-bottom-sheet__badge"
                  style={{
                    color: VERIFICATION_COLORS[renderedPlace.verification],
                    borderColor: VERIFICATION_COLORS[renderedPlace.verification],
                    backgroundColor: `${VERIFICATION_COLORS[renderedPlace.verification]}1A`,
                  }}
                >
                  <span
                    className="cpm-bottom-sheet__badge-dot"
                    style={{ backgroundColor: VERIFICATION_COLORS[renderedPlace.verification] }}
                    aria-hidden
                  />
                  {VERIFICATION_LABELS[renderedPlace.verification]}
                </span>
              </div>
              <div className="cpm-bottom-sheet__meta-row">
                <span className="cpm-bottom-sheet__category">{renderedPlace.category}</span>
                {shortAddress && <span className="cpm-bottom-sheet__meta-dot">•</span>}
                {shortAddress && <span className="cpm-bottom-sheet__address">{shortAddress}</span>}
              </div>
            </div>
            <button
              type="button"
              className="cpm-bottom-sheet__close"
              onClick={onClose}
              aria-label="Close drawer"
            >
              ×
            </button>
          </header>

          {debugHudContent}

          <div className="cpm-bottom-sheet__content" role="presentation">
            <section className="cpm-bottom-sheet__section">
              <div className="cpm-bottom-sheet__section-head">
                <h3 className="cpm-bottom-sheet__section-title">Accepted payments</h3>
              </div>
              <div className="cpm-bottom-sheet__pill-row">
                {viewModel.accepted.map((item) => (
                  <span key={item} className="cpm-bottom-sheet__pill">
                    {item}
                  </span>
                ))}
                {viewModel.accepted.length === 0 && (
                  <span className="cpm-bottom-sheet__muted">Not provided</span>
                )}
              </div>
            </section>

            {showDetails && canShowPhotos && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Photos</h3>
                </div>
                <div className="cpm-bottom-sheet__carousel" aria-label={`${renderedPlace.name} photos`}>
                  {photos.map((image) => (
                    <div key={image} className="cpm-bottom-sheet__carousel-item">
                      <img src={image} alt={`${renderedPlace.name} photo`} className="cpm-bottom-sheet__photo" />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {showDetails && canShowDescription && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Description</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{descriptionText}</p>
              </section>
            )}

            {showDetails && viewModel.websiteLink && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Website</h3>
                </div>
                <div className="cpm-bottom-sheet__links">
                  <a
                    className="cpm-bottom-sheet__link"
                    href={viewModel.websiteLink.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {viewModel.websiteLink.label}
                  </a>
                </div>
              </section>
            )}

            {showDetails && viewModel.socialLinks.length > 0 && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">SNS</h3>
                </div>
                <div className="cpm-bottom-sheet__links">
                  {viewModel.socialLinks.map((social) => (
                    <a
                      key={social.key}
                      className="cpm-bottom-sheet__link"
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {social.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {showDetails && viewModel.phoneLink && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Phone</h3>
                </div>
                <div className="cpm-bottom-sheet__links">
                  <a className="cpm-bottom-sheet__link" href={viewModel.phoneLink.href}>
                    {viewModel.phoneLink.label}
                  </a>
                </div>
              </section>
            )}

            {showDetails && viewModel.navigateLinks.length > 0 && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Navigate</h3>
                </div>
                <div className="cpm-bottom-sheet__nav">
                  {viewModel.navigateLinks.map((link) => (
                    <a
                      key={link.key}
                      className="cpm-bottom-sheet__nav-link"
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {link.label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {showDetails && paymentNote && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Payment note</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{paymentNote}</p>
              </section>
            )}

            {showDetails && (amenities.length > 0 || Boolean(viewModel.amenitiesNotes)) && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Amenities</h3>
                </div>
                <div className="cpm-bottom-sheet__pill-row">
                  {amenities.map((item) => (
                    <span key={item} className="cpm-bottom-sheet__pill muted">
                      {item}
                    </span>
                  ))}
                </div>
                {viewModel.amenitiesNotes && (
                  <p className="cpm-bottom-sheet__body muted">{viewModel.amenitiesNotes}</p>
                )}
              </section>
            )}

            {showDetails && fullAddress && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Address</h3>
                </div>
                <p className="cpm-bottom-sheet__body">{fullAddress}</p>
              </section>
            )}

            {showDetails && !isRestricted && submitter && (
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Submitted by</h3>
                </div>
                <p className="cpm-bottom-sheet__body muted">{submitter}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  },
);

MobileBottomSheet.displayName = "MobileBottomSheet";

export default MobileBottomSheet;
