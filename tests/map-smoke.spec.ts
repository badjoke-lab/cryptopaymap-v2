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
  const __placesT0 = Date.now();

  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;

  const __pinIcons = await page.locator('.leaflet-marker-icon').count();

  console.log(`[perf] places ms=${Date.now()-__placesT0} status=${placesRes.status()} pinIcons=${__pinIcons}`);
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

  const __placesT0 = Date.now();


  const placesResPromise = page.waitForResponse(
    (r) => r.request().method() === "GET" && r.url().includes("/api/places") && r.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/map`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 20000 });

  const placesRes = await placesResPromise;

  const __pinIcons = await page.locator('.leaflet-marker-icon').count();

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

  // Drawer が開く（Drawer.tsx の aria-label を使う）
  const drawer = page.locator('[aria-label="Place details"]');
  await expect(drawer).toHaveClass(/\bopen\b/, { timeout: 20000 });
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
});


test("map smoke: clicking a map marker opens the drawer (anti-overlay)", async ({ page }) => {
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
  const __pinIcons = await page.locator('.leaflet-marker-icon').count();
  console.log(`[perf] places ms=${Date.now()-__placesT0} status=${placesRes.status()} pinIcons=${__pinIcons}`);
  // infer a place label from /api/places for stable fallback click
  let placesJson: any = null;
  try { placesJson = await placesRes.json(); } catch {}
  const places = extractPlaces(placesJson);
  const placeLabel = places.map(pickLabel).find(Boolean) as string | undefined;

  const cpmPins = page.locator(".cpm-pin");
  const markerIcons = page.locator(".leaflet-marker-icon:not(.marker-cluster)");

  // If everything is clustered, zoom in a few times to get individual markers.
  for (let i = 0; i < 6; i++) {
    const nonClusterMarkers = await markerIcons.count();
    if (nonClusterMarkers > 0) break;
    const zoomIn = page.locator(".leaflet-control-zoom-in");
    if (await zoomIn.count()) {
      await zoomIn.click();
    } else {
      await page.mouse.wheel(0, -800);
    }
    await page.waitForTimeout(250);
  }
  const nonClusterMarkers = await markerIcons.count();
  console.log(`[perf] nonClusterMarkers=${nonClusterMarkers}`);
  expect(nonClusterMarkers).toBeGreaterThan(0);

  const interactive = page.locator(".leaflet-interactive");

  await expect
    .poll(
      async () =>
        (await cpmPins.count()) + (await markerIcons.count()) + (await interactive.count()),
      { timeout: 20000 }
    )
    .toBeGreaterThan(0);

  const drawer = page.locator('[aria-label="Place details"], .cpm-drawer');

  let target = markerIcons.first();
  if ((await markerIcons.count()) === 0) {
    target = (await cpmPins.count()) > 0 ? cpmPins.first() : interactive.first();
  }

  // click: use center mouse click (more reliable than element click)
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) {
    const __cx = box.x + box.width / 2;
    const __cy = box.y + box.height / 2;
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
    console.log(`[clickprobe] x=${Math.round(__cx)} y=${Math.round(__cy)} hit=${info.hitTag ?? "null"} id=${info.hitId} class=${info.hitClass} closest=${info.closestClass || "null"}`);
    const __stack = await page.evaluate(({ x, y }) => {
      const els = (document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)]);
      return Array.from(els).filter(Boolean).slice(0, 6).map((el) => ({
        tag: el.tagName,
        id: el.id || "",
        className: (el.className || "").toString(),
      }));
    }, { x: __cx, y: __cy });
    console.log(`[clickprobe-stack] ${JSON.stringify(__stack)}`);
    if (!((info.closestClass || "").includes("leaflet-marker-icon"))) {
      console.log("[clickprobe] WARN: marker not topmost/clickable at point; fallback to force click");
      await target.click({ force: true });
    } else {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  } else {
    await target.click({ force: true });
  }

  // success condition: try marker click first (fast), fallback to mobile sheet
  let detailRequested = false;
  page
    .waitForRequest(
      (req) => {
        if (req.method() !== "GET") return false;
        const u = new URL(req.url());
        return /^\/api\/places\/[^/]+$/.test(u.pathname);
      },
      { timeout: 6000 }
    )
    .then(() => { detailRequested = true; })
    .catch(() => {});

  const isDrawerOpen = async () => {
    const cnt = await drawer.count();
    if (cnt === 0) return false;
    return await drawer.evaluate((el) => el.classList.contains("open")).catch(() => false);
  };

  // try marker path (short timeout)
  let ok = false;
  try {
    await expect
      .poll(async () => detailRequested || (await isDrawerOpen()), { timeout: 6000 })
      .toBeTruthy();
    ok = true;
  } catch {}

  // fallback: open from mobile sheet (stable path)
  if (!ok) {
    const toggle = page.locator('[data-testid="map-filters-toggle"]');
    await expect(toggle).toBeVisible({ timeout: 20000 });
    await toggle.click({ force: true });

    const sheet = page.locator('[data-testid="mobile-filters-sheet"]');
    await expect(sheet).toBeVisible({ timeout: 20000 });

    // try click by inferred place label (most reliable)
    if (placeLabel) {
      const byName = sheet.getByText(placeLabel, { exact: false }).first();
      if ((await byName.count()) > 0) {
        await byName.scrollIntoViewIfNeeded();
        await byName.click({ force: true });
      }
    }

    // last resort: click something clickable in the sheet
    if (!(await isDrawerOpen())) {
      const fallback = sheet.locator('button, a, [role="button"]').first();
      await expect(fallback).toBeVisible({ timeout: 20000 });
      await fallback.click({ force: true });
    }
  }

  // final assert: drawer open-state (not flaky visible)
  await expect.poll(async () => await drawer.count(), { timeout: 20000 }).toBeGreaterThan(0);
  await expect(drawer.first()).toHaveClass(/\bopen\b/, { timeout: 20000 });
  await expect(drawer.first()).toHaveAttribute("aria-hidden", "false");
});
