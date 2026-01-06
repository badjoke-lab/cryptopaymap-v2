import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PW_BASE_URL || "http://127.0.0.1:3201";

// CI/ローカルで同じ挙動に寄せる（モバイルUIを強制）
test.use({ viewport: { width: 420, height: 820 } });

// /api/places の返却形式がどれでも配列を取り出す
function extractPlaces(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.places)) return json.places;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.features)) {
    // GeoJSON FeatureCollection
    return json.features.map((f: any) => f?.properties ?? f);
  }
  return [];
}

function extractCount(json: any): number | null {
  const arr = extractPlaces(json);
  return arr.length ? arr.length : null;
}

function pickLabel(place: any): string | null {
  const cand =
    place?.name ??
    place?.business_name ??
    place?.title ??
    place?.display_name ??
    place?.label ??
    null;
  if (!cand) return null;
  const s = String(cand).trim();
  return s.length ? s : null;
}

test("map smoke: map renders and pins appear when /api/places returns data", async ({ page }) => {
  // health（CIはDB無しで503があり得る）
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  // /api/places（クエリ付きでも拾う）を待つ
  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;
  let placesJson: any = null;
  try {
    placesJson = await placesRes.json();
  } catch {}

  const placesCount = extractCount(placesJson);
  expect(placesCount).not.toBeNull();
  expect(placesCount as number).toBeGreaterThan(0);

  // ピン/マーカーが出る
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);
});

test("map smoke: selecting a place from the mobile sheet opens the drawer", async ({ page }) => {
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;

  // places の中身から「画面に出そうな店名」を取る
  let placesJson: any = null;
  try {
    placesJson = await placesRes.json();
  } catch {}
  const places = extractPlaces(placesJson);
  const firstWithLabel = places.map(pickLabel).find(Boolean) as string | undefined;

  expect(firstWithLabel, "could not infer a place name from /api/places response").toBeTruthy();

  // モバイルのフィルタ/リストUIを開く
  const toggle = page.locator('[data-testid="map-filters-toggle"]');
  await expect(toggle).toBeVisible({ timeout: 20000 });
  await toggle.click({ force: true });

  const sheet = page.locator('[data-testid="mobile-filters-sheet"]');
  await expect(sheet).toBeVisible({ timeout: 20000 });

  // sheet 内で店名をクリック（見つからない場合は「クリック可能要素の先頭」を押す）
  const byName = sheet.getByText(firstWithLabel!, { exact: false }).first();
  if ((await byName.count()) > 0) {
    await byName.scrollIntoViewIfNeeded();
    await byName.click({ force: true });
  } else {
    const fallback = sheet.locator('button, a, [role="button"]').first();
    await expect(fallback).toBeVisible({ timeout: 20000 });
    await fallback.click({ force: true });
  }

  // Drawer が開く（Drawer.tsx の aria-label を使う）
  const drawer = page.locator('[aria-label="Place details"]');
  await expect(drawer).toHaveClass(/\bopen\b/, { timeout: 20000 });
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
});


test("map smoke: clicking a map marker opens the drawer (anti-overlay)", async ({ page }) => {
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });
  await placesResPromise;

  const cpmPins = page.locator(".cpm-pin");
  const markerIcons = page.locator(".leaflet-marker-icon:not(.marker-cluster)");
  const interactive = page.locator(".leaflet-interactive");

  await expect
    .poll(
      async () =>
        (await cpmPins.count()) + (await markerIcons.count()) + (await interactive.count()),
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);

  const drawer = page.locator('[aria-label="Place details"]');

  let target = markerIcons.first();
  if ((await markerIcons.count()) === 0) {
    target = (await cpmPins.count()) > 0 ? cpmPins.first() : interactive.first();
  }

  await target.scrollIntoViewIfNeeded();
  await target.click({ force: true });

  await expect(drawer).toHaveClass(/\bopen\b/, { timeout: 20000 });
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
});
