"use client";

import { useEffect, useRef, useState } from "react";

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
import RightDrawer from "./RightDrawer";
import MobileBottomSheet from "./MobileBottomSheet";
import type { Place } from "../../types/places";

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
  const markersRef = useRef<Map<string, import("leaflet").Marker>>(new Map());
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const bottomSheetRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const updateIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);

    const stopRenderFrame = () => {
      if (renderFrameRef.current !== null) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = null;
      }
    };

    const initializeMap = async () => {
      const L = await import("leaflet");

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

      const renderClusters = (clusters: ClusterResult[]) => {
        if (!markerLayerRef.current) return;

        stopRenderFrame();
        markerLayerRef.current.clearLayers();

        markersRef.current.clear();

        const tasks = clusters.map((clusterItem) => () => {
          if (!markerLayerRef.current) return;

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
          const icon = createPinIcon(clusterItem.verification);
          const marker = L.marker([lat, lng], { icon });
          marker.on("click", (event: import("leaflet").LeafletMouseEvent) => {
            event.originalEvent.stopPropagation();
            setSelectedPlaceId(clusterItem.id);
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
        if (!markerLayerRef.current || !clusterIndexRef.current) return;
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

      const fetchPlacesAndBuildIndex = async () => {
        try {
          const response = await fetch("/api/places");
          if (!response.ok) {
            throw new Error(`Failed to fetch places: ${response.statusText}`);
          }
          const fetchedPlaces: Place[] = await response.json();
          if (!isMounted) return;
          setPlaces(fetchedPlaces);
          const pins = fetchedPlaces.map(placeToPin);
          clusterIndexRef.current = createSuperclusterIndex(pins);
          updateVisibleMarkers();
        } catch (error) {
          console.error(error);
        }
      };

      map.on("moveend zoomend", updateVisibleMarkers);
      map.on("click", () => {
        setSelectedPlaceId(null);
      });
      mapInstanceRef.current = map;

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
  }, []);

  const selectedPlace =
    selectedPlaceId && places.length
      ? places.find((place) => place.id === selectedPlaceId) ?? null
      : null;

  useEffect(() => {
    markersRef.current.forEach((marker, id) => {
      const element = marker.getElement();
      const isSelected = id === selectedPlaceId;
      const pin = element?.querySelector(".cpm-pin");
      if (pin) {
        pin.classList.toggle("cpm-pin-selected", isSelected);
      }
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    });
  }, [selectedPlaceId]);

  useEffect(() => {
    if (!selectedPlaceId) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (drawerRef.current && event.target instanceof Node) {
        if (drawerRef.current.contains(event.target)) {
          return;
        }
      }

      if (bottomSheetRef.current && event.target instanceof Node) {
        if (bottomSheetRef.current.contains(event.target)) {
          return;
        }
      }

      setSelectedPlaceId(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [selectedPlaceId]);

  return (
    <>
      <div className="relative w-full min-h-screen">
        <div
          id="map"
          ref={mapContainerRef}
          data-selected-place={selectedPlaceId ?? ""}
          className="absolute inset-0 h-[calc(100vh)] w-full"
        />
      </div>
      <RightDrawer
        place={selectedPlace}
        isOpen={!isMobile && Boolean(selectedPlace)}
        onClose={() => setSelectedPlaceId(null)}
        ref={drawerRef}
      />
      {isMobile && (
        <MobileBottomSheet
          place={selectedPlace}
          isOpen={Boolean(selectedPlace)}
          onClose={() => setSelectedPlaceId(null)}
          ref={bottomSheetRef}
        />
      )}
    </>
  );
}
