"use client";

import { useEffect, useRef } from "react";

// Leaflet core CSS
import "leaflet/dist/leaflet.css";

import "./map.css";
import {
  ClusterResult,
  Pin,
  PinType,
  createSuperclusterIndex,
} from "./supercluster";

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

// 仮データ（後で DB と接続）
const mockPlaces: Pin[] = [
  { id: "1", lat: 35.68, lng: 139.76, type: "owner" },
  { id: "2", lat: 40.71, lng: -74.0, type: "community" },
  { id: "3", lat: 48.85, lng: 2.35, type: "directory" },
  { id: "4", lat: -33.86, lng: 151.2, type: "unverified" },
];

export default function MapClient() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  const markerLayerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const renderFrameRef = useRef<number | null>(null);

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

      const clusterIndex = createSuperclusterIndex(mockPlaces);
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
              const expansionZoom = clusterIndex.getClusterExpansionZoom(
                clusterItem.id,
              );
              map.flyTo([lat, lng], expansionZoom, { animate: true });
            });

            markerLayerRef.current?.addLayer(marker);
            return;
          }

          const [lng, lat] = clusterItem.coordinates;
          const icon = iconMap[clusterItem.pinType];
          const marker = L.marker([lat, lng], { icon });
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
        if (!markerLayerRef.current) return;
        const bounds = map.getBounds();
        const bbox: [number, number, number, number] = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];

        const zoom = map.getZoom();
        const clusters = clusterIndex.getClusters(bbox, zoom);
        renderClusters(clusters);
      };

      map.on("moveend zoomend", updateVisibleMarkers);
      updateVisibleMarkers();
      mapInstanceRef.current = map;
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

  return (
    <div
      id="map"
      ref={mapContainerRef}
      style={{ height: "100vh", width: "100%", position: "relative" }}
    />
  );
}
