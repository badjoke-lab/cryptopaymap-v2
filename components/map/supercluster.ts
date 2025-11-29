"use client";

import Supercluster from "supercluster";
import type { Feature, Point } from "geojson";

export type PinType = "owner" | "community" | "directory" | "unverified";

export type Pin = {
  id: string;
  lat: number;
  lng: number;
  type: PinType;
};

export type ClusterPoint = {
  type: "cluster";
  id: number;
  coordinates: [number, number];
  pointCount: number;
};

export type SinglePoint = {
  type: "point";
  id: string;
  coordinates: [number, number];
  pinType: PinType;
};

export type ClusterResult = ClusterPoint | SinglePoint;

export function createSuperclusterIndex(pins: Pin[]) {
  const index = new Supercluster<{
    id: string;
    type: PinType;
  }>({
    radius: 80,
    maxZoom: 18,
  });

  const features: Feature<Point, { id: string; type: PinType }>[] = pins.map(
    (pin) => ({
      type: "Feature",
      properties: { id: pin.id, type: pin.type },
      geometry: {
        type: "Point",
        coordinates: [pin.lng, pin.lat],
      },
    }),
  );

  index.load(features);

  return {
    getClusters(bbox: [number, number, number, number], zoom: number): ClusterResult[] {
      return index.getClusters(bbox, Math.round(zoom)).map((feature) => {
        const coordinates = feature.geometry.coordinates as [number, number];

        if ((feature.properties as any).cluster) {
          return {
            type: "cluster" as const,
            id: feature.id as number,
            coordinates,
            pointCount: (feature.properties as any).point_count as number,
          } satisfies ClusterPoint;
        }

        return {
          type: "point" as const,
          id: (feature.properties as any).id as string,
          coordinates,
          pinType: (feature.properties as any).type as PinType,
        } satisfies SinglePoint;
      });
    },
    getClusterExpansionZoom(clusterId: number) {
      return index.getClusterExpansionZoom(clusterId);
    },
  };
}
