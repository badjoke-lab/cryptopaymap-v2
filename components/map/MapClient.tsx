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
import PCMapCard from "./PCMapCard";
import type { Place } from "../../types/places";

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

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
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

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
      const iconSize: [number, number] = [32, 32];
      const iconAnchor: [number, number] = [16, 32];

      const iconMap: Record<PinType, import("leaflet").Icon> = {
        owner: L.icon({
          iconUrl: "/pins/owner.svg?v=2",
          iconSize,
          iconAnchor,
        }),
        community: L.icon({
          iconUrl: "/pins/community.svg?v=2",
          iconSize,
          iconAnchor,
        }),
        directory: L.icon({
          iconUrl: "/pins/directory.svg?v=2",
          iconSize,
          iconAnchor,
        }),
        unverified: L.icon({
          iconUrl: "/pins/unverified.svg?v=2",
          iconSize,
          iconAnchor,
        }),
      };

      const markerLayer = L.layerGroup();
      markerLayer.addTo(map);
      markerLayerRef.current = markerLayer;

      const renderClusters = (clusters: ClusterResult[]) => {
        if (!markerLayerRef.current) return;

        stopRenderFrame();
        markerLayerRef.current.clearLayers();

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
          const icon = iconMap[clusterItem.verification];
          const marker = L.marker([lat, lng], { icon });
          marker.on("click", (event: import("leaflet").LeafletMouseEvent) => {
            event.originalEvent.stopPropagation();
            setSelectedPlaceId((current) => {
              const nextValue = current === clusterItem.id ? null : clusterItem.id;
              return nextValue;
            });
          });
          markerLayerRef.current.addLayer(marker);
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

  return (
    <>
      <PCMapCard place={selectedPlace} />
      <div
        id="map"
        ref={mapContainerRef}
        data-selected-place={selectedPlaceId ?? ""}
        style={{ height: "100vh", width: "100%", position: "relative" }}
      />
    </>
  );
}
