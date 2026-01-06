import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL || "http://127.0.0.1:3201";

// /api/places の返却形式がどれでも数を拾えるようにする
function extractCount(json: any): number | null {
  if (!json) return null;
  if (Array.isArray(json)) return json.length;                // [] 形式
  if (Array.isArray(json.places)) return json.places.length;  // { places: [] }
  if (Array.isArray(json.items)) return json.items.length;    // { items: [] }
  if (Array.isArray(json.features)) return json.features.length; // GeoJSON
  if (Array.isArray(json.data)) return json.data.length;      // { data: [] }
  return null;
}

test("map smoke: map renders and pins appear when /api/places returns data", async ({ page }) => {
  // health
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect(health.ok()).toBeTruthy();

  // 「/api/places を1回でも呼んで200になる」ことを待つ（クエリ付きも拾う）
  const placesResPromise = page.waitForResponse((r) => {
    if (r.request().method() !== "GET") return false;
    if (!r.url().includes("/api/places")) return false; // ← ここが重要（?bbox=... でも拾う）
    return r.status() === 200;
  }, { timeout: 20000 });

  // /map open
  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });

  // Leaflet container visible
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  // /api/places を待って中身を確認
  const placesRes = await placesResPromise;
  let placesJson: any = null;
  try {
    placesJson = await placesRes.json();
  } catch {
    // JSONじゃないなら異常（テストの前提崩れ）
  }

  const placesCount = extractCount(placesJson);

  // 前提チェック（ここで落ちるなら「APIを拾えてない」か「返却形式が想定外」）
  expect(placesCount).not.toBeNull();
  expect(placesCount as number).toBeGreaterThan(0);

  // ピン/マーカーが出る（DivIconの .cpm-pin 優先、なければ Leaflet marker icon を許容）
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  const cpmCount = await cpmPins.count();
  const leafletCount = await leafletPins.count();

  expect(cpmCount + leafletCount).toBeGreaterThan(0);
});
