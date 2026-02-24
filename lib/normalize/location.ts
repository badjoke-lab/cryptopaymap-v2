const SPACE_RE = /\s+/g;

export const normalizeLocationValue = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().replace(SPACE_RE, " ").toLowerCase();
};

export const normalizeCountry = normalizeLocationValue;
export const normalizeCity = normalizeLocationValue;
export const normalizeCategory = normalizeLocationValue;

export const normalizeLocationSql = (columnSql: string) =>
  `LOWER(REGEXP_REPLACE(BTRIM(COALESCE(${columnSql}, '')), '\\s+', ' ', 'g'))`;
