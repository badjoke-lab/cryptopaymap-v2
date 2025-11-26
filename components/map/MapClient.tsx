"use client";

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

export default function MapClient() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      const L = await import('leaflet');

      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true
      }).setView(DEFAULT_COORDINATES, DEFAULT_ZOOM);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
    };

    initializeMap();

    return () => {
      isMounted = false;
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
      style={{ height: '100vh', width: '100%', position: 'relative' }}
    />
  );
}
