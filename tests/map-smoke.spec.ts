import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL || "http://127.0.0.1:3201";

// /api/places の返却形式がどれでも数を拾えるようにする
function extractCount(json: any): number | null {
  if (!json) return null;
  if (Array.isArray(json)) return json.length; // [] 形式
  if (Array.isArray(json.places)) return json.places.length; // { places: [] }
  if (Array.isArray(json.items)) return json.items.length; // { items: [] }
  if (Array.isArray(json.features)) return json.features.length; // GeoJSON
  if (Array.isArray(json.data)) return json.data.length; // { data: [] }
  return null;
}

test("map smoke: map renders and pins appear when /api/places returns data", async ({ page }) => {
  // health (CIではDBなしで503になり得るので 200/503 を許容)
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  // /api/places（クエリ付きでも拾う）を待つ
  const placesResPromise = page.waitForResponse(
    (r) => {
      if (r.request().method() !== "GET") return false;
      if (!r.url().includes("/api/places")) return false;
      return r.status() === 200;
    },
    { timeout: 20000 }
  );

  // /map open
  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });

  // Leaflet container visible
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  // /api/places の中身を確認
  const placesRes = await placesResPromise;
  let placesJson: any = null;
  try {
    placesJson = await placesRes.json();
  } catch {
    // JSONじゃないなら異常
  }

  const placesCount = extractCount(placesJson);
  expect(placesCount).not.toBeNull();
  expect(placesCount as number).toBeGreaterThan(0);

  // ピン/マーカーが出る（DivIcon .cpm-pin 優先、なければ Leaflet marker icon を許容）
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);
});

test("map smoke: clicking a pin opens the place drawer", async ({ page }) => {
  // health (CIではDBなしで503になり得るので 200/503 を許容)
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  // places list を待つ（クエリ付きでも拾う）
  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  // places が来るのを待つ（pins生成の前提）
  await placesResPromise;

  // pins が出るまで待つ
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);

  // クリック対象を選ぶ（.cpm-pin 優先）
  const cpmCount = await cpmPins.count();
  const target = cpmCount > 0 ? cpmPins.first() : leafletPins.first();

  // クリック（地図UIは重なりがちなので force）
  await target.click({ force: true });

  // Drawer が開く（Drawer.tsx の aria-label を使う）
  const drawer = page.locator('[aria-label="Place details"]');
  await expect(drawer).toBeVisible({ timeout: 20000 });
});
