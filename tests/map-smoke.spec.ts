import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = process.env.PW_BASE_URL || "http://127.0.0.1:3201";
const PROBE = process.env.PW_DEBUG_PROBE === "1";

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

const FIXTURE_PATH = path.join(__dirname, "fixtures", "places.sample.json");
const PLACES_FIXTURE_RAW = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
const PLACES_FIXTURE = extractPlaces(PLACES_FIXTURE_RAW);
const FIXTURE_COUNT = PLACES_FIXTURE.length;

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

async function mockPlacesRoute(page: import("@playwright/test").Page) {
  await page.route("**/api/places**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/places") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(PLACES_FIXTURE_RAW),
      });
      return;
    }
    await route.continue();
  });
}

async function waitForPinIcons(page: import("@playwright/test").Page, minCount = 1) {
  await expect
    .poll(async () => await page.locator(".leaflet-marker-icon").count(), { timeout: 20000 })
    .toBeGreaterThanOrEqual(minCount);
  return await page.locator(".leaflet-marker-icon").count();
}

test("map smoke: map renders and pins appear when /api/places returns data", async ({ page }) => {
  await mockPlacesRoute(page);

  // health（CIはDB無しで503があり得る）
  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  // /api/places（クエリ付きでも拾う）を待つ
  const __placesT0 = Date.now();

  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;

  const __pinIcons = await waitForPinIcons(page, Math.max(1, FIXTURE_COUNT));

  console.log(`[perf] places ms=${Date.now()-__placesT0} status=${placesRes.status()} pinIcons=${__pinIcons}`);
  let placesJson: any = null;
  try {
    placesJson = await placesRes.json();
  } catch {}

  const placesCount = extractCount(placesJson);
  expect(placesRes.status()).toBe(200);
  expect(placesCount).toBe(FIXTURE_COUNT);
  expect(__pinIcons).toBeGreaterThanOrEqual(FIXTURE_COUNT);

  // ピン/マーカーが出る
  const cpmPins = page.locator(".cpm-pin");
  const leafletPins = page.locator(".leaflet-marker-icon");

  await expect
    .poll(async () => (await cpmPins.count()) + (await leafletPins.count()), { timeout: 20000 })
    .toBeGreaterThan(0);
});

test("map smoke: selecting a place from the mobile sheet opens the drawer", async ({ page }) => {
  await mockPlacesRoute(page);

  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  const __placesT0 = Date.now();


  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;

  const __pinIcons = await waitForPinIcons(page, Math.max(1, FIXTURE_COUNT));

  console.log(`[perf] places ms=${Date.now()-__placesT0} status=${placesRes.status()} pinIcons=${__pinIcons}`);
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

  // Drawer が開く（data-testid を使う）
  const drawer = page.locator('[data-testid="place-drawer"]');
  await expect(drawer).toHaveClass(/\bopen\b/, { timeout: 20000 });
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
});


test("map smoke: clicking a map marker opens the drawer (anti-overlay)", async ({ page }) => {
  await mockPlacesRoute(page);

  const health = await page.request.get(`${BASE_URL}/api/health`);
  expect([200, 503]).toContain(health.status());

  const __placesT0 = Date.now();


  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });
  const placesRes = await placesResPromise;
  const __pinIcons = await waitForPinIcons(page, Math.max(1, FIXTURE_COUNT));
  console.log(`[perf] places ms=${Date.now()-__placesT0} status=${placesRes.status()} pinIcons=${__pinIcons}`);
  let placesJson: any = null;
  try { placesJson = await placesRes.json(); } catch {}
  const places = extractPlaces(placesJson);
  const firstWithLabel = places.map(pickLabel).find(Boolean) as string | undefined;

  const cpmPins = page.locator(".cpm-pin");
  const markerIcons = page.locator(".leaflet-marker-icon");
  const clusterMarkers = page.locator(".marker-cluster, .cluster-marker");
  const singleMarkers = page.locator(
    ".leaflet-marker-icon:not(.marker-cluster):not(.cluster-marker)"
  );
  const interactive = page.locator(".leaflet-interactive");

  await expect
    .poll(
      async () =>
        (await cpmPins.count()) + (await markerIcons.count()) + (await interactive.count()),
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);

  const drawer = page.locator('[data-testid="place-drawer"]');
  const antiState = {
    attempt: 0,
    kind: "none",
    zoom: 0,
    markers: 0,
    markersNote: "incl.cluster",
    drawer: "notfound" as "ok" | "timeout" | "notfound",
    label: firstWithLabel ?? "",
  };

  const isDrawerOpen = async () => {
    const cnt = await drawer.count();
    if (cnt === 0) return false;
    const first = drawer.first();
    const [isVisible, className] = await Promise.all([
      first
        .getAttribute("aria-hidden")
        .then((value) => value === "false")
        .catch(() => false),
      first.getAttribute("class").catch(() => ""),
    ]);
    return Boolean(isVisible && className?.split(/\s+/).includes("open"));
  };

  const clickMarker = async (
    target: import("@playwright/test").Locator,
    options: { force?: boolean }
  ) => {
    if ((await target.count()) === 0) return;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) {
      await target.click({ force: options.force ?? false });
      return;
    }
    const __cx = box.x + box.width / 2;
    const __cy = box.y + box.height / 2;
    if (PROBE) {
      const info = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        const closest = el && (el.closest ? el.closest(".leaflet-marker-icon") : null);
        return {
          hitTag: el ? el.tagName : null,
          hitId: el && el.id ? el.id : "",
          hitClass: el && el.className ? el.className.toString() : "",
          closestClass: closest && closest.className ? closest.className.toString() : "",
        };
      }, { x: __cx, y: __cy });
      console.log(
        `[clickprobe] x=${Math.round(__cx)} y=${Math.round(__cy)} hit=${info.hitTag ?? "null"} id=${info.hitId} class=${info.hitClass} closest=${info.closestClass || "null"}`
      );
      const __stack = await page.evaluate(({ x, y }) => {
        const els = document.elementsFromPoint
          ? document.elementsFromPoint(x, y)
          : [document.elementFromPoint(x, y)];
        return Array.from(els)
          .filter(Boolean)
          .slice(0, 6)
          .map((el) => ({
            tag: el.tagName,
            id: el.id || "",
            className: (el.className || "").toString(),
          }));
      }, { x: __cx, y: __cy });
      console.log(`[clickprobe-stack] ${JSON.stringify(__stack)}`);
    }
    if (options.force) {
      await target.click({ force: true });
    } else {
      await page.mouse.click(__cx, __cy);
    }
  };

  try {
    antiState.markers = await markerIcons.count();

    const MAX_RETRIES = 6;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (await isDrawerOpen()) break;
      antiState.attempt = attempt + 1;

      if ((await singleMarkers.count()) > 0) {
        antiState.kind = "marker";
        await clickMarker(singleMarkers.first(), { force: false });
        try {
          await expect.poll(async () => await isDrawerOpen(), { timeout: 4000 }).toBeTruthy();
        } catch {}
      } else if ((await clusterMarkers.count()) > 0) {
        antiState.kind = "cluster";
        await clickMarker(clusterMarkers.first(), { force: false });
        await page.waitForTimeout(400);
      } else if ((await markerIcons.count()) > 0) {
        antiState.kind = "marker";
        await clickMarker(markerIcons.first(), { force: false });
        await page.waitForTimeout(400);
      }

      if (await isDrawerOpen()) break;

      const zoomIn = page.locator(".leaflet-control-zoom-in");
      antiState.zoom += 1;
      if (await zoomIn.count()) {
        await zoomIn.click();
      } else {
        await page.mouse.wheel(0, -800);
      }
      await page.waitForTimeout(300);
    }

    if (!(await isDrawerOpen())) {
      const fallbackTarget =
        (await singleMarkers.count()) > 0
          ? { kind: "marker", target: singleMarkers.first() }
          : (await clusterMarkers.count()) > 0
            ? { kind: "cluster", target: clusterMarkers.first() }
            : (await markerIcons.count()) > 0
              ? { kind: "marker", target: markerIcons.first() }
              : (await cpmPins.count()) > 0
                ? { kind: "forceClick", target: cpmPins.first() }
                : { kind: "fallback", target: interactive.first() };
      antiState.kind = fallbackTarget.kind;
      await clickMarker(fallbackTarget.target, { force: true });
    }

    // final assert: drawer open-state (not flaky visible)
    await expect.poll(async () => await isDrawerOpen(), { timeout: 20000 }).toBeTruthy();
    antiState.drawer = "ok";
  } catch (error) {
    if (!(await isDrawerOpen())) {
      antiState.drawer = "timeout";
    }
    throw error;
  } finally {
    const markersInfo = `${antiState.markers}(${antiState.markersNote})`;
    console.log(
      `[anti] attempt=${antiState.attempt} kind=${antiState.kind} zoom=${antiState.zoom} markers=${markersInfo} drawer=${antiState.drawer} label=${antiState.label}`
    );
  }
});
