/**
 * Regression verifier: detect bbox-driven loading regressions (e.g., "always first 200").
 *
 * - CI-safe:
 *   - If BASE_URL is missing in CI, SKIP (exit 0)
 * - Strong-ish:
 *   - Query multiple candidate bboxes.
 *   - Find two bboxes with non-empty results.
 *   - Fail if the ID sets are identical (suggests bbox ignored / cache key missing bbox).
 */

import process from "node:process";

const isCI = String(process.env.CI || "").toLowerCase() === "true";
const skip = String(process.env.SKIP_VERIFY_REGRESSION || "") === "1";

const rawBase =
  process.env.BASE_URL ||
  process.env.REGRESSION_BASE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "";

if (skip) {
  console.log("[verify] SKIP: SKIP_VERIFY_REGRESSION=1");
  process.exit(0);
}

if (!rawBase) {
  const msg = "[verify] BASE_URL is not set.";
  if (isCI) {
    console.log(`${msg} CI mode => skipping regression verification.`);
    process.exit(0);
  }
  console.error(`${msg} Example: BASE_URL=http://localhost:3000 node scripts/verify_regression.mjs`);
  process.exit(1);
}

const baseUrl = rawBase.replace(/\/+$/, "");

const candidates = [
  { name: "Tokyo", bbox: "139.60,35.55,139.90,35.80" },
  { name: "NewYork", bbox: "-74.10,40.55,-73.70,40.90" },
  { name: "London", bbox: "-0.25,51.45,0.10,51.60" },
  { name: "Singapore", bbox: "103.78,1.24,104.00,1.38" },
  { name: "Bangkok", bbox: "100.45,13.65,100.75,13.85" },
];

const timeoutFetchJson = async (url, timeoutMs = 20000) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "accept": "application/json" } });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Non-JSON response. status=${res.status} body=${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
    }
    return json;
  } finally {
    clearTimeout(t);
  }
};

const extractItems = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload?.places && Array.isArray(payload.places)) return payload.places;
  if (payload?.items && Array.isArray(payload.items)) return payload.items;
  if (payload?.features && Array.isArray(payload.features)) return payload.features;
  return [];
};

const getId = (item) => {
  if (!item || typeof item !== "object") return null;
  return (
    item.id ??
    item.place_id ??
    item.placeId ??
    item.slug ??
    item.uid ??
    null
  );
};

const fetchIdsForBbox = async (bbox, limit = 200) => {
  const url = `${baseUrl}/api/places?bbox=${encodeURIComponent(bbox)}&limit=${encodeURIComponent(String(limit))}`;
  const payload = await timeoutFetchJson(url);
  const items = extractItems(payload);
  const ids = items.map(getId).filter(Boolean);
  return { url, count: ids.length, ids };
};

const setsEqual = (a, b) => {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
};

(async () => {
  console.log(`[verify] baseUrl=${baseUrl}`);
  console.log("[verify] fetching candidates...");

  const results = [];
  for (const c of candidates) {
    try {
      const r = await fetchIdsForBbox(c.bbox, 200);
      console.log(`[verify] ${c.name}: count=${r.count} url=${r.url}`);
      results.push({ ...c, ...r });
    } catch (e) {
      console.log(`[verify] ${c.name}: ERROR ${String(e?.message || e)}`);
      results.push({ ...c, url: null, count: 0, ids: [] });
    }
  }

  const nonEmpty = results.filter(r => r.count > 0);
  if (nonEmpty.length < 2) {
    const msg = "[verify] Not enough non-empty bbox results to compare.";
    if (isCI) {
      console.log(msg + " CI mode => skipping.");
      process.exit(0);
    }
    console.error(msg);
    process.exit(1);
  }

  // pick A as first non-empty, B as first other non-empty
  const A = nonEmpty[0];
  let B = null;
  for (let i = 1; i < nonEmpty.length; i += 1) {
    B = nonEmpty[i];
    break;
  }

  const setA = new Set(A.ids);
  const setB = new Set(B.ids);

  if (setsEqual(setA, setB)) {
    console.error("[verify] FAIL: ID sets are identical across two different bboxes.");
    console.error(`  A=${A.name} bbox=${A.bbox} count=${A.count}`);
    console.error(`  B=${B.name} bbox=${B.bbox} count=${B.count}`);
    console.error("  This suggests bbox is ignored or cache key does not include bbox (\"fixed 200\" regression).");
    process.exit(2);
  }

  console.log("[verify] PASS: bbox results differ (bbox likely affects /api/places).");
  console.log(`  A=${A.name} count=${A.count}`);
  console.log(`  B=${B.name} count=${B.count}`);
  process.exit(0);
})().catch((e) => {
  console.error("[verify] ERROR:", e);
  process.exit(isCI ? 0 : 1);
});
