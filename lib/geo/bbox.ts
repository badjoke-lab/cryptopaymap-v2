export type ParsedBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const wrapLng = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;

export const parseBbox = (
  value: string | null,
): { bbox: ParsedBbox[] | null; error?: string } => {
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

  const minLng = wrapLng(rawMinLng);
  const maxLng = wrapLng(rawMaxLng);

  if (minLng > maxLng) {
    return {
      bbox: [
        { minLng, minLat, maxLng: 180, maxLat },
        { minLng: -180, minLat, maxLng, maxLat },
      ],
    };
  }

  return { bbox: [{ minLng, minLat, maxLng, maxLat }] };
};
