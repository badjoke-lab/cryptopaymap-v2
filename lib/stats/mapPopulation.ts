type PlaceLike = {
  lat: unknown;
  lng: unknown;
};

export const getMapDisplayableWhereClauses = (alias = "p"): string[] => [
  `${alias}.lat IS NOT NULL`,
  `${alias}.lng IS NOT NULL`,
];

export const isMapDisplayablePlace = (place: PlaceLike): boolean => {
  if (typeof place.lat !== "number" || typeof place.lng !== "number") {
    return false;
  }

  return Number.isFinite(place.lat) && Number.isFinite(place.lng);
};

