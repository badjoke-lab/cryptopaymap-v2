export type ParsedBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

export type BboxMeta = {
  bboxClamped: true;
  original: string;
  normalized: string;
};

export const parseBbox = (
  value: string | null,
): { bbox: ParsedBbox[] | null; error?: string; meta?: BboxMeta } => {
  if (!value) return { bbox: null };
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 4) {
    return { bbox: null, error: "bbox must be four comma-separated numbers" };
  }
  const [rawMinLng, rawMinLat, rawMaxLng, rawMaxLat] = parts.map((part) => Number.parseFloat(part));
  if (![rawMinLng, rawMinLat, rawMaxLng, rawMaxLat].every((num) => Number.isFinite(num))) {
    return { bbox: null, error: "bbox must contain valid numbers" };
  }

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const minLatCandidate = clamp(rawMinLat, -90, 90);
  const maxLatCandidate = clamp(rawMaxLat, -90, 90);
  const minLat = Math.min(minLatCandidate, maxLatCandidate);
  const maxLat = Math.max(minLatCandidate, maxLatCandidate);

  const minLngCandidate = clamp(rawMinLng, -180, 180);
  const maxLngCandidate = clamp(rawMaxLng, -180, 180);
  let minLng = minLngCandidate;
  let maxLng = maxLngCandidate;
  let clamped = minLngCandidate !== rawMinLng || maxLngCandidate !== rawMaxLng;

  if (minLng >= maxLng) {
    minLng = -180;
    maxLng = 180;
    clamped = true;
  }

  const meta = clamped
    ? { bboxClamped: true, original: value, normalized: `${minLng},${minLat},${maxLng},${maxLat}` }
    : undefined;

  return { bbox: [{ minLng, minLat, maxLng, maxLat }], meta };
};
