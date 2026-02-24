export const MAP_POPULATION_CTE = "map_pop";
export const MAP_POPULATION_WHERE_VERSION = "pr253";

type PlaceLike = {
  lat: unknown;
  lng: unknown;
};

export const getMapPopulationWhereClauses = (alias = "p"): string[] => [
  `${alias}.lat IS NOT NULL`,
  `${alias}.lng IS NOT NULL`,
];

export const isMapPopulationPlace = (place: PlaceLike): boolean => {
  if (typeof place.lat !== "number" || typeof place.lng !== "number") {
    return false;
  }

  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
};

export const normalizeVerificationSql = (columnSql: string) =>
  `CASE
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'owner' THEN 'owner'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'community' THEN 'community'
    WHEN NULLIF(BTRIM(${columnSql}), '') = 'directory' THEN 'directory'
    ELSE 'unverified'
  END`;
