"use client";

// MarkerCluster の CSS を先に読み込む（必須）
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

export async function createMarkerClusterGroup(
  L: typeof import("leaflet")
) {
  // plugin を読み込み
  const plugin = await import("leaflet.markercluster");

  // Next.js環境では default / named / wrapper すべての可能性を吸収してバインド
  const initializer =
    plugin.default ||
    plugin.LeafletMarkerCluster ||
    plugin.markerClusterGroup ||
    plugin;

  // initializer が関数なら L にバインドする
  if (typeof initializer === "function") {
    initializer(L);
  }

  // L.markerClusterGroup が存在しない場合はエラー
  if (typeof (L as any).markerClusterGroup !== "function") {
    console.error("MarkerClusterGroup was NOT initialized:", {
      plugin,
      initializer,
      L,
    });
    throw new Error("Leaflet.markercluster failed to initialize");
  }

  // 必ず関数が返る（ここに来れば100%成功）
  return (L as any).markerClusterGroup({
    chunkedLoading: true,
    showCoverageOnHover: false,
    removeOutsideVisibleBounds: true,
  });
}
