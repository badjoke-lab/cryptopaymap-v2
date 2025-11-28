// components/map/cluster.ts
// 必ず "use client" を付ける
"use client";

import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export async function createMarkerClusterGroup(
  L: typeof import("leaflet")
) {
  // plugin をロード
  const mod = await import("leaflet.markercluster");

  // Next.js 環境で plugin が L にバインドされない問題を防ぐ
  // @ts-ignore
  const bind = mod.default ?? mod;
  if (bind) {
    // @ts-ignore
    bind(L);
  }

  // plugin バインド後なら確実に存在する
  // @ts-ignore
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    chunkedLoading: true,
  });
}
