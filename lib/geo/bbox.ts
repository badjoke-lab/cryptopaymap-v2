export type ParsedBbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const parseBbox = (
  value: string | null,
): { bbox: ParsedBbox[] | null; error?: string } => {
  if (!value) return { bbox: null };

  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 4) return { bbox: null, error: "INVALID_BBOX" };

  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n))) return { bbox: null, error: "INVALID_BBOX" };

  const [rawMinLng, rawMinLat, rawMaxLng, rawMaxLat] = nums;

  // latitude: clamp then order
  const minLatCandidate = clamp(rawMinLat, -90, 90);
  const maxLatCandidate = clamp(rawMaxLat, -90, 90);
  const minLat = Math.min(minLatCandidate, maxLatCandidate);
  const maxLat = Math.max(minLatCandidate, maxLatCandidate);

  // longitude: if outside world bounds, clamp to [-180,180] and continue (do NOT error)
  const outOfRangeLng =
    rawMinLng < -180 || rawMinLng > 180 || rawMaxLng < -180 || rawMaxLng > 180;

  if (outOfRangeLng) {
    let minLng = clamp(rawMinLng, -180, 180);
    let maxLng = clamp(rawMaxLng, -180, 180);

    // if clamping produces invalid or degenerate range, treat as full world
    if (minLng >= maxLng) {
      minLng = -180;
      maxLng = 180;
    } else {
      const a = minLng, b = maxLng;
      minLng = Math.min(a, b);
      maxLng = Math.max(a, b);
    }

    return { bbox: [{ minLng, minLat, maxLng, maxLat }] };
  }

  // normal in-range case: support antimeridian split
  const minLng = rawMinLng;
  const maxLng = rawMaxLng;

  if (minLng > maxLng) {
    return {
      bbox: [
        { minLng, minLat, maxLng: 180, maxLat },
        { minLng: -180, minLat, maxLng, maxLat },
      ],
    };
  }

  if (minLng === maxLng) return { bbox: null, error: "INVALID_BBOX" };

  return { bbox: [{ minLng, minLat, maxLng, maxLat }] };
};
