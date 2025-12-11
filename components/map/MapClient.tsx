"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const renderFrameRef = useRef<number | null>(null);
  const clusterIndexRef = useRef<SuperclusterIndex | null>(null);
  const fetchPlacesRef = useRef<() => Promise<void>>();
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
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

    const updateIsMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);

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
          const fetchedPlaces = await safeFetch<Place[]>("/api/places");
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
      window.removeEventListener("resize", updateIsMobile);
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
