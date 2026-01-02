"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Leaflet core CSS
import "leaflet/dist/leaflet.css";

import "./map.css";
import {
  ClusterResult,
  Pin,
  PinType,
  SuperclusterIndex,
  createSuperclusterIndex,
} from "./supercluster";
import Drawer from "./Drawer";
import MobileBottomSheet from "./MobileBottomSheet";
import type { Place } from "../../types/places";
import { safeFetch } from "@/lib/safeFetch";
import FiltersPanel from "./FiltersPanel";
import {
  buildQueryFromFilters,
  defaultFilterState,
  FilterMeta,
  FilterState,
  parseFiltersFromSearchParams,
} from "@/lib/filters";
import DbStatusIndicator from "@/components/status/DbStatusIndicator";

const HEADER_HEIGHT = 0;

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;
const MAX_CLIENT_LIMIT = 12000;
const BBOX_PRECISION = 6;

const PIN_SVGS: Record<PinType, string> = {
  owner: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M16 2 C10 2,6 6.5,6 12 C6 20,16 30,16 30 C16 30,26 20,26 12 C26 6.5,22 2,16 2Z" fill="#F59E0B" stroke="white" stroke-width="2"/><circle cx="16" cy="12" r="4" fill="white"/></g></svg>`,
  community: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M16 2 C10 2,6 6.5,6 12 C6 20,16 30,16 30 C16 30,26 20,26 12 C26 6.5,22 2,16 2Z" fill="#3B82F6" stroke="white" stroke-width="2"/><path d="M12 13C12 10.7909 13.7909 9 16 9C18.2091 9 20 10.7909 20 13C20 15.2091 18.2091 17 16 17C13.7909 17 12 15.2091 12 13Z" fill="white"/><circle cx="14" cy="12" r="1" fill="#3B82F6"/><circle cx="18" cy="12" r="1" fill="#3B82F6"/><path d="M14 15C14.5 15.6667 15.6 17 16 17C16.4 17 17.5 15.6667 18 15" stroke="#3B82F6" stroke-width="1" stroke-linecap="round"/></g></svg>`,
  directory: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M16 2 C10 2,6 6.5,6 12 C6 20,16 30,16 30 C16 30,26 20,26 12 C26 6.5,22 2,16 2Z" fill="#14B8A6" stroke="white" stroke-width="2"/><path d="M11 12C11 9.23858 13.2386 7 16 7C18.7614 7 21 9.23858 21 12C21 14.7614 18.7614 17 16 17C13.2386 17 11 14.7614 11 12Z" fill="white"/><path d="M14 12H18M16 10V14" stroke="#14B8A6" stroke-width="1.5" stroke-linecap="round"/></g></svg>`,
  unverified: `<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><g><path d="M16 2 C10 2,6 6.5,6 12 C6 20,16 30,16 30 C16 30,26 20,26 12 C26 6.5,22 2,16 2Z" fill="#9CA3AF" stroke="white" stroke-width="2"/><circle cx="16" cy="12" r="4" fill="white"/><path d="M16 10V14" stroke="#9CA3AF" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="17" r="0.75" fill="#9CA3AF"/></g></svg>`,
};

const placeToPin = (place: Place): Pin => ({
  id: place.id,
  lat: place.lat,
  lng: place.lng,
  verification: place.verification,
});

export default function MapClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const clusterIndexRef = useRef<SuperclusterIndex | null>(null);
  const fetchPlacesRef = useRef<() => void>();
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const filtersRef = useRef<FilterState>(defaultFilterState);
  const placesRef = useRef<Place[]>([]);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);
  const pendingFetchRef = useRef<{
    bboxKey: string;
    requestKey: string;
    force: boolean;
    zoom: number;
  } | null>(null);
  const lastBboxKeyRef = useRef<string | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesStatus, setPlacesStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("loading");
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<{ count: number; limit: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"full" | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const bottomSheetRef = useRef<HTMLDivElement | null>(null);
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasHydratedFiltersRef = useRef(false);

  const toggleFilters = useCallback(
    () => setFiltersOpen((previous) => !previous),
    [],
  );
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const openDrawerForPlace = useCallback((placeId: string) => {
    setSelectedPlaceId((prev) => {
      if (prev === placeId) {
        return prev;
      }
      return placeId;
    });
    setDrawerOpen(true);
    setDrawerMode("full");
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedPlaceId(null);
    setDrawerOpen(false);
    setDrawerMode(null);
  }, []);

  useEffect(() => {
    let isMounted = true;
    safeFetch<FilterMeta>("/api/filters/meta")
      .then((meta) => {
        if (isMounted) {
          setFilterMeta(meta);
        }
      })
      .catch(() => {
        /* noop - filters can still be applied manually */
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (hasHydratedFiltersRef.current) return;
    const parsedFilters = parseFiltersFromSearchParams(
      new URLSearchParams(searchParams.toString()),
      filterMeta ?? undefined,
    );
    setFilters(parsedFilters);
    filtersRef.current = parsedFilters;

    if (filterMeta) {
      hasHydratedFiltersRef.current = true;
    }
  }, [filterMeta, searchParams]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    if (!hasHydratedFiltersRef.current) return;
    const nextQuery = buildQueryFromFilters(filters);
    const currentQuery = searchParams.toString() ? `?${searchParams.toString()}` : "";
    if (nextQuery !== currentQuery) {
      router.replace(`${pathname}${nextQuery}`, { scroll: false });
    }
  }, [filters, pathname, router, searchParams]);

  useEffect(() => {
    let isMounted = true;

    const stopRenderFrame = () => {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };

    const renderClusters = (clusters: ClusterResult[]) => {
      const L = leafletRef.current;
      const map = mapInstanceRef.current;

      if (!markerLayerRef.current || !L || !map) return;

      stopRenderFrame();
      markerLayerRef.current.clearLayers();

      markersRef.current.clear();

      const tasks = clusters.map((clusterItem) => () => {
        if (!markerLayerRef.current || !map) return;

        if (clusterItem.type === "cluster") {
          const [lng, lat] = clusterItem.coordinates;
          const clusterIcon = L.divIcon({
            html: `<div class="cluster-marker__inner">${clusterItem.pointCount}</div>`,
            className: "cluster-marker",
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          });

          const marker = L.marker([lat, lng], { icon: clusterIcon });
          marker.on("click", () => {
            const expansionZoom = clusterIndexRef.current?.getClusterExpansionZoom(
              clusterItem.id,
            );
            if (expansionZoom !== undefined) {
              map.flyTo([lat, lng], expansionZoom, { animate: true });
            }
          });

          markerLayerRef.current?.addLayer(marker);
          return;
        }

        const [lng, lat] = clusterItem.coordinates;
        const icon = L.divIcon({
          html: `<div class="cpm-pin cpm-pin-${clusterItem.verification}">${PIN_SVGS[clusterItem.verification]}</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        const marker = L.marker([lat, lng], { icon });
        marker.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          event.originalEvent.stopPropagation();
          openDrawerForPlace(clusterItem.id);
        });
        markerLayerRef.current.addLayer(marker);
        markersRef.current.set(clusterItem.id, marker);
      });

      const processChunk = () => {
        const start = performance.now();
        while (tasks.length && performance.now() - start < 12) {
          const task = tasks.shift();
          task?.();
        }

        if (tasks.length) {
          renderFrameRef.current = requestAnimationFrame(processChunk);
        } else {
          renderFrameRef.current = null;
        }
      };

      processChunk();
    };

    const updateVisibleMarkers = () => {
      const map = mapInstanceRef.current;
      if (!markerLayerRef.current || !clusterIndexRef.current || !map) return;
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];

      const zoom = map.getZoom();
      const clusters = clusterIndexRef.current.getClusters(bbox, zoom);
      renderClusters(clusters);
    };

    const clearFetchTimeout = () => {
      if (fetchTimeoutRef.current === null) return;
      window.clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    };

    const clearMarkers = () => {
      markerLayerRef.current?.clearLayers();
      markersRef.current.clear();
      clusterIndexRef.current = createSuperclusterIndex([]);
    };

    const formatBbox = (bounds: import("leaflet").LatLngBounds) => {
      const round = (value: number) => Number(value.toFixed(BBOX_PRECISION));
      return [
        round(bounds.getWest()),
        round(bounds.getSouth()),
        round(bounds.getEast()),
        round(bounds.getNorth()),
      ].join(",");
    };

    const getLimitForZoom = (zoom: number) => {
      const rawLimit =
        zoom <= 2 ? 2000 : zoom <= 4 ? 4000 : zoom <= 6 ? 8000 : 12000;
      return Math.min(rawLimit, MAX_CLIENT_LIMIT);
    };

    const initializeMap = async () => {
      const L = await import("leaflet");
      leafletRef.current = L;

      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

      // --- MAP 初期化 ---
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      }).setView(DEFAULT_COORDINATES, DEFAULT_ZOOM);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const markerLayer = L.layerGroup();
      markerLayer.addTo(map);
      markerLayerRef.current = markerLayer;

      const buildIndexAndRender = (nextPlaces: Place[]) => {
        const pins = nextPlaces.map(placeToPin);
        clusterIndexRef.current = createSuperclusterIndex(pins);
        updateVisibleMarkers();
      };

      const fetchPlacesForBbox = async (bboxKey: string, zoom: number) => {
        if (!isMounted) return;
        requestIdRef.current += 1;
        const requestId = requestIdRef.current;
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setPlacesStatus("loading");
        setPlacesError(null);
        setLimitNotice(null);
        placesRef.current = [];
        setPlaces([]);
        clearMarkers();

        try {
          const filters = filtersRef.current;
          const query = buildQueryFromFilters(filters);
          const params = new URLSearchParams(query.replace("?", ""));
          const limit = getLimitForZoom(zoom);
          params.set("limit", String(limit));
          params.set("bbox", bboxKey);
          const pageQuery = params.toString();
          if (process.env.NEXT_PUBLIC_ENV !== "production") {
            const center = map.getCenter();
            console.debug("[map] fetch params", {
              center: [Number(center.lat.toFixed(4)), Number(center.lng.toFixed(4))],
              zoom,
              query: pageQuery,
            });
          }
          const nextPlaces = await safeFetch<Place[]>(
            `/api/places${pageQuery ? `?${pageQuery}` : ""}`,
            { signal: controller.signal, retries: 0 },
          );
          if (!isMounted || requestIdRef.current !== requestId) return;

          if (process.env.NODE_ENV !== "production") {
            console.info("[map] places fetch", {
              zoom,
              bbox: bboxKey,
              limit,
              count: nextPlaces.length,
            });
          }

          placesRef.current = nextPlaces;
          setPlaces(nextPlaces);
          setLimitNotice(nextPlaces.length >= limit ? { count: nextPlaces.length, limit } : null);
          buildIndexAndRender(nextPlaces);
          setPlacesStatus("success");
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error(error);
          if (!isMounted || requestIdRef.current !== requestId) return;
          setPlacesError(
            "Failed to load places. Please try again.\nスポット情報の取得に失敗しました。再読み込みしてください。",
          );
          setPlacesStatus("error");
        }
      };

      const scheduleFetchForBounds = (
        bounds: import("leaflet").LatLngBounds,
        { force = false }: { force?: boolean } = {},
      ) => {
        const bboxKey = formatBbox(bounds);
        const zoom = map.getZoom();
        const requestKey = `${bboxKey}@${zoom}`;
        if (!force && requestKey === lastBboxKeyRef.current) return;
        pendingFetchRef.current = { bboxKey, requestKey, force, zoom };
        clearFetchTimeout();
        fetchTimeoutRef.current = window.setTimeout(() => {
          const pending = pendingFetchRef.current;
          if (!pending) return;
          if (!pending.force && pending.requestKey === lastBboxKeyRef.current) return;
          lastBboxKeyRef.current = pending.requestKey;
          void fetchPlacesForBbox(pending.bboxKey, pending.zoom);
        }, 250);
      };

      const handleMapViewChange = () => {
        scheduleFetchForBounds(map.getBounds(), { force: true });
        updateVisibleMarkers();
      };

      map.on("moveend zoomend", handleMapViewChange);
      mapInstanceRef.current = map;

      fetchPlacesRef.current = () => {
        if (!mapInstanceRef.current) return;
        scheduleFetchForBounds(mapInstanceRef.current.getBounds(), { force: true });
      };
      map.whenReady(() => {
        scheduleFetchForBounds(map.getBounds(), { force: true });
      });
    };

    initializeMap();

    return () => {
      isMounted = false;
      stopRenderFrame();
      clearFetchTimeout();
      abortControllerRef.current?.abort();
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [openDrawerForPlace]);

  const selectedPlace = useMemo(
    () =>
      selectedPlaceId && places.length
        ? places.find((place) => place.id === selectedPlaceId) ?? null
        : null,
    [places, selectedPlaceId],
  );

  useEffect(() => {
    if (selectedPlaceId && !selectedPlace) {
      closeDrawer();
    }
  }, [closeDrawer, selectedPlace, selectedPlaceId]);

  useEffect(() => {
    if (!fetchPlacesRef.current) return;
    const timeout = window.setTimeout(() => {
      fetchPlacesRef.current?.();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [filters]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.category ||
          filters.chains.length ||
          filters.payments.length ||
          filters.verifications.length ||
          filters.country ||
          filters.city ||
          filters.search.trim(),
      ),
    [filters],
  );

  // ▼ モバイル用フィルタ UI（z-index を Leaflet より上にして fixed 配置）
  const renderMobileFilters = () => {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] lg:hidden">
        {/* 上部の「Filters」ボタン + 件数 */}
        <div className="pointer-events-auto mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={toggleFilters}
            data-testid="map-filters-toggle"
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm backdrop-blur"
          >
            <span>Filters</span>
            {hasActiveFilters && (
              <span
                className="h-2 w-2 rounded-full bg-blue-500"
                aria-hidden
              />
            )}
          </button>
          <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
            {places.length} place{places.length === 1 ? "" : "s"}
          </div>
        </div>
        {/* 下から出るフィルタシート */}
        {filtersOpen && (
          <div
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-[1010] mx-auto max-h-[70vh] w-full rounded-t-2xl bg-white shadow-lg lg:hidden"
            data-testid="mobile-filters-sheet"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-900">Filters</h3>
              <button
                type="button"
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700"
                onClick={closeFilters}
              >
                Close
              </button>
            </div>
            <div className="max-h-[calc(70vh-56px)] overflow-y-auto p-4">
              <FiltersPanel
                filters={filters}
                meta={filterMeta}
                onChange={setFilters}
                onClear={() => setFilters(defaultFilterState)}
                disabled={placesStatus === "loading"}
                showHeading={false}
              />
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold text-gray-800">
                  Places ({places.length})
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-2">
                  {renderPlaceList()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPlaceList = useCallback(() => {
    if (!places.length) {
      return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          No places found for current filters.
        </div>
      );
    }

    return (
      <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100">
        {places.map((place) => (
          <button
            key={place.id}
            type="button"
            onClick={() => openDrawerForPlace(place.id)}
            className="flex w-full items-start gap-3 bg-white px-3 py-2 text-left transition hover:bg-gray-50"
          >
            <div className="mt-0.5 h-2 w-2 rounded-full bg-gray-400" aria-hidden />
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-900">
                {place.name}
              </span>
              <span className="text-xs text-gray-600">{place.category}</span>
              <span className="text-xs text-gray-500">
                {[place.city, place.country].filter(Boolean).join(", ")}
              </span>
            </div>
          </button>
        ))}
      </div>
    );
  }, [openDrawerForPlace, places]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || places.length === 0) return;

    const targetPlace =
      (filters.city &&
        places.find(
          (place) =>
            place.city === filters.city &&
            (!filters.country || place.country === filters.country),
        )) ||
      (filters.country &&
        places.find((place) => place.country === filters.country)) ||
      null;

    if (targetPlace) {
      const targetZoom = filters.city
        ? Math.max(map.getZoom(), 8)
        : Math.max(map.getZoom(), 4);
      map.flyTo([targetPlace.lat, targetPlace.lng], targetZoom, {
        animate: true,
      });
    }
  }, [filters.city, filters.country, places]);

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const element = marker.getElement();
      const isSelected = id === selectedPlaceId;
      const pin = element?.querySelector(".cpm-pin");
      if (pin) {
        pin.classList.remove("cpm-pin-selected");
        pin.classList.toggle("active", isSelected);
      }
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    });
  }, [selectedPlaceId]);

  useEffect(() => {
    if (!selectedPlaceId && !drawerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Element) {
        if (
          target.closest(
            ".leaflet-marker-icon, .cpm-pin, .cluster-marker",
          )
        ) {
          return;
        }
      }

      if (target instanceof Node) {
        if (drawerRef.current?.contains(target)) {
          return;
        }

        if (bottomSheetRef.current?.contains(target)) {
          return;
        }
      }

      closeDrawer();
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeDrawer, drawerOpen, selectedPlaceId]);

  return (
    <div
      className="relative flex w-full"
      style={{
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        ["--header-height" as string]: `${HEADER_HEIGHT}px`,
      }}
    >
      <aside className="hidden h-full w-80 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex-1 overflow-y-auto p-4">
          <FiltersPanel
            filters={filters}
            meta={filterMeta}
            onChange={setFilters}
            onClear={() => setFilters(defaultFilterState)}
            disabled={placesStatus === "loading"}
          />
          <div className="mt-4 rounded-md bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
            Showing {places.length} place{places.length === 1 ? "" : "s"}
          </div>
          <div className="mt-4 h-px bg-gray-100" />
          <div className="mt-4 flex flex-col gap-2">{renderPlaceList()}</div>
        </div>
      </aside>
      <div className="relative flex-1 bg-gray-50">
        <DbStatusIndicator
          className="pointer-events-none absolute right-4 top-4 z-50 flex flex-col items-end gap-2 text-right"
          showBanner
        />
        {limitNotice && placesStatus !== "loading" && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 mx-auto w-[min(90%,520px)] rounded-md border border-amber-200 bg-amber-50/95 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm backdrop-blur">
            Too many results ({limitNotice.count} of {limitNotice.limit}). Zoom in to narrow down.
          </div>
        )}
        {placesStatus === "loading" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-gray-100/90 text-gray-700">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
            <p className="mt-3 text-sm font-medium">Loading places…</p>
          </div>
        )}
        {placesError && (
          <div className="absolute inset-x-0 top-4 z-50 mx-auto w-[min(90%,480px)] rounded-md border border-red-100 bg-white/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm leading-relaxed text-red-700">
              Failed to load places. Please try again.
              <br />
              スポット情報の取得に失敗しました。再読み込みしてください。
            </p>
            <button
              type="button"
              onClick={() => fetchPlacesRef.current?.()}
              disabled={placesStatus === "loading"}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
            >
              {placesStatus === "loading" && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white"
                  aria-hidden
                />
              )}
              Retry
            </button>
          </div>
        )}
        {/* モバイル用フィルタは画面全体に fixed で被せる */}
        {renderMobileFilters()}
        <div
          id="map"
          ref={mapContainerRef}
          data-selected-place={selectedPlaceId ?? ""}
          className="absolute inset-0 w-full"
        />
        <div className="hidden lg:block">
          <Drawer
            place={selectedPlace}
            isOpen={drawerOpen && Boolean(selectedPlace)}
            mode={drawerMode}
            onClose={closeDrawer}
            ref={drawerRef}
            headerHeight={HEADER_HEIGHT}
          />
        </div>
        <div className="lg:hidden">
          <MobileBottomSheet
            place={selectedPlace}
            isOpen={drawerOpen && Boolean(selectedPlace)}
            onClose={closeDrawer}
            ref={bottomSheetRef}
          />
        </div>
      </div>
    </div>
  );
}
