"use client";

import type React from "react";
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
type DebugEventName = "open" | "close" | "setRenderedPlace" | "stageChange" | "rafSample" | "panelMount";

type DebugEvent = {
  at: number;
  event: DebugEventName;
  details: string;
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

const MobileBottomSheet = forwardRef<HTMLDivElement, Props>(
  ({ place, isOpen, onClose, selectionStatus = "idle", onStageChange }, ref) => {
    const [stage, setStage] = useState<SheetStage>("peek");
    const [renderedPlace, setRenderedPlace] = useState<Place | null>(null);
    const [debugEnabled, setDebugEnabled] = useState(false);
    const [debugHistory, setDebugHistory] = useState<DebugEvent[]>([]);
    const [panelMountCount, setPanelMountCount] = useState(0);
    const [computedPanelHeight, setComputedPanelHeight] = useState("-");
    const [computedPanelTransform, setComputedPanelTransform] = useState("-");
    const touchStartY = useRef<number | null>(null);
    const touchCurrentY = useRef<number | null>(null);
    const previousPlaceIdRef = useRef<string | null>(null);
    const panelElementRef = useRef<HTMLDivElement | null>(null);
    const rafFrameRef = useRef<number | null>(null);
    const openSampleTimeoutRef = useRef<number | null>(null);
    const isSamplingRef = useRef(false);
    const mountCountRef = useRef(0);
    const stageRef = useRef<SheetStage>("peek");
    const lastPanelNodeRef = useRef<HTMLDivElement | null>(null);

    const pushDebugEvent = (event: DebugEventName, details: string) => {
      const at = typeof performance !== "undefined" ? performance.now() : Date.now();
      setDebugHistory((prev) => {
        const next = [...prev, { at, event, details }];
        return next.slice(-50);
      });
    };

    useEffect(() => {
      const syncFromHash = () => {
        setDebugEnabled(window.location.hash.includes("debugSheet"));
      };

      syncFromHash();
      window.addEventListener("hashchange", syncFromHash);
      return () => window.removeEventListener("hashchange", syncFromHash);
    }, []);

    useEffect(() => {
      mountCountRef.current += 1;
    }, []);

    useEffect(() => {
      if (!debugEnabled) {
        setDebugHistory([]);
        setComputedPanelHeight("-");
        setComputedPanelTransform("-");
      }
    }, [debugEnabled]);

    useEffect(() => {
      if (place) {
        previousPlaceIdRef.current = place.id;
        setRenderedPlace(place);
        if (debugEnabled) {
          pushDebugEvent("setRenderedPlace", `renderedPlace.id=${place.id}`);
        }
        if (!isOpen) {
          setStage("peek");
        }
        return;
      }

      setRenderedPlace(null);
      if (debugEnabled) {
        pushDebugEvent("setRenderedPlace", "renderedPlace=null");
      }

      if (!isOpen) {
        previousPlaceIdRef.current = null;
        setStage("peek");
        const timeout = window.setTimeout(() => setRenderedPlace(null), 220);
        return () => window.clearTimeout(timeout);
      }

      return undefined;
    }, [debugEnabled, isOpen, place]);

    const viewModel = useMemo(() => getPlaceViewModel(renderedPlace), [renderedPlace]);
    const photos = viewModel.media;

    const isRestricted =
      renderedPlace?.verification === "directory" || renderedPlace?.verification === "unverified";

    useEffect(() => {
      if (!isOpen) return;
      onStageChange?.(stage);
    }, [isOpen, onStageChange, stage]);

    useEffect(() => {
      if (!debugEnabled) return;
      pushDebugEvent("stageChange", `stage=${stage}`);
    }, [debugEnabled, stage]);

    useEffect(() => {
      stageRef.current = stage;
    }, [stage]);

    useEffect(() => {
      if (!debugEnabled) return;
      pushDebugEvent(isOpen ? "open" : "close", `isOpen=${String(isOpen)}`);
    }, [debugEnabled, isOpen]);

    useEffect(() => {
      if (!debugEnabled || !isOpen) return;

      const panel = panelElementRef.current;
      if (!panel) return;

      isSamplingRef.current = true;
      const startedAt = performance.now();

      const sampleFrame = () => {
        if (!isSamplingRef.current) {
          return;
        }
        const style = window.getComputedStyle(panel);
        const height = style.height;
        const transform = style.transform;
        setComputedPanelHeight(height);
        setComputedPanelTransform(transform);
        pushDebugEvent("rafSample", `height=${height}; transform=${transform}; effectiveStage=${stageRef.current}`);
        rafFrameRef.current = window.requestAnimationFrame(sampleFrame);
      };

      sampleFrame();
      openSampleTimeoutRef.current = window.setTimeout(() => {
        isSamplingRef.current = false;
        if (rafFrameRef.current !== null) {
          window.cancelAnimationFrame(rafFrameRef.current);
          rafFrameRef.current = null;
        }
        pushDebugEvent("rafSample", `stop: ${(performance.now() - startedAt).toFixed(1)}ms`);
      }, 500);

      return () => {
        isSamplingRef.current = false;
        if (openSampleTimeoutRef.current !== null) {
          window.clearTimeout(openSampleTimeoutRef.current);
          openSampleTimeoutRef.current = null;
        }
        if (rafFrameRef.current !== null) {
          window.cancelAnimationFrame(rafFrameRef.current);
          rafFrameRef.current = null;
        }
      };
    }, [debugEnabled, isOpen]);
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
      } else if (deltaY > threshold && stage === "expanded") {
        setStage("peek");
      }

      touchStartY.current = null;
      touchCurrentY.current = null;
    };

    const showPlaceholder = isOpen && !renderedPlace;
    const effectiveStage = stage;
    const sheetHeight = effectiveStage === "expanded" ? `${EXPANDED_HEIGHT}vh` : `${PEEK_HEIGHT}vh`;
    const showDetails = effectiveStage === "expanded";
    const isVisible = isOpen && (Boolean(renderedPlace) || showPlaceholder);

    const handlePanelRef = useCallback((node: HTMLDivElement | null) => {
      panelElementRef.current = node;
      if (!node || !debugEnabled || node === lastPanelNodeRef.current) {
        return;
      }
      lastPanelNodeRef.current = node;

      setPanelMountCount((prev) => {
        const next = prev + 1;
        pushDebugEvent("panelMount", `panelMountCount=${next}`);
        return next;
      });

      const style = window.getComputedStyle(node);
      setComputedPanelHeight(style.height);
      setComputedPanelTransform(style.transform);
    }, [debugEnabled]);

    const debugHud = debugEnabled ? (
      <aside className="cpm-bottom-sheet__debug-hud" aria-hidden>
        <div>isOpen: {String(isOpen)}</div>
        <div>
          stage / effectiveStage: {stage} / {effectiveStage}
        </div>
        <div>showPlaceholder: {String(showPlaceholder)}</div>
        <div>
          renderedPlace?: {String(Boolean(renderedPlace))} / {renderedPlace?.id ?? "-"}
        </div>
        <div>
          place?: {String(Boolean(place))} / {place?.id ?? "-"}
        </div>
        <div>computed height: {computedPanelHeight}</div>
        <div>computed transform: {computedPanelTransform}</div>
        <div>mountCount: {mountCountRef.current}</div>
        <div>panelMountCount: {panelMountCount}</div>
        <div>lastEvent: {debugHistory[debugHistory.length - 1]?.event ?? "-"}</div>
        <ol className="cpm-bottom-sheet__debug-log">
          {debugHistory.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              [t={entry.at.toFixed(1)}] {entry.event} -&gt; {entry.details}
            </li>
          ))}
        </ol>
      </aside>
    ) : null;

    if (!renderedPlace && !isOpen) {
      return debugEnabled ? (
        <div className="cpm-bottom-sheet" ref={ref}>
          {debugHud}
        </div>
      ) : null;
    }

    if (showPlaceholder) {
      const placeholderMessage =
        selectionStatus === "loading"
          ? "Loading place details..."
          : "Place details are unavailable right now.";
      return (
        <div className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`} ref={ref}>
          <div
            className="cpm-bottom-sheet__panel"
            ref={handlePanelRef}
            style={{ height: sheetHeight, transform: `translateY(${isVisible ? "0" : "100%"})` }}
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
            <div className="cpm-bottom-sheet__content" role="presentation">
              <section className="cpm-bottom-sheet__section">
                <div className="cpm-bottom-sheet__section-head">
                  <h3 className="cpm-bottom-sheet__section-title">Status</h3>
                </div>
                <p className="cpm-bottom-sheet__muted">{placeholderMessage}</p>
              </section>
            </div>
          </div>
          {debugHud}
        </div>
      );
    }

    if (!renderedPlace) {
      return null;
    }

    return (
      <div className={`cpm-bottom-sheet ${isVisible ? "open" : ""}`} ref={ref}>
        <div
          className="cpm-bottom-sheet__panel"
          ref={handlePanelRef}
          style={{ height: sheetHeight, transform: `translateY(${isVisible ? "0" : "100%"})` }}
        >
          <div
            className="cpm-bottom-sheet__handle"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={() => setStage((prev) => (prev === "peek" ? "expanded" : "peek"))}
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
        {debugHud}
      </div>
    );
});

MobileBottomSheet.displayName = "MobileBottomSheet";

export default MobileBottomSheet;
