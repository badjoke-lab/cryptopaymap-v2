"use client";

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import './map.css';
import { createMarkerClusterGroup } from './cluster';

const DEFAULT_COORDINATES: [number, number] = [20, 0];
const DEFAULT_ZOOM = 2;

const mockPlaces = [
  { id: '1', lat: 35.68, lng: 139.76, type: 'owner' },
  { id: '2', lat: 40.71, lng: -74.0, type: 'community' },
  { id: '3', lat: 48.85, lng: 2.35, type: 'directory' },
  { id: '4', lat: -33.86, lng: 151.2, type: 'unverified' }
] as const;

type PlaceType = (typeof mockPlaces)[number]['type'];

export default function MapClient() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    let isMounted = true;

    const initializeMap = async () => {
      const L = await import('leaflet');
      const LMC = await import('leaflet.markercluster');
      void LMC;

      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return;

      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true
      }).setView(DEFAULT_COORDINATES, DEFAULT_ZOOM);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const iconSize: [number, number] = [32, 32];
      const iconAnchor: [number, number] = [16, 32];

      const iconMap: Record<PlaceType, import('leaflet').Icon> = {
        owner: L.icon({
          iconUrl: '/pins/owner.svg',
          iconSize,
          iconAnchor
        }),
        community: L.icon({
          iconUrl: '/pins/community.svg',
          iconSize,
          iconAnchor
        }),
        directory: L.icon({
          iconUrl: '/pins/directory.svg',
          iconSize,
          iconAnchor
        }),
        unverified: L.icon({
          iconUrl: '/pins/unverified.svg',
          iconSize,
          iconAnchor
        })
      };

      const cluster = await createMarkerClusterGroup(L);

      mockPlaces.forEach((place) => {
        const icon = iconMap[place.type];
        cluster.addLayer(L.marker([place.lat, place.lng], { icon }));
      });

      cluster.addTo(map);
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
