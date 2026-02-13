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
import LimitedModeNotice from "@/components/status/LimitedModeNotice";
import { isLimitedHeader } from "@/lib/clientDataSource";
import MapFetchStatus from "./MapFetchStatus";

const HEADER_HEIGHT = 64;

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
  const userMarkerRef = useRef<import("leaflet").Marker | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const skipNextSelectionRef = useRef(false);
  const filtersRef = useRef<FilterState>(defaultFilterState);
  const placesRef = useRef<Place[]>([]);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);
  const pendingFetchRef = useRef<{
    bboxKey: string;
    requestKey: string;
    filterQuery: string;
    force: boolean;
    zoom: number;
  } | null>(null);
  const lastRequestKeyRef = useRef<string | null>(null);
  const placesCacheRef = useRef<Map<string, { places: Place[]; limit: number; limited: boolean }>>(
    new Map(),
  );
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesStatus, setPlacesStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("loading");
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [limitNotice, setLimitNotice] = useState<{ count: number; limit: number } | null>(null);
  const [limitedMode, setLimitedMode] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const selectedPlaceIdRef = useRef<string | null>(null);
  const [drawerMode, setDrawerMode] = useState<"full" | null>(null);
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [selectedPlaceDetail, setSelectedPlaceDetail] = useState<Place | null>(null);
  const [selectedPlaceDetailStatus, setSelectedPlaceDetailStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const bottomSheetRef = useRef<HTMLDivElement | null>(null);
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasHydratedFiltersRef = useRef(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showDbStatus, setShowDbStatus] = useState(false);
  const lastSelectAtRef = useRef(0);
  const lastSelectedIdRef = useRef<string | null>(null);
  const invalidateTimeoutRef = useRef<number | null>(null);

  const isDrawerOpen = Boolean(selectedPlaceId);

  const invalidateMapSize = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (invalidateTimeoutRef.current !== null) {
      window.clearTimeout(invalidateTimeoutRef.current);
    }
    invalidateTimeoutRef.current = window.setTimeout(() => {
      map.invalidateSize({ pan: false });
      invalidateTimeoutRef.current = null;
    }, 100);
  }, []);

  const toggleFilters = useCallback(
    () => setFiltersOpen((previous) => !previous),
    [],
  );
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyDebugValue = () => {
      const stored = window.localStorage.getItem("cpm:debug-mode");
      setShowDbStatus(stored === "1");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "cpm:debug-mode") {
        applyDebugValue();
      }
    };
    const onDebugChange = () => applyDebugValue();
    applyDebugValue();
    window.addEventListener("storage", onStorage);
    window.addEventListener("cpm:debug-mode-change", onDebugChange as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("cpm:debug-mode-change", onDebugChange as EventListener);
    };
  }, []);

  const restoreFocus = useCallback(() => {
    const target = lastFocusedElementRef.current ?? mapContainerRef.current;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
  }, []);

  const openDrawerForPlace = useCallback((placeId: string) => {
    const now = performance.now();
    const isRapidRepeat =
      lastSelectedIdRef.current === placeId && now - lastSelectAtRef.current < 200;
    if (isRapidRepeat) {
      return;
    }
    lastSelectedIdRef.current = placeId;
    lastSelectAtRef.current = now;
    lastFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectionNotice(null);
    setSelectedPlaceId((prev) => {
      if (prev === placeId) {
        return prev;
      }
      return placeId;
    });
    setDrawerMode("full");
  }, []);

  const closeDrawer = useCallback(() => {
    skipNextSelectionRef.current = true;
    setSelectedPlaceId(null);
    setDrawerMode(null);
    window.requestAnimationFrame(() => {
      restoreFocus();
    });
  }, [restoreFocus]);

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
    selectedPlaceIdRef.current = selectedPlaceId;
  }, [selectedPlaceId]);

  useEffect(() => {
    if (!hasHydratedFiltersRef.current) return;
    const nextQuery = buildQueryFromFilters(filters);
    const nextParams = new URLSearchParams(nextQuery.replace("?", ""));
    const selectParam = searchParams.get("select");
    if (selectParam) {
      nextParams.set("select", selectParam);
    }
    const nextQueryWithSelection = nextParams.toString();
    const currentQuery = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const normalizedQuery = nextQueryWithSelection ? `?${nextQueryWithSelection}` : "";
    if (normalizedQuery !== currentQuery) {
      router.replace(`${pathname}${normalizedQuery}`, { scroll: false });
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
      const nextLayer = L.layerGroup();
      const nextMarkers = new Map<string, import("leaflet").Marker>();

      const tasks = clusters.map((clusterItem) => () => {
        if (!mapInstanceRef.current) return;

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

          nextLayer.addLayer(marker);
          return;
        }

        const [lng, lat] = clusterItem.coordinates;
        const isSelected = selectedPlaceIdRef.current === clusterItem.id;
        const icon = L.divIcon({
          html: `<div class="cpm-pin cpm-pin-${clusterItem.verification}${isSelected ? " active" : ""}">${PIN_SVGS[clusterItem.verification]}</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });
        const marker = L.marker([lat, lng], { icon });
        marker.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          event.originalEvent?.stopPropagation();
          event.originalEvent?.preventDefault();
          openDrawerForPlace(clusterItem.id);
        });
        marker.setZIndexOffset(isSelected ? 1000 : 0);
        nextLayer.addLayer(marker);
        nextMarkers.set(clusterItem.id, marker);
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
          if (!mapInstanceRef.current) return;
          if (markerLayerRef.current) {
            map.removeLayer(markerLayerRef.current);
          }
          nextLayer.addTo(map);
          markerLayerRef.current = nextLayer;
          markersRef.current = nextMarkers;
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

    const formatBbox = (bounds: import("leaflet").LatLngBounds) => {
      const round = (value: number) => Number(value.toFixed(BBOX_PRECISION));
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(value, min), max);
      const toWorldBbox = () => [-180, -85, 180, 85];

      const rawWest = bounds.getWest();
      const rawSouth = bounds.getSouth();
      const rawEast = bounds.getEast();
      const rawNorth = bounds.getNorth();
      const spansWorld = rawEast - rawWest >= 360 || rawWest < -180 || rawEast > 180;

      const [minLng, minLat, maxLng, maxLat] = spansWorld
        ? toWorldBbox()
        : [
            clamp(rawWest, -180, 180),
            clamp(rawSouth, -85, 85),
            clamp(rawEast, -180, 180),
            clamp(rawNorth, -85, 85),
          ];

      if (minLng >= maxLng || minLat >= maxLat) {
        return toWorldBbox().map((value) => round(value)).join(",");
      }

      return [minLng, minLat, maxLng, maxLat].map((value) => round(value)).join(",");
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

      // --- Map initialization ---
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

      const buildRequestKey = (bboxKey: string, zoom: number, filterQuery: string) =>
        `${bboxKey}@${zoom}|${filterQuery}`;

      const fetchPlacesForBbox = async (
        bboxKey: string,
        zoom: number,
        filterQuery: string,
        requestKey: string,
      ) => {
        if (!isMounted) return;
        requestIdRef.current += 1;
        const requestId = requestIdRef.current;
        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const cached = placesCacheRef.current.get(requestKey);
        if (cached) {
          setPlacesError(null);
          placesRef.current = cached.places;
          setPlaces(cached.places);
          setLimitNotice(cached.places.length >= cached.limit ? { count: cached.places.length, limit: cached.limit } : null);
          setLimitedMode(cached.limited);
          buildIndexAndRender(cached.places);
          setPlacesStatus("success");
          return;
        }

        const hadPlaces = placesRef.current.length > 0;
        setPlacesStatus("loading");
        setPlacesError(null);
        if (!hadPlaces) {
          setLimitNotice(null);
        }

        try {
          const filters = filtersRef.current;
          const params = new URLSearchParams(filterQuery.replace("?", ""));
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
          const response = await fetch(`/api/places${pageQuery ? `?${pageQuery}` : ""}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          const nextPlaces = (await response.json()) as Place[];
          const isLimited = isLimitedHeader(response.headers);
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
          setLimitedMode(isLimited);
          setLimitNotice(nextPlaces.length >= limit ? { count: nextPlaces.length, limit } : null);
          buildIndexAndRender(nextPlaces);
          placesCacheRef.current.set(requestKey, { places: nextPlaces, limit, limited: isLimited });
          if (placesCacheRef.current.size > 30) {
            const [firstKey] = placesCacheRef.current.keys();
            if (firstKey) {
              placesCacheRef.current.delete(firstKey);
            }
          }
          setPlacesStatus("success");
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          console.error(error);
          if (!isMounted || requestIdRef.current !== requestId) return;
          const message = "Failed to load places. Please try again.";
          setPlacesError(message);
          if (placesRef.current.length > 0) {
            setPlacesStatus("success");
            return;
          }
          setPlacesStatus("error");
        }
      };

      const scheduleFetchForBounds = (
        bounds: import("leaflet").LatLngBounds,
        { force = false }: { force?: boolean } = {},
      ) => {
        const bboxKey = formatBbox(bounds);
        const zoom = map.getZoom();
        const filterQuery = buildQueryFromFilters(filtersRef.current);
        const requestKey = buildRequestKey(bboxKey, zoom, filterQuery);
        if (!force && requestKey === lastRequestKeyRef.current) return;
        pendingFetchRef.current = { bboxKey, requestKey, filterQuery, force, zoom };
        clearFetchTimeout();
        fetchTimeoutRef.current = window.setTimeout(() => {
          const pending = pendingFetchRef.current;
          if (!pending) return;
          if (!pending.force && pending.requestKey === lastRequestKeyRef.current) return;
          lastRequestKeyRef.current = pending.requestKey;
          void fetchPlacesForBbox(
            pending.bboxKey,
            pending.zoom,
            pending.filterQuery,
            pending.requestKey,
          );
        }, 120);
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
        invalidateMapSize();
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
  }, [invalidateMapSize, openDrawerForPlace]);

  const selectedPlace = useMemo(
    () =>
      selectedPlaceId && places.length
        ? places.find((place) => place.id === selectedPlaceId) ?? null
        : null,
    [places, selectedPlaceId],
  );
  const selectedPlaceForDrawer = selectedPlace ?? selectedPlaceDetail;

  useEffect(() => {
    if (!selectedPlaceId) {
      setSelectedPlaceDetail(null);
      setSelectedPlaceDetailStatus("idle");
      return;
    }

    if (selectedPlace) {
      setSelectedPlaceDetail(null);
      setSelectedPlaceDetailStatus("idle");
      return;
    }

    let isActive = true;
    const controller = new AbortController();
    setSelectedPlaceDetail(null);
    setSelectedPlaceDetailStatus("loading");

    safeFetch<Place>(`/api/places/${selectedPlaceId}`, {
      signal: controller.signal,
      retries: 1,
    })
      .then((detail) => {
        if (!isActive) return;
        setSelectedPlaceDetail(detail);
        setSelectedPlaceDetailStatus("idle");
      })
      .catch(() => {
        if (!isActive) return;
        setSelectedPlaceDetail(null);
        setSelectedPlaceDetailStatus("error");
      });

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [selectedPlace, selectedPlaceId]);

  useEffect(() => {
    if (!selectedPlaceId || placesStatus !== "success") return;
    if (!selectedPlace) {
      setSelectionNotice(
        "Selected place is outside the current map area or filters.",
      );
    }
  }, [placesStatus, selectedPlace, selectedPlaceId]);

  useEffect(() => {
    if (!fetchPlacesRef.current) return;
    const timeout = window.setTimeout(() => {
      fetchPlacesRef.current?.();
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [filters]);

  useEffect(() => {
    const selectParam = searchParams.get("select");
    if (skipNextSelectionRef.current) {
      if (!selectParam) {
        skipNextSelectionRef.current = false;
      }
      if (!selectionHydrated) {
        setSelectionHydrated(true);
      }
      return;
    }
    if (selectParam) {
      if (selectParam !== selectedPlaceIdRef.current) {
        setSelectedPlaceId(selectParam);
      }
      setDrawerMode("full");
    } else if (selectedPlaceIdRef.current) {
      closeDrawer();
    }

    if (!selectionHydrated) {
      setSelectionHydrated(true);
    }
  }, [closeDrawer, searchParams, selectionHydrated]);

  useEffect(() => {
    if (!selectionHydrated) return;
    const params = new URLSearchParams(searchParams.toString());
    if (selectedPlaceId) {
      params.set("select", selectedPlaceId);
    } else {
      params.delete("select");
    }
    const nextQuery = params.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      const normalizedQuery = nextQuery ? `?${nextQuery}` : "";
      router.replace(`${pathname}${normalizedQuery}`, { scroll: false });
    }
  }, [pathname, router, searchParams, selectedPlaceId, selectionHydrated]);

  useEffect(() => {
    if (!selectionNotice) return;
    const timeout = window.setTimeout(() => {
      setSelectionNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [selectionNotice]);

  const selectionStatus = selectedPlace ? "idle" : selectedPlaceDetailStatus;

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

  // Mobile filter UI (overlay above Leaflet with higher z-index).
  const renderMobileFilters = () => {
    return (
      <div className="cpm-map-mobile-filters lg:hidden">
        <div className="cpm-map-mobile-filters__sheet-wrap">
          {filtersOpen && (
            <div
              className="cpm-map-mobile-filters__sheet"
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
                  showHeading={false}
                />
                <div className="mt-4 space-y-2">
                  <div className="text-sm font-semibold text-gray-800">
                    Places ({places.length})
                  </div>
                  {places.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                      <div className="font-semibold">No places for current filters.</div>
                      <button
                        type="button"
                        className="mt-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-700"
                        onClick={() => setFilters(defaultFilterState)}
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-2">
                      {renderPlaceList()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="cpm-map-mobile-hud-stack">
          <button
            type="button"
            onClick={handleLocateMe}
            className="cpm-map-button cpm-map-button--compact"
            disabled={isLocating}
          >
            {isLocating ? "Locating…" : "Locate"}
          </button>
          <button
            type="button"
            onClick={toggleFilters}
            data-testid="map-filters-toggle"
            className="cpm-map-button cpm-map-button--compact cpm-map-filters-toggle"
          >
            <span>Filters</span>
            {hasActiveFilters && (
              <span
                className="h-2 w-2 rounded-full bg-blue-500"
                aria-hidden
              />
            )}
          </button>
          <div className="cpm-map-places-pill" role="status" aria-live="polite">
            <span>
              {places.length} place{places.length === 1 ? "" : "s"}
            </span>
            {placesStatus === "loading" ? (
              <span className="cpm-inline-loading-spinner" aria-hidden />
            ) : null}
          </div>
        </div>
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
        {places.map((place) => {
          const isSelected = selectedPlaceId === place.id;
          return (
            <button
              key={place.id}
              type="button"
              onClick={() => openDrawerForPlace(place.id)}
              className={`flex w-full items-start gap-3 bg-white px-3 py-2 text-left transition hover:bg-gray-50 ${
                isSelected ? "bg-blue-50/70" : ""
              }`}
              aria-pressed={isSelected}
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
          );
        })}
      </div>
    );
  }, [openDrawerForPlace, places, selectedPlaceId]);

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
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    if (!userMarkerRef.current) {
      const icon = L.divIcon({
        html: `<div class="cpm-user-marker"><span class="cpm-user-marker__pulse"></span><span class="cpm-user-marker__dot"></span></div>`,
        className: "cpm-user-marker-icon",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      userMarkerRef.current = L.marker(userLocation, { icon, interactive: false }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(userLocation);
    }
  }, [userLocation]);

  const handleLocateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setGeolocationError("Geolocation is not supported in this browser.");
      return;
    }

    setIsLocating(true);
    setGeolocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: [number, number] = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        setUserLocation(nextLocation);
        setIsLocating(false);
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo(nextLocation, Math.max(map.getZoom(), 13), { animate: true });
        }
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setGeolocationError("Location permission denied.");
            break;
          case error.POSITION_UNAVAILABLE:
            setGeolocationError("Location unavailable.");
            break;
          case error.TIMEOUT:
            setGeolocationError("Location request timed out.");
            break;
          default:
            setGeolocationError("Unable to get your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    if (!selectedPlaceId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (window.matchMedia("(max-width: 1023px)").matches) {
        return;
      }
      const target = event.target;

      if (target instanceof Element) {
        if (
          target.closest(
            ".leaflet-marker-icon, .cpm-pin, .cluster-marker",
          )
        ) {
          return;
        }

        if (target.closest(".leaflet-control")) {
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

        if (mapContainerRef.current?.contains(target)) {
          closeDrawer();
        }
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [closeDrawer, selectedPlaceId]);

  useEffect(() => {
    if (!isDrawerOpen) return;
    invalidateMapSize();
  }, [drawerMode, invalidateMapSize, isDrawerOpen]);

  useEffect(() => {
    invalidateMapSize();
  }, [filtersOpen, invalidateMapSize]);

  useEffect(() => {
    return () => {
      if (invalidateTimeoutRef.current !== null) {
        window.clearTimeout(invalidateTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative flex w-full min-h-0 flex-1"
      style={{
        height: `calc(100dvh - var(--cpm-header-h, ${HEADER_HEIGHT}px))`,
        minHeight: 0,
        ["--header-height" as string]: `var(--cpm-header-h, ${HEADER_HEIGHT}px)`,
      }}
    >
      <aside className="hidden h-full w-80 flex-col border-r border-gray-200 bg-white lg:flex">
        <div className="flex-1 overflow-y-auto p-4">
          <FiltersPanel
            filters={filters}
            meta={filterMeta}
            onChange={setFilters}
            onClear={() => setFilters(defaultFilterState)}
/>
          <div className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
            <span>
              Showing {places.length} place{places.length === 1 ? "" : "s"}
            </span>
            {placesStatus === "loading" ? (
              <span className="cpm-inline-loading-spinner" aria-hidden />
            ) : null}
          </div>
          <div className="mt-4 h-px bg-gray-100" />
          <div className="mt-4 flex flex-col gap-2">{renderPlaceList()}</div>
        </div>
      </aside>
      <div className="relative flex-1 bg-gray-50 min-h-0">
        <div className="cpm-map-overlay">
          <div className="cpm-map-overlay__top">
            <div className="hidden lg:block">
              <div className="cpm-map-controls">
                <button
                  type="button"
                  onClick={handleLocateMe}
                  className="cpm-map-button"
                  disabled={isLocating}
                >
                  {isLocating ? "Locating…" : "Locate me"}
                </button>
                {geolocationError && (
                  <div className="cpm-map-toast">{geolocationError}</div>
                )}
                {selectionNotice && (
                  <div className="cpm-map-toast" role="status" aria-live="polite">
                    {selectionNotice}
                  </div>
                )}
              </div>
            </div>
            {showDbStatus ? (
              <DbStatusIndicator
                className="cpm-map-db-status hidden lg:flex"
                showBanner={false}
              />
            ) : null}
            {limitedMode ? <LimitedModeNotice className="mt-2 w-full max-w-sm" /> : null}
          </div>
          <MapFetchStatus
            error={placesError}
            onRetry={() => fetchPlacesRef.current?.()}
          />
          {renderMobileFilters()}
        </div>
        {limitNotice && placesStatus !== "loading" && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-40 mx-auto w-[min(90%,520px)] rounded-md border border-amber-200 bg-amber-50/95 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm backdrop-blur">
            Too many results ({limitNotice.count} of {limitNotice.limit}). Zoom in to narrow down.
          </div>
        )}
        <div
          id="map"
          ref={mapContainerRef}
          data-selected-place={selectedPlaceId ?? ""}
          tabIndex={0}
          aria-label="Map"
          className="absolute inset-0 h-full w-full"
        />
        <div className="hidden lg:block">
          <Drawer
            place={selectedPlaceForDrawer}
            isOpen={isDrawerOpen}
            mode={drawerMode}
            onClose={closeDrawer}
            ref={drawerRef}
            headerHeight={HEADER_HEIGHT}
            selectionStatus={selectionStatus}
          />
        </div>
        <div className="lg:hidden">
          <MobileBottomSheet
            place={selectedPlaceForDrawer}
            isOpen={isDrawerOpen}
            onClose={closeDrawer}
            ref={bottomSheetRef}
            selectionStatus={selectionStatus}
            onStageChange={() => {
              invalidateMapSize();
            }}
          />
        </div>
      </div>
    </div>
  );
}
