
/**
 * Dynamically loads the Leaflet MarkerCluster plugin and returns a configured cluster group.
 *
 * This helper keeps imports client-side to avoid SSR issues.
 */
export async function createMarkerClusterGroup(
  L: typeof import('leaflet'),
  options?: MarkerClusterGroupOptions
) {
  await import('leaflet.markercluster');
  return L.markerClusterGroup(options);
}
