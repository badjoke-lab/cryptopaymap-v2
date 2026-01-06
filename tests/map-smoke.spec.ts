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

  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);
});

test("map smoke: clicking a marker triggers place details (drawer or detail request)", async ({ page }) => {
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  // places list を待つ（クエリ付きでも拾う）
  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });
  await placesResPromise;

  // ピンが出るまで待つ
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);

  // クラスタを避けたいので "marker-cluster 以外" の marker icon を優先
  const nonClusterMarker = page.locator(".leaflet-marker-icon:not(.marker-cluster)").first();
  const target =
    (await nonClusterMarker.count()) > 0
      ? nonClusterMarker
      : (await cpmPins.count()) > 0
        ? cpmPins.first()
        : leafletPins.first();

  // 「詳細APIのリクエストが飛ぶ」パターンも拾う（成功/失敗は問わない）
  // /api/places?... は一覧なので除外して、/api/places/<id> のみを拾う
  let detailRequested = false;
  const detailReqPromise = page
    .waitForRequest(
      (req) => {
        if (req.method() !== "GET") return false;
        const u = new URL(req.url());
        return /^\/api\/places\/[^/]+$/.test(u.pathname);
      },
      { timeout: 15000 }
    )
    .then(() => {
      detailRequested = true;
    })
    .catch(() => {});

  // Drawerが見えるパターンも拾う（aria-labelが変わっても耐えるように広め）
  const drawer = page.locator(
    '[aria-label="Place details"], [role="dialog"], [role="complementary"]'
  );

  await target.click({ force: true });

  // どちらかが起きればOK（スモークとして「導線が生きてる」保証）
  try {
    await Promise.race([
      detailReqPromise,
      drawer.first().waitFor({ state: "visible", timeout: 15000 }),
    ]);
  } catch {
    // race両方落ちは後で判定
  }

  const drawerExists = (await drawer.count()) > 0;
  expect(detailRequested || drawerExists).toBeTruthy();
});
