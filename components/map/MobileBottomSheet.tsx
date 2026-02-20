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
type RectSnapshot = {
  top: number;
  height: number;
};

type LayoutSnapshot = {
  innerHeight: number | null;
  visualViewportHeight: number | null;
  mapRect: RectSnapshot | null;
  panelRect: RectSnapshot | null;
  bodyClientHeight: number | null;
  pageRootRect: RectSnapshot | null;
  headerRect: RectSnapshot | null;
};

type DomSizeChange = {
  at: number;
  target: string;
  prev: number | null;
  next: number | null;
};
type InvalidateStats = {
  pendingInvalidate: number;
  requestedLast2s: number;
  executedLast2s: number;
  lastRequestedReason: string;
  lastExecutedReason: string;
  lastExecutedAt: string;
  appVhVar: string;
  appVhUpdatedAt: string;
  appVhUpdatesLast2s: number;
  lastViewportSyncTrigger: string;
  openInvalidateToken: number;
  openInvalidateCanceledCount: number;
  invalidateSuppressedReason: string;
};

type ProbePointType = "center" | "input" | "mapCenter" | "mapSafe1" | "mapSafe2" | "mapSafe3";
type ProbeEntry = {
  timestamp: string;
  trigger: string;
  offset: string;
  pointType: ProbePointType;
  x: number;
  y: number;
  topSummary: string;
};

type OverlayWatchEntry = {
  timestamp: string;
  summary: string;
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
    const panelRef = useRef<HTMLDivElement | null>(null);
    const eventLogRef = useRef<DebugEventEntry[]>([]);
    const [debugHudEnabled, setDebugHudEnabled] = useState(false);
    const debugHudEnabledRef = useRef(false);
    const [debugLogVersion, setDebugLogVersion] = useState(0);
    const [debugEventCategory, setDebugEventCategory] = useState<DebugEventCategory>("ALL");
    const [disableSheetStageInvalidate, setDisableSheetStageInvalidate] = useState(false);
    const [viewportMetrics, setViewportMetrics] = useState<LayoutSnapshot>({
      innerHeight: null,
      visualViewportHeight: null,
      mapRect: null,
      panelRect: null,
      bodyClientHeight: null,
      pageRootRect: null,
      headerRect: null,
    });
    const latestLayoutSnapshotRef = useRef<LayoutSnapshot | null>(null);
    const domSizeChangesRef = useRef<DomSizeChange[]>([]);
    const recentRafCallsRef = useRef<number[]>([]);
    const recentTimeoutCallsRef = useRef<number[]>([]);
    const [jsActivityCounts, setJsActivityCounts] = useState<{ raf500ms: number; timeout500ms: number }>({ raf500ms: 0, timeout500ms: 0 });
    const [sheetLayoutInfo, setSheetLayoutInfo] = useState<{ wrapperPosition: string; panelPosition: string; panelDisplay: string; panelTransform: string; overlayLayout: boolean | null }>({
      wrapperPosition: "n/a",
      panelPosition: "n/a",
      panelDisplay: "n/a",
      panelTransform: "n/a",
      overlayLayout: null,
    });
    const [invalidateStats, setInvalidateStats] = useState<InvalidateStats>({
      pendingInvalidate: 0,
      requestedLast2s: 0,
      executedLast2s: 0,
      lastRequestedReason: "none",
      lastExecutedReason: "none",
      lastExecutedAt: "n/a",
      appVhVar: "n/a",
      appVhUpdatedAt: "n/a",
      appVhUpdatesLast2s: 0,
      lastViewportSyncTrigger: "initial",
      openInvalidateToken: 0,
      openInvalidateCanceledCount: 0,
      invalidateSuppressedReason: "none",
    });
    const lastInputPointRef = useRef<{ x: number; y: number } | null>(null);
    const probeGenerationRef = useRef(0);
    const markerProbeGenerationRef = useRef(0);
    const probeTimeoutsRef = useRef<number[]>([]);
    const probeRafRef = useRef<number | null>(null);
    const [probeEntries, setProbeEntries] = useState<ProbeEntry[]>([]);
    const [overlayWatchEntries, setOverlayWatchEntries] = useState<OverlayWatchEntry[]>([]);
    const filterOverlaySelectorRef = useRef<string>("unidentified");
    const filterOverlayElRef = useRef<HTMLElement | null>(null);
    const overlayLastTriggerRef = useRef<string>("none");
    const overlayPrevClassListRef = useRef<string[]>([]);
    const overlayWatchGenerationRef = useRef(0);
    const overlayWatchTimeoutsRef = useRef<number[]>([]);
    const overlayWatchRafRef = useRef<number | null>(null);

    const parseColor = (value: string): { r: number; g: number; b: number; a: number } | null => {
      const trimmed = value.trim().toLowerCase();
      if (!trimmed || trimmed === "transparent") return null;
      const rgba = trimmed.match(/rgba?\(([^)]+)\)/);
      if (rgba) {
        const parts = rgba[1].split(",").map((part) => Number(part.trim()));
        if (parts.length >= 3) {
          return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
        }
      }
      if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        const expanded =
          hex.length === 3
            ? hex
                .split("")
                .map((char) => `${char}${char}`)
                .join("")
            : hex;
        if (expanded.length === 6) {
          return {
            r: parseInt(expanded.slice(0, 2), 16),
            g: parseInt(expanded.slice(2, 4), 16),
            b: parseInt(expanded.slice(4, 6), 16),
            a: 1,
          };
        }
      }
      return null;
    };

    const shortSelector = (element: Element | null): string => {
      if (!element) return "none";
      const el = element as HTMLElement;
      if (el.id) return `#${el.id}`;
      const classes = (el.className || "").toString().split(" ").filter(Boolean).slice(0, 3);
      return `${el.tagName.toLowerCase()}${classes.length ? `.${classes.join(".")}` : ""}`;
    };

    const appendOverlayWatch = (summary: string) => {
      const timestamp = new Date().toISOString();
      setOverlayWatchEntries((current) => [...current, { timestamp, summary }].slice(-60));
      pushDebugEvent(`[overlay-watch] ${summary}`);
    };

    const getClassDiff = (next: string[]) => {
      const prev = overlayPrevClassListRef.current;
      const added = next.filter((item) => !prev.includes(item));
      const removed = prev.filter((item) => !next.includes(item));
      overlayPrevClassListRef.current = next;
      return {
        added,
        removed,
      };
    };

    const ensureFilterOverlayTarget = (source: string) => {
      const candidateSelectors = [
        ".cpm-map-mobile-filters__backdrop",
        ".cpm-bottom-sheet__backdrop",
        ".cpm-map-mobile-filters",
      ];
      const scored = candidateSelectors
        .map((selector) => {
          const element = document.querySelector(selector) as HTMLElement | null;
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          const computed = window.getComputedStyle(element);
          const covers = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
          const opacity = Number(computed.opacity || "0") || 0;
          const bg = computed.backgroundColor;
          const dark = bg.includes("0, 0, 0") || bg.includes("10, 10, 10");
          const score = (covers ? 3 : 0) + (opacity > 0.05 ? 2 : 0) + (dark ? 1 : 0);
          return {
            selector,
            element,
            score,
            covers,
            opacity,
            bg,
            zIndex: computed.zIndex,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const selected = scored[0];
        filterOverlaySelectorRef.current = selected.selector;
        filterOverlayElRef.current = selected.element;
        appendOverlayWatch(
          `identify source=${source} selected=${selected.selector} covers=${String(selected.covers)} op=${selected.opacity} bg=${selected.bg} z=${selected.zIndex} candidates=${scored
            .map((item) => `${item.selector}:${item.score}`)
            .join(",")}`,
        );
      } else {
        appendOverlayWatch(`identify source=${source} selected=none candidates=0`);
      }
    };

    const dumpOverlayState = (trigger: string, offset: string) => {
      const target = filterOverlayElRef.current;
      if (!target || !target.isConnected) {
        appendOverlayWatch(
          `${trigger} +${offset} exists=false selector=${filterOverlaySelectorRef.current} lastTrigger=${overlayLastTriggerRef.current}`,
        );
        return;
      }
      const computed = window.getComputedStyle(target);
      const rect = target.getBoundingClientRect();
      const covers = rect.width >= window.innerWidth * 0.9 && rect.height >= window.innerHeight * 0.9;
      const classes = Array.from(target.classList).slice(0, 8);
      const classDiff = getClassDiff(classes);
      appendOverlayWatch(
        `${trigger} +${offset} exists=true selector=${filterOverlaySelectorRef.current} op=${computed.opacity} bg=${computed.backgroundColor} display=${computed.display} visibility=${computed.visibility} pointer=${computed.pointerEvents} z=${computed.zIndex} covers=${String(covers)} rect=${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)} classDiff=+${classDiff.added.join("|") || "-"}/-${classDiff.removed.join("|") || "-"}`,
      );
    };

    const scheduleOverlayWatch = (trigger: string) => {
      overlayLastTriggerRef.current = trigger;
      const generation = overlayWatchGenerationRef.current + 1;
      overlayWatchGenerationRef.current = generation;
      overlayWatchTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      overlayWatchTimeoutsRef.current = [];
      if (overlayWatchRafRef.current !== null) {
        window.cancelAnimationFrame(overlayWatchRafRef.current);
        overlayWatchRafRef.current = null;
      }

      dumpOverlayState(trigger, "0ms");
      overlayWatchRafRef.current = window.requestAnimationFrame(() => {
        if (overlayWatchGenerationRef.current !== generation) return;
        dumpOverlayState(trigger, "rAF");
      });
      [50, 150].forEach((delay) => {
        const id = window.setTimeout(() => {
          if (overlayWatchGenerationRef.current !== generation) return;
          dumpOverlayState(trigger, `${delay}ms`);
        }, delay);
        overlayWatchTimeoutsRef.current.push(id);
      });
    };

    const attachOverlayTransitionWatch = () => {
      const target = filterOverlayElRef.current;
      if (!target) return () => undefined;
      const onTransitionStart = (event: Event) => {
        const transitionEvent = event as TransitionEvent;
        appendOverlayWatch(
          `transitionstart property=${transitionEvent.propertyName || "n/a"} lastTrigger=${overlayLastTriggerRef.current}`,
        );
      };
      const onTransitionEnd = (event: Event) => {
        const transitionEvent = event as TransitionEvent;
        appendOverlayWatch(
          `transitionend property=${transitionEvent.propertyName || "n/a"} lastTrigger=${overlayLastTriggerRef.current}`,
        );
      };
      target.addEventListener("transitionstart", onTransitionStart);
      target.addEventListener("transitionend", onTransitionEnd);
      return () => {
        target.removeEventListener("transitionstart", onTransitionStart);
        target.removeEventListener("transitionend", onTransitionEnd);
      };
    };

    const runProbeSample = (
      trigger: string,
      offset: string,
      pointType: ProbePointType,
      x: number,
      y: number,
    ) => {
      const clampedX = Math.max(0, Math.min(window.innerWidth - 1, Math.round(x)));
      const clampedY = Math.max(0, Math.min(window.innerHeight - 1, Math.round(y)));
      const top = document.elementFromPoint(clampedX, clampedY) as HTMLElement | null;
      const computed = top ? window.getComputedStyle(top) : null;
      const rect = top?.getBoundingClientRect() ?? null;
      const rectWidth = rect?.width ?? 0;
      const rectHeight = rect?.height ?? 0;
      const coversViewport =
        Boolean(rect) &&
        rectWidth >= window.innerWidth * 0.9 &&
        rectHeight >= window.innerHeight * 0.9;
      const color = parseColor(computed?.backgroundColor ?? "");
      const luminance =
        color !== null ? (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255 : 1;
      const darkScore = Math.max(0, Math.min(1, 1 - luminance));
      const opacity = Number(computed?.opacity ?? "1") || 1;
      const effectiveDarkScore = Number((darkScore * Math.min(1, Math.max(0, opacity))).toFixed(2));
      const parentLines: string[] = [];
      let parent: HTMLElement | null = top?.parentElement ?? null;
      for (let depth = 1; depth <= 3 && parent; depth += 1) {
        const parentComputed = window.getComputedStyle(parent);
        parentLines.push(
          `p${depth}=${shortSelector(parent)} pos=${parentComputed.position} z=${parentComputed.zIndex} op=${parentComputed.opacity} bg=${parentComputed.backgroundColor} flt=${parentComputed.filter} bdf=${parentComputed.backdropFilter}`,
        );
        parent = parent.parentElement;
      }

      const summary =
        `${trigger} +${offset} ${pointType} top=${shortSelector(top)} ` +
        `z=${computed?.zIndex ?? "n/a"} op=${computed?.opacity ?? "n/a"} bg=${computed?.backgroundColor ?? "n/a"} ` +
        `bdf=${computed?.backdropFilter ?? "none"} flt=${computed?.filter ?? "none"} ` +
        `covers=${String(coversViewport)} score=${effectiveDarkScore}`;
      const detail =
        `${summary} x=${clampedX},y=${clampedY} rect=${
          rect
            ? `${Math.round(rect.left)},${Math.round(rect.top)},${Math.round(rect.width)}x${Math.round(rect.height)}`
            : "n/a"
        } display=${computed?.display ?? "n/a"} visibility=${computed?.visibility ?? "n/a"} pointer=${computed?.pointerEvents ?? "n/a"} mix=${computed?.mixBlendMode ?? "n/a"} transform=${computed?.transform ?? "n/a"} ${parentLines.join(" | ")}`;

      const timestamp = new Date().toISOString();
      setProbeEntries((current) => [
        ...current,
        { timestamp, trigger, offset, pointType, x: clampedX, y: clampedY, topSummary: summary },
      ].slice(-60));
      pushDebugEvent(`[probe] ${detail}`);
    };

    const triggerDarkFlashProbe = (
      trigger: string,
      inputPoint?: { x: number; y: number } | null,
    ) => {
      if (typeof window === "undefined") return;
      const isMarkerSelectTrigger = trigger.includes("markerSelect");
      const generation = isMarkerSelectTrigger
        ? markerProbeGenerationRef.current + 1
        : probeGenerationRef.current + 1;
      if (isMarkerSelectTrigger) {
        markerProbeGenerationRef.current = generation;
      } else {
        probeGenerationRef.current = generation;
        probeTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        probeTimeoutsRef.current = [];
        if (probeRafRef.current !== null) {
          window.cancelAnimationFrame(probeRafRef.current);
          probeRafRef.current = null;
        }
      }

      const mapRect = document.getElementById("map")?.getBoundingClientRect() ?? null;
      const points: Array<{ type: ProbePointType; x: number; y: number }> = [
        { type: "center", x: window.innerWidth / 2, y: window.innerHeight / 2 },
        {
          type: "mapCenter",
          x: mapRect ? mapRect.left + mapRect.width / 2 : window.innerWidth / 2,
          y: mapRect ? mapRect.top + mapRect.height / 2 : window.innerHeight / 2,
        },
        {
          type: "mapSafe1",
          x: mapRect ? mapRect.left + mapRect.width * 0.5 : window.innerWidth / 2,
          y: mapRect ? mapRect.top + mapRect.height * 0.35 : window.innerHeight * 0.35,
        },
        {
          type: "mapSafe2",
          x: mapRect ? mapRect.left + mapRect.width * 0.2 : window.innerWidth * 0.2,
          y: mapRect ? mapRect.top + mapRect.height * 0.2 : window.innerHeight * 0.2,
        },
        {
          type: "mapSafe3",
          x: mapRect ? mapRect.left + mapRect.width * 0.8 : window.innerWidth * 0.8,
          y: mapRect ? mapRect.top + mapRect.height * 0.2 : window.innerHeight * 0.2,
        },
      ];
      const effectiveInputPoint = inputPoint ?? lastInputPointRef.current;
      if (effectiveInputPoint) {
        points.push({ type: "input", x: effectiveInputPoint.x, y: effectiveInputPoint.y });
      }

      points.forEach((point) => runProbeSample(trigger, "0ms", point.type, point.x, point.y));

      probeRafRef.current = window.requestAnimationFrame(() => {
        if (!isMarkerSelectTrigger && probeGenerationRef.current !== generation) return;
        if (isMarkerSelectTrigger && markerProbeGenerationRef.current !== generation) return;
        points.forEach((point) => runProbeSample(trigger, "rAF", point.type, point.x, point.y));
      });

      [50, 150, 300].forEach((delay) => {
        const timeoutId = window.setTimeout(() => {
          if (!isMarkerSelectTrigger && probeGenerationRef.current !== generation) return;
          if (isMarkerSelectTrigger && markerProbeGenerationRef.current !== generation) return;
          points.forEach((point) => runProbeSample(trigger, `${delay}ms`, point.type, point.x, point.y));
        }, delay);
        if (!isMarkerSelectTrigger) {
          probeTimeoutsRef.current.push(timeoutId);
        }
      });
    };

    const pushDebugEvent = (entry: string, broadcast = true) => {
      if (!debugHudEnabledRef.current) {
        if (broadcast && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cpm-debug-event", { detail: { source: "sheet", entry } }));
        }
        return;
      }
      const timestamp = new Date().toISOString();
      eventLogRef.current = [...eventLogRef.current, { timestamp, entry }].slice(-200);
      setDebugLogVersion((value) => value + 1);
      if (broadcast && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cpm-debug-event", { detail: { source: "sheet", entry } }));
      }
    };

    const markInput = (
      scope: "root" | "handle",
      eventName: "pointerdown" | "pointerup" | "click" | "touchstart" | "touchend",
      point?: { x: number; y: number } | null,
    ) => {
      lastInputAtRef.current = Date.now();
      if (point) {
        lastInputPointRef.current = point;
      }
      pushDebugEvent(`[input:${scope}] ${eventName}`);
      if (eventName === "pointerdown" || eventName === "click" || eventName === "touchstart") {
        triggerDarkFlashProbe(`input:${scope}:${eventName}`, point);
      }
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
      const key = "cpm_debug";
      const disableKey = "cpm_disableSheetStageInvalidate";
      const isDebugEnabled = () =>
        window.localStorage.getItem(key) === "1" || window.location.hash.includes("debug");
      const update = () => {
        const enabled = isDebugEnabled();
        setDebugHudEnabled(enabled);
        debugHudEnabledRef.current = enabled;
        setDisableSheetStageInvalidate(window.localStorage.getItem(disableKey) === "1");
      };
      const formatRect = (rect: RectSnapshot | null) =>
        rect ? `top=${rect.top},h=${rect.height}` : "n/a";

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

          if (
            detail.entry.startsWith("[map] click") ||
            detail.entry.startsWith("[map] markerSelect") ||
            detail.entry.includes("invalidate REQUEST") ||
            detail.entry.includes("invalidate EXEC")
          ) {
            triggerDarkFlashProbe(`map:${detail.entry.replace(/^\[map\]\s*/, "")}`);
          }
          if (detail.entry.startsWith("[map] markerSelect")) {
            scheduleOverlayWatch(`markerSelect:${detail.entry.replace(/^\[map\]\s*/, "")}`);
          }
          if (
            detail.entry.includes("invalidate REQUEST reason=open") ||
            detail.entry.includes("invalidate REQUEST reason=sheetStageChange") ||
            detail.entry.includes("invalidate EXEC reason=open") ||
            detail.entry.includes("invalidate EXEC reason=sheetStageChange")
          ) {
            scheduleOverlayWatch(`invalidate:${detail.entry.replace(/^\[map\]\s*/, "")}`);
          }
          if (detail.entry.includes("filtersOpen changed next=true")) {
            ensureFilterOverlayTarget("filtersOpen:true");
            const detach = attachOverlayTransitionWatch();
            const detachId = window.setTimeout(() => {
              detach();
            }, 2500);
            overlayWatchTimeoutsRef.current.push(detachId);
            scheduleOverlayWatch("filtersOpen:true");
          }
          if (detail.entry.includes("filtersOpen changed next=false")) {
            scheduleOverlayWatch("filtersOpen:false");
          }

          if (detail.entry.startsWith("[map] resize")) {
            const before = latestLayoutSnapshotRef.current;
            const mapElement = document.getElementById("map");
            const mapRect = mapElement ? mapElement.getBoundingClientRect() : null;
            const panelRect = panelRef.current?.getBoundingClientRect() ?? null;
            const pageRoot = document.querySelector(".cpm-map-root") as HTMLElement | null;
            const pageRootRect = pageRoot?.getBoundingClientRect() ?? null;
            const header = document.querySelector("header") as HTMLElement | null;
            const headerRect = header?.getBoundingClientRect() ?? null;
            const after: LayoutSnapshot = {
              innerHeight: window.innerHeight,
              visualViewportHeight: window.visualViewport
                ? Math.round(window.visualViewport.height)
                : null,
              mapRect: mapRect ? { top: Math.round(mapRect.top), height: Math.round(mapRect.height) } : null,
              panelRect: panelRect
                ? { top: Math.round(panelRect.top), height: Math.round(panelRect.height) }
                : null,
              bodyClientHeight: document.body?.clientHeight ?? null,
              pageRootRect: pageRootRect
                ? { top: Math.round(pageRootRect.top), height: Math.round(pageRootRect.height) }
                : null,
              headerRect: headerRect
                ? { top: Math.round(headerRect.top), height: Math.round(headerRect.height) }
                : null,
            };
            latestLayoutSnapshotRef.current = after;

            const now = Date.now();
            const recentDomChanges = domSizeChangesRef.current
              .filter((change) => now - change.at <= 200)
              .map((change) => `${change.target}:${change.prev ?? "n/a"}->${change.next ?? "n/a"}`)
              .join(" | ");
            const recentInputs = eventLogRef.current
              .filter(
                (entryItem) =>
                  entryItem.entry.startsWith("[input:") &&
                  now - new Date(entryItem.timestamp).getTime() <= 200,
              )
              .map((entryItem) => entryItem.entry)
              .join(" | ");

            pushDebugEvent(
              `[map] resize snapshot before(inner=${before?.innerHeight ?? "n/a"},vv=${before?.visualViewportHeight ?? "n/a"},map=${formatRect(before?.mapRect ?? null)},panel=${formatRect(before?.panelRect ?? null)},body=${before?.bodyClientHeight ?? "n/a"},root=${formatRect(before?.pageRootRect ?? null)},header=${formatRect(before?.headerRect ?? null)}) after(inner=${after.innerHeight ?? "n/a"},vv=${after.visualViewportHeight ?? "n/a"},map=${formatRect(after.mapRect)},panel=${formatRect(after.panelRect)},body=${after.bodyClientHeight ?? "n/a"},root=${formatRect(after.pageRootRect)},header=${formatRect(after.headerRect)}) recentDom200ms=${recentDomChanges || "none"} recentInput200ms=${recentInputs || "none"} js500ms=raf:${jsActivityCounts.raf500ms},timeout:${jsActivityCounts.timeout500ms}`,
              false,
            );
          }
        }
      };
      update();
      const onInvalidateStats = (event: Event) => {
        const detail = (event as CustomEvent<Partial<InvalidateStats>>).detail;
        if (!detail || typeof detail !== "object") return;
        setInvalidateStats((current) => ({
          pendingInvalidate:
            typeof detail.pendingInvalidate === "number" ? detail.pendingInvalidate : current.pendingInvalidate,
          requestedLast2s:
            typeof detail.requestedLast2s === "number" ? detail.requestedLast2s : current.requestedLast2s,
          executedLast2s:
            typeof detail.executedLast2s === "number" ? detail.executedLast2s : current.executedLast2s,
          lastRequestedReason:
            typeof detail.lastRequestedReason === "string"
              ? detail.lastRequestedReason
              : current.lastRequestedReason,
          lastExecutedReason:
            typeof detail.lastExecutedReason === "string"
              ? detail.lastExecutedReason
              : current.lastExecutedReason,
          lastExecutedAt:
            typeof detail.lastExecutedAt === "string" ? detail.lastExecutedAt : current.lastExecutedAt,
          appVhVar: typeof detail.appVhVar === "string" ? detail.appVhVar : current.appVhVar,
          appVhUpdatedAt:
            typeof detail.appVhUpdatedAt === "string"
              ? detail.appVhUpdatedAt
              : current.appVhUpdatedAt,
          appVhUpdatesLast2s:
            typeof detail.appVhUpdatesLast2s === "number"
              ? detail.appVhUpdatesLast2s
              : current.appVhUpdatesLast2s,
          lastViewportSyncTrigger:
            typeof detail.lastViewportSyncTrigger === "string"
              ? detail.lastViewportSyncTrigger
              : current.lastViewportSyncTrigger,
          openInvalidateToken:
            typeof detail.openInvalidateToken === "number"
              ? detail.openInvalidateToken
              : current.openInvalidateToken,
          openInvalidateCanceledCount:
            typeof detail.openInvalidateCanceledCount === "number"
              ? detail.openInvalidateCanceledCount
              : current.openInvalidateCanceledCount,
          invalidateSuppressedReason:
            typeof detail.invalidateSuppressedReason === "string"
              ? detail.invalidateSuppressedReason
              : current.invalidateSuppressedReason,
        }));
      };

      window.addEventListener("storage", update);
      window.addEventListener("hashchange", update);
      window.addEventListener("cpm-debug-changed", update as EventListener);
      window.addEventListener("cpm-debug-event", onExternalDebugEvent as EventListener);
      window.addEventListener("cpm-map-invalidate-stats", onInvalidateStats as EventListener);
      return () => {
        window.removeEventListener("storage", update);
        window.removeEventListener("hashchange", update);
        window.removeEventListener("cpm-debug-changed", update as EventListener);
        window.removeEventListener("cpm-debug-event", onExternalDebugEvent as EventListener);
        window.removeEventListener("cpm-map-invalidate-stats", onInvalidateStats as EventListener);
      };
    }, []);

    useEffect(() => {
      if (typeof window === "undefined") return;

      const buildSnapshot = (): LayoutSnapshot => {
        const mapElement = document.getElementById("map");
        const mapRect = mapElement?.getBoundingClientRect() ?? null;
        const panelRect = panelRef.current?.getBoundingClientRect() ?? null;
        const pageRoot = document.querySelector(".cpm-map-root") as HTMLElement | null;
        const pageRootRect = pageRoot?.getBoundingClientRect() ?? null;
        const header = document.querySelector("header") as HTMLElement | null;
        const headerRect = header?.getBoundingClientRect() ?? null;

        return {
          innerHeight: window.innerHeight,
          visualViewportHeight: window.visualViewport
            ? Math.round(window.visualViewport.height)
            : null,
          mapRect: mapRect ? { top: Math.round(mapRect.top), height: Math.round(mapRect.height) } : null,
          panelRect: panelRect
            ? { top: Math.round(panelRect.top), height: Math.round(panelRect.height) }
            : null,
          bodyClientHeight: document.body?.clientHeight ?? null,
          pageRootRect: pageRootRect
            ? { top: Math.round(pageRootRect.top), height: Math.round(pageRootRect.height) }
            : null,
          headerRect: headerRect
            ? { top: Math.round(headerRect.top), height: Math.round(headerRect.height) }
            : null,
        };
      };

      const elementMetaCache = new Map<string, string>();
      const getElementMeta = (element: Element | null) => {
        if (!element) return "missing";
        const el = element as HTMLElement;
        const computed = window.getComputedStyle(el);
        const parentTag = el.parentElement ? `${el.parentElement.tagName.toLowerCase()}${el.parentElement.className ? `.${el.parentElement.className.toString().split(" ").filter(Boolean).join(".")}` : ""}` : "none";
        const offsetParentTag = el.offsetParent ? (el.offsetParent as HTMLElement).tagName.toLowerCase() : "none";
        return [
          `id=${el.id || "none"}`,
          `class=${el.className || "none"}`,
          `inline=${el.getAttribute("style") || "none"}`,
          `height=${computed.height}`,
          `minHeight=${computed.minHeight}`,
          `maxHeight=${computed.maxHeight}`,
          `position=${computed.position}`,
          `display=${computed.display}`,
          `overflow=${computed.overflow}`,
          `top=${computed.top}`,
          `bottom=${computed.bottom}`,
          `transform=${computed.transform}`,
          `var(--vh)=${computed.getPropertyValue("--vh").trim() || "n/a"}`,
          `var(--dvh)=${computed.getPropertyValue("--dvh").trim() || "n/a"}`,
          `var(--header-h)=${computed.getPropertyValue("--header-h").trim() || "n/a"}`,
          `var(--safe-bottom)=${computed.getPropertyValue("--safe-bottom").trim() || "n/a"}`,
          `offsetParent=${offsetParentTag}`,
          `parent=${parentTag}`,
        ].join(";");
      };

      const registerDomChange = (target: string, element: Element | null, prev: number | null, next: number | null) => {
        const nextEntry: DomSizeChange = { at: Date.now(), target, prev, next };
        domSizeChangesRef.current = [...domSizeChangesRef.current, nextEntry].slice(-80);
        const nextMeta = getElementMeta(element);
        const prevMeta = elementMetaCache.get(target) ?? "none";
        elementMetaCache.set(target, nextMeta);
        pushDebugEvent(
          `[dom-size] target=${target} prev=${prev ?? "n/a"} next=${next ?? "n/a"} prevMeta={${prevMeta}} nextMeta={${nextMeta}}`,
          false,
        );
        triggerDarkFlashProbe(`dom-size:${target}`);
      };

      const syncMetrics = () => {
        const snapshot = buildSnapshot();
        latestLayoutSnapshotRef.current = snapshot;
        setViewportMetrics(snapshot);

        const wrapper = panelRef.current?.closest(".cpm-bottom-sheet") as HTMLElement | null;
        const wrapperComputed = wrapper ? window.getComputedStyle(wrapper) : null;
        const panelComputed = panelRef.current ? window.getComputedStyle(panelRef.current) : null;
        const wrapperPosition = wrapperComputed?.position ?? "n/a";
        const panelPosition = panelComputed?.position ?? "n/a";
        const panelDisplay = panelComputed?.display ?? "n/a";
        const panelTransformValue = panelComputed?.transform ?? "n/a";
        const overlayLayout = wrapperComputed ? wrapperComputed.position === "fixed" : null;
        setSheetLayoutInfo({
          wrapperPosition,
          panelPosition,
          panelDisplay,
          panelTransform: panelTransformValue,
          overlayLayout,
        });
      };

      const observers: ResizeObserver[] = [];
      const observeElement = (target: Element | null, name: string, getHeight: () => number | null) => {
        if (!target) return;
        let prevHeight = getHeight();
        const observer = new ResizeObserver(() => {
          const nextHeight = getHeight();
          if (nextHeight !== prevHeight) {
            registerDomChange(name, target, prevHeight, nextHeight);
            prevHeight = nextHeight;
            syncMetrics();
          }
        });
        observer.observe(target);
        observers.push(observer);
      };

      const mapElement = document.getElementById("map");
      observeElement(mapElement?.parentElement ?? null, "map-parent", () => {
        if (!mapElement?.parentElement) return null;
        return Math.round(mapElement.parentElement.getBoundingClientRect().height);
      });
      observeElement(panelRef.current, "sheet-panel", () =>
        panelRef.current ? Math.round(panelRef.current.getBoundingClientRect().height) : null,
      );
      const pageRoot = document.querySelector(".cpm-map-root");
      observeElement(pageRoot, "page-root", () =>
        pageRoot ? Math.round((pageRoot as HTMLElement).getBoundingClientRect().height) : null,
      );
      const header = document.querySelector("header");
      observeElement(header, "header", () =>
        header ? Math.round((header as HTMLElement).getBoundingClientRect().height) : null,
      );

      const onResize = () => syncMetrics();
      syncMetrics();
      window.addEventListener("resize", onResize);
      window.visualViewport?.addEventListener("resize", onResize);
      const interval = window.setInterval(syncMetrics, 500);
      return () => {
        observers.forEach((observer) => observer.disconnect());
        window.clearInterval(interval);
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        probeTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        probeTimeoutsRef.current = [];
        if (probeRafRef.current !== null) {
          window.cancelAnimationFrame(probeRafRef.current);
          probeRafRef.current = null;
        }
        overlayWatchTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
        overlayWatchTimeoutsRef.current = [];
        if (overlayWatchRafRef.current !== null) {
          window.cancelAnimationFrame(overlayWatchRafRef.current);
          overlayWatchRafRef.current = null;
        }
      };
    }, [debugLogVersion, isOpen, stage]);

    const toggleDisableSheetInvalidate = () => {
      if (typeof window === "undefined") return;
      const key = "cpm_disableSheetStageInvalidate";
      const nextValue = disableSheetStageInvalidate ? "0" : "1";
      window.localStorage.setItem(key, nextValue);
      setDisableSheetStageInvalidate(nextValue === "1");
      window.dispatchEvent(new CustomEvent("cpm-sheet-invalidate-toggle", { detail: nextValue }));
      pushDebugEvent(`[hud] disableSheetStageInvalidate=${nextValue}`);
    };

    useEffect(() => {
      if (typeof window === "undefined") return;
      if (process.env.NODE_ENV === "production") return;
      if (!debugHudEnabled) return;

      const originalRaf = window.requestAnimationFrame.bind(window);
      const originalSetTimeout = window.setTimeout.bind(window);

      const patchedRaf: typeof window.requestAnimationFrame = (callback) => {
        recentRafCallsRef.current = [...recentRafCallsRef.current, Date.now()].slice(-120);
        return originalRaf(callback);
      };

      const patchedSetTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
        recentTimeoutCallsRef.current = [...recentTimeoutCallsRef.current, Date.now()].slice(-120);
        return originalSetTimeout(handler, timeout, ...args);
      }) as typeof window.setTimeout;

      (window as Window & { requestAnimationFrame: typeof window.requestAnimationFrame }).requestAnimationFrame = patchedRaf;
      (window as Window & { setTimeout: typeof window.setTimeout }).setTimeout = patchedSetTimeout;

      const activityTimer = originalSetTimeout(function tick() {
        const now = Date.now();
        const raf500ms = recentRafCallsRef.current.filter((at) => now - at <= 500).length;
        const timeout500ms = recentTimeoutCallsRef.current.filter((at) => now - at <= 500).length;
        setJsActivityCounts({ raf500ms, timeout500ms });
        originalSetTimeout(tick, 300);
      }, 300);

      return () => {
        (window as Window & { requestAnimationFrame: typeof window.requestAnimationFrame }).requestAnimationFrame = originalRaf;
        (window as Window & { setTimeout: typeof window.setTimeout }).setTimeout = originalSetTimeout;
        window.clearTimeout(activityTimer);
      };
    }, [debugHudEnabled]);

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
        triggerDarkFlashProbe("sheet:open");
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
      triggerDarkFlashProbe(`sheet:stage-change:${stage}`);
    }, [stage]);

    useEffect(() => {
      const now = Date.now();
      const recentInput = lastInputAtRef.current !== null && now - lastInputAtRef.current <= 200;
      pushDebugEvent(
        `[renderedPlace-set] ${renderedPlace ? renderedPlace.id : "null"} reason=${renderedPlaceReasonRef.current} recentInput200ms=${recentInput}`,
      );
      if (renderedPlaceReasonRef.current === "openFromPlaceProp") {
        scheduleOverlayWatch("renderedPlace-set:openFromPlaceProp");
      }
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
      const point = {
        x: event.touches[0]?.clientX ?? window.innerWidth / 2,
        y: event.touches[0]?.clientY ?? window.innerHeight / 2,
      };
      markInput("handle", "touchstart", point);
      touchStartY.current = event.touches[0]?.clientY ?? null;
      touchCurrentY.current = touchStartY.current;
    };

    const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
      touchCurrentY.current = event.touches[0]?.clientY ?? null;
    };

    const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
      const point = event.changedTouches[0]
        ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
        : null;
      markInput("handle", "touchend", point);
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

    const handleSheetRootPointerDown = (event: React.PointerEvent<HTMLDivElement>) =>
      markInput("root", "pointerdown", { x: event.clientX, y: event.clientY });
    const handleSheetRootPointerUp = (event: React.PointerEvent<HTMLDivElement>) =>
      markInput("root", "pointerup", { x: event.clientX, y: event.clientY });
    const handleSheetRootClick = (event: React.MouseEvent<HTMLDivElement>) =>
      markInput("root", "click", { x: event.clientX, y: event.clientY });
    const handleSheetRootTouchStart = (event: React.TouchEvent<HTMLDivElement>) =>
      markInput("root", "touchstart", {
        x: event.touches[0]?.clientX ?? window.innerWidth / 2,
        y: event.touches[0]?.clientY ?? window.innerHeight / 2,
      });
    const handleSheetRootTouchEnd = (event: React.TouchEvent<HTMLDivElement>) =>
      markInput(
        "root",
        "touchend",
        event.changedTouches[0]
          ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
          : null,
      );

    const handleGripPointerDown = (event: React.PointerEvent<HTMLDivElement>) =>
      markInput("handle", "pointerdown", { x: event.clientX, y: event.clientY });
    const handleGripPointerUp = (event: React.PointerEvent<HTMLDivElement>) =>
      markInput("handle", "pointerup", { x: event.clientX, y: event.clientY });
    const handleGripClick = (event: React.MouseEvent<HTMLDivElement>) => {
      markInput("handle", "click", { x: event.clientX, y: event.clientY });
      setStageWithReason(stage === "peek" ? "expanded" : "peek", "handleTap");
    };

    if (!renderedPlace && !isOpen) {
      return null;
    }

    const showPlaceholder = isOpen && !renderedPlace;
    const effectiveStage = stage;
    const sheetHeight = `${EXPANDED_HEIGHT}vh`;
    const showDetails = effectiveStage === "expanded";
    const isVisible = isOpen && (Boolean(renderedPlace) || showPlaceholder);

    const panelHeightPx =
      typeof window !== "undefined"
        ? Math.round((window.innerHeight * EXPANDED_HEIGHT) / 100)
        : null;
    const peekOffset = `calc(${EXPANDED_HEIGHT}vh - ${PEEK_HEIGHT}vh)`;
    const panelTransform = !isVisible
      ? "translateY(100%)"
      : effectiveStage === "expanded"
        ? "translateY(0)"
        : `translateY(${peekOffset})`;

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
    const resizeEvents = categorizedEvents.filter((eventItem) => eventItem.entry.startsWith("[map] resize"));
    const resizeEventTimestamps = resizeEvents.slice(-10).map((eventItem) => eventItem.timestamp);

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
        <div>window.innerHeight: {viewportMetrics.innerHeight ?? "n/a"}</div>
        <div>visualViewport.height: {viewportMetrics.visualViewportHeight ?? "n/a"}</div>
        <div>map rect: {viewportMetrics.mapRect ? `top=${viewportMetrics.mapRect.top}, h=${viewportMetrics.mapRect.height}` : "n/a"}</div>
        <div>panel rect: {viewportMetrics.panelRect ? `top=${viewportMetrics.panelRect.top}, h=${viewportMetrics.panelRect.height}` : "n/a"}</div>
        <div>document.body.clientHeight: {viewportMetrics.bodyClientHeight ?? "n/a"}</div>
        <div>page root rect: {viewportMetrics.pageRootRect ? `top=${viewportMetrics.pageRootRect.top}, h=${viewportMetrics.pageRootRect.height}` : "n/a"}</div>
        <div>header rect: {viewportMetrics.headerRect ? `top=${viewportMetrics.headerRect.top}, h=${viewportMetrics.headerRect.height}` : "n/a"}</div>
        <div>leaflet resize count: {resizeEvents.length}</div>
        <div>leaflet resize timestamps: {resizeEventTimestamps.join(", ") || "none"}</div>
        <div>pendingInvalidate: {invalidateStats.pendingInvalidate}</div>
        <div>requested(last2s): {invalidateStats.requestedLast2s}</div>
        <div>executed(last2s): {invalidateStats.executedLast2s}</div>
        <div>lastRequestedReason: {invalidateStats.lastRequestedReason}</div>
        <div>lastExecutedReason: {invalidateStats.lastExecutedReason}</div>
        <div>lastExecutedAt: {invalidateStats.lastExecutedAt}</div>
        <div>appVhVar: {invalidateStats.appVhVar}</div>
        <div>appVhUpdatedAt: {invalidateStats.appVhUpdatedAt}</div>
        <div>appVhUpdates(last2s): {invalidateStats.appVhUpdatesLast2s}</div>
        <div>lastViewportSyncTrigger: {invalidateStats.lastViewportSyncTrigger}</div>
        <div>openInvalidateToken: {invalidateStats.openInvalidateToken}</div>
        <div>openInvalidateCanceledCount: {invalidateStats.openInvalidateCanceledCount}</div>
        <div>invalidateSuppressedReason: {invalidateStats.invalidateSuppressedReason}</div>
        <div style={{ marginTop: "6px", fontWeight: 700 }}>dark flash probe (latest 60)</div>
        {probeEntries.length === 0 ? (
          <div>none</div>
        ) : (
          probeEntries
            .slice()
            .reverse()
            .map((probe, index) => (
              <div key={`${probe.timestamp}-${probe.pointType}-${index}`}>
                {probe.timestamp.split("T")[1]?.replace("Z", "") ?? probe.timestamp} {probe.topSummary}
              </div>
            ))
        )}
        <div style={{ marginTop: "6px", fontWeight: 700 }}>filter overlay watch (latest 60)</div>
        {overlayWatchEntries.length === 0 ? (
          <div>none</div>
        ) : (
          overlayWatchEntries
            .slice()
            .reverse()
            .map((item, index) => (
              <div key={`${item.timestamp}-${index}`}>
                {item.timestamp.split("T")[1]?.replace("Z", "") ?? item.timestamp} {item.summary}
              </div>
            ))
        )}
        <div>js activity(500ms): raf={jsActivityCounts.raf500ms}, timeout={jsActivityCounts.timeout500ms}</div>
        <div>sheet wrapper position: {sheetLayoutInfo.wrapperPosition}</div>
        <div>sheet panel position/display: {sheetLayoutInfo.panelPosition} / {sheetLayoutInfo.panelDisplay}</div>
        <div>sheet panel computed transform: {sheetLayoutInfo.panelTransform}</div>
        <div>sheet overlay layout: {sheetLayoutInfo.overlayLayout === null ? "n/a" : sheetLayoutInfo.overlayLayout ? "true" : "false"}</div>
        <div>mountCount: {mountCountRef.current}</div>
        <div style={{ marginTop: "6px", fontWeight: 700 }}>events filter</div>
        <button
          type="button"
          onClick={toggleDisableSheetInvalidate}
          style={{
            marginTop: "4px",
            border: "1px solid #fca5a5",
            borderRadius: "6px",
            padding: "2px 6px",
            background: disableSheetStageInvalidate ? "#7f1d1d" : "transparent",
            color: "#fee2e2",
            fontSize: "10px",
          }}
        >
          Disable sheetStageChange invalidate: {disableSheetStageInvalidate ? "ON" : "OFF"}
        </button>
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
            ref={panelRef}
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
          ref={panelRef}
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
