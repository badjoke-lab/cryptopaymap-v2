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

const HEADER_HEIGHT = 0;

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

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
  const fetchPlacesRef = useRef<() => Promise<void>>();
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const filtersRef = useRef<FilterState>(defaultFilterState);
  const [places, setPlaces] = useState<Place[]>([]);
  const [placesStatus, setPlacesStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("loading");
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"full" | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const bottomSheetRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [filterMeta, setFilterMeta] = useState<FilterMeta | null>(null);
  const [filters, setFilters] = useState<FilterState>(defaultFilterState);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const hasHydratedFiltersRef = useRef(false);

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
    if (!hasHydratedFiltersRef.current) return;
    const nextQuery = buildQueryFromFilters(filters);
    const currentQuery = searchParams.toString() ? `?${searchParams.toString()}` : "";
    if (nextQuery !== currentQuery) {
      router.replace(`${pathname}${nextQuery}`, { scroll: false });
    }
  }, [filters, pathname, router, searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);

    return () => {
      window.removeEventListener("resize", updateIsMobile);
    };
  }, []);

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

      // --- PIN アイコン ---
      const createPinIcon = (verification: PinType) =>
        L.divIcon({
          html: `<div class="cpm-pin cpm-pin-${verification}">${PIN_SVGS[verification]}</div>`,
          className: "",
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

      const markerLayer = L.layerGroup();
      markerLayer.addTo(map);
      markerLayerRef.current = markerLayer;

      const fetchPlacesAndBuildIndex = async () => {
        if (!isMounted) return;

        setPlacesStatus("loading");
        setPlacesError(null);
        try {
          const query = buildQueryFromFilters(filtersRef.current);
          const fetchedPlaces = await safeFetch<Place[]>(`/api/places${query}`);
          if (!isMounted) return;
          setPlaces(fetchedPlaces);
          const pins = fetchedPlaces.map(placeToPin);
          clusterIndexRef.current = createSuperclusterIndex(pins);
          updateVisibleMarkers();
          setPlacesStatus("success");
        } catch (error) {
          console.error(error);
          if (!isMounted) return;
          setPlacesError(
            "Failed to load places. Please try again.\nスポット情報の取得に失敗しました。再読み込みしてください。",
          );
          setPlacesStatus("error");
        }
      };

      map.on("moveend zoomend", updateVisibleMarkers);
      mapInstanceRef.current = map;

      fetchPlacesRef.current = fetchPlacesAndBuildIndex;
      await fetchPlacesAndBuildIndex();
    };

    initializeMap();

    return () => {
      isMounted = false;
      stopRenderFrame();
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
          filters.verifications.length ||
          filters.country ||
          filters.city,
      ),
    [filters],
  );

  const renderPlaceList = useCallback(() => {
    if (!places.length) {
      return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
          No places match the current filters.
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
              <span className="text-sm font-semibold text-gray-900">{place.name}</span>
              <span className="text-xs text-gray-600">{place.category}</span>
              <span className="text-xs text-gray-500">{[place.city, place.country].filter(Boolean).join(", ")}</span>
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
        places.find((place) => place.city === filters.city && (!filters.country || place.country === filters.country))) ||
      (filters.country && places.find((place) => place.country === filters.country)) ||
      null;

    if (targetPlace) {
      const targetZoom = filters.city ? Math.max(map.getZoom(), 8) : Math.max(map.getZoom(), 4);
      map.flyTo([targetPlace.lat, targetPlace.lng], targetZoom, { animate: true });
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
        if (target.closest(".leaflet-marker-icon, .cpm-pin, .cluster-marker")) {
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
      className="relative w-full"
      style={{
        height: `calc(100vh - ${HEADER_HEIGHT}px)`,
        ["--header-height" as string]: `${HEADER_HEIGHT}px`,
      }}
    >
      {placesStatus === "loading" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-100/90 text-gray-700">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-500" />
          <p className="mt-3 text-sm font-medium">Loading map…</p>
        </div>
      )}
      {placesError && (
        <div className="absolute inset-x-0 top-4 z-30 mx-auto w-[min(90%,480px)] rounded-md border border-red-100 bg-white/95 p-4 shadow-lg backdrop-blur">
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
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" aria-hidden />
            )}
            Retry
          </button>
        </div>
      )}
      <div className="absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersPanelOpen(true)}
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm backdrop-blur"
        >
          <span>Filters</span>
          {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />}
        </button>
        <div className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
          {places.length} places
        </div>
      </div>
      {!isMobile && (
        <aside className="pointer-events-auto absolute left-4 top-4 z-30 hidden w-[340px] max-h-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-xl backdrop-blur md:flex">
          <FiltersPanel
            filters={filters}
            meta={filterMeta}
            onChange={setFilters}
            onClear={() => setFilters(defaultFilterState)}
            disabled={placesStatus === "loading"}
          />
          <div className="rounded-md bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
            Showing {places.length} place{places.length === 1 ? "" : "s"}
          </div>
          <div className="h-px bg-gray-100" />
          <div className="flex flex-col gap-2">{renderPlaceList()}</div>
        </aside>
      )}
      {isMobile && filtersPanelOpen && (
        <div className="absolute inset-0 z-40 flex items-start justify-center bg-black/40 p-4 md:hidden">
          <div className="mt-8 w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Filters</h3>
              <button
                type="button"
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700"
                onClick={() => setFiltersPanelOpen(false)}
              >
                Close
              </button>
            </div>
            <FiltersPanel
              filters={filters}
              meta={filterMeta}
              onChange={setFilters}
              onClear={() => setFilters(defaultFilterState)}
              disabled={placesStatus === "loading"}
              showHeading={false}
            />
            <div className="mt-4 space-y-2">
              <div className="text-sm font-semibold text-gray-800">Places ({places.length})</div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100 p-2">{renderPlaceList()}</div>
            </div>
          </div>
        </div>
      )}
      <div
        id="map"
        ref={mapContainerRef}
        data-selected-place={selectedPlaceId ?? ""}
        className="absolute inset-0 w-full"
      />
      {!isMobile && (
        <Drawer
          place={selectedPlace}
          isOpen={drawerOpen && Boolean(selectedPlace)}
          mode={drawerMode}
          onClose={closeDrawer}
          ref={drawerRef}
          headerHeight={HEADER_HEIGHT}
        />
      )}
      {isMobile && (
        <MobileBottomSheet
          place={selectedPlace}
          isOpen={drawerOpen && Boolean(selectedPlace)}
          onClose={closeDrawer}
          ref={bottomSheetRef}
        />
      )}
    </div>
  );
}
