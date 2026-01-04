import { test, expect } from '@playwright/test';
import path from 'node:path';
import { ensureDir, writeJson, withinViewport, overlap, sleep } from './_helpers';

const BASE_URL = (process.env.PW_BASE_URL || process.env.UX_BASE_URL || 'http://localhost:3201').replace(/\/$/, '');

const TH = {
  MAP_VISIBLE_MS: Number(process.env.UX_MAP_VISIBLE_MS || 2500),
  PINS_MAX_WAIT_MS: Number(process.env.UX_PINS_MAX_WAIT_MS || 20000),
  PINS_SLA_MS: Number(process.env.UX_PINS_SLA_MS || 6000),
  AFTER_ZOOM_MAX_WAIT_MS: Number(process.env.UX_AFTER_ZOOM_MAX_WAIT_MS || 15000),
  AFTER_ZOOM_SLA_MS: Number(process.env.UX_AFTER_ZOOM_SLA_MS || 5000),
};

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 390,  height: 844 },
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function measureAnyVisible(page: any, selectors: string[], maxWaitMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if ((await loc.count()) > 0) {
          const box = await loc.boundingBox();
          if (box && box.width > 0 && box.height > 0) {
            return { selector: sel, ms: Date.now() - t0, box };
          }
        }
      } catch {}
    }
    await sleep(100);
  }
  return null;
}

test.describe('CryptoPayMap UX Audit', () => {
  
  test.describe.configure({ timeout: 180_000 });
for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} ${vp.width}x${vp.height}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('home: map + pins timing + mobile layout + zoom regression', async ({ page }, testInfo) => {
        const outDir = path.join(process.cwd(), 'artifacts/ux', `${vp.name}-${stamp()}`);
        ensureDir(outDir);

        const timings: Record<string, any> = { baseUrl: BASE_URL, viewport: vp, thresholds: TH };
        const notes: Record<string, any> = {};
        const consoleErrors: string[] = [];
        const pageErrors: string[] = [];
        const apiPlaces: any[] = [];

        page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
        page.on('pageerror', (err) => pageErrors.push(String(err)));

        page.on('response', async (res) => {
          try {
            const url = res.url();
            if (url.includes('/api/places')) {
              apiPlaces.push({
                url,
                status: res.status(),
                ok: res.ok(),
                timing: (res.request() as any).timing?.() || null,
              });
            }
          } catch {}
        });

        let failReason: string | null = null;

        try {
          const t0 = Date.now();
          const res = await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
          expect(res).not.toBeNull();
          expect(res!.status()).toBeLessThan(400);
          timings.domcontentloaded_ms = Date.now() - t0;

          // map container
          const mapHit = await measureAnyVisible(page, ['.leaflet-container', '[data-testid="map"]', '#map'], TH.MAP_VISIBLE_MS);
          if (!mapHit) throw new Error(`MAP NOT VISIBLE within ${TH.MAP_VISIBLE_MS}ms`);
          timings.map_visible_ms = mapHit.ms;
          notes.map_selector = mapHit.selector;

          // places error banner（出てたら即FAILにして原因を固定）
          const errorBanner = page.getByText(/Failed to load places/i);
          const retryBtn = page.getByRole('button', { name: /Retry/i });
          const errNow = await errorBanner.isVisible().catch(() => false);
          if (errNow) throw new Error('UI ERROR: "Failed to load places" is visible (API failure).');

          // pins/clusters timing
          const pinsHit = await measureAnyVisible(page, ['.cpm-pin', '.cpm-cluster', '.leaflet-marker-pane .leaflet-marker-icon'], TH.PINS_MAX_WAIT_MS);
          if (!pinsHit) {
            timings.pins_visible_ms = null;
            throw new Error(`PINS NOT VISIBLE within ${TH.PINS_MAX_WAIT_MS}ms`);
          }
          timings.pins_visible_ms = pinsHit.ms;
          notes.pins_selector = pinsHit.selector;

          expect(pinsHit.ms, `Pins/clusters too slow (SLA ${TH.PINS_SLA_MS}ms, got ${pinsHit.ms}ms)`)
            .toBeLessThanOrEqual(TH.PINS_SLA_MS);

          // mobile layout: Filters clickability check (trial)
          const header = page.locator('header').first();
          await expect(header).toBeVisible({ timeout: 5000 });
          const headerBox = await header.boundingBox();
          if (!headerBox) throw new Error('header has no bounding box');

          const filtersBtn = page.getByRole('button', { name: /Filters/i });
          if (await filtersBtn.isVisible().catch(() => false)) {
            // If the button is covered by another element, Playwright will throw here.
            await filtersBtn.click({ trial: true });
            const fb = await filtersBtn.boundingBox();
            if (fb) {
              notes.headerBox = headerBox;
              notes.filtersBtnBox = fb;
            }
          }

// Locate / DB OK within viewport（存在する場合）
          const locate = page.getByRole('button', { name: /Locate me/i });
          if (await locate.isVisible().catch(() => false)) {
            const b = await locate.boundingBox();
            if (!b) throw new Error('Locate button has no bounding box');
            notes.locateBox = b;
            expect(withinViewport(b, vp.width, vp.height)).toBeTruthy();
          }

          const dbOk = page.getByText(/DB:\s*OK/i);
          if (await dbOk.isVisible().catch(() => false)) {
            const b = await dbOk.boundingBox();
            if (!b) throw new Error('DB OK has no bounding box');
            notes.dbOkBox = b;
            expect(withinViewport(b, vp.width, vp.height)).toBeTruthy();
          }

          // zoom regression
          const zoomOut = page.locator('.leaflet-control-zoom-out').first();
          const zoomIn = page.locator('.leaflet-control-zoom-in').first();
          if (await zoomOut.isVisible().catch(() => false)) {
            await zoomIn.click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(250);
            await expect(zoomOut, "Zoom-out control not visible").toBeVisible({ timeout: 5000 });

            for (let i = 0; i < 4; i++) {
              await zoomOut.click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(350);
            }

            const afterZoom = await measureAnyVisible(page, ['.cpm-pin', '.cpm-cluster', '.leaflet-marker-pane .leaflet-marker-icon'], TH.AFTER_ZOOM_MAX_WAIT_MS);
            if (!afterZoom) {
              timings.after_zoom_visible_ms = null;
              throw new Error(`PINS NOT VISIBLE after zoom within ${TH.AFTER_ZOOM_MAX_WAIT_MS}ms`);
            }
            timings.after_zoom_visible_ms = afterZoom.ms;

            expect(afterZoom.ms, `After zoom too slow (SLA ${TH.AFTER_ZOOM_SLA_MS}ms, got ${afterZoom.ms}ms)`)
              .toBeLessThanOrEqual(TH.AFTER_ZOOM_SLA_MS);
          }

          // error banner 最終チェック
          const isErrorVisible = await errorBanner.isVisible().catch(() => false);
          const isRetryVisible = await retryBtn.isVisible().catch(() => false);
          timings.error_banner_visible = isErrorVisible;
          timings.retry_visible = isRetryVisible;
          if (isErrorVisible || isRetryVisible) {
            throw new Error('UI ERROR: "Failed to load places / Retry" became visible.');
          }

          await expect(page).toHaveScreenshot(`home.${vp.name}.png`, { fullPage: true });

        } catch (e: any) {
          failReason = String(e?.message || e);
          throw e;
        } finally {
          timings.failReason = failReason;
          writeJson(path.join(outDir, 'timings.json'), timings);
          writeJson(path.join(outDir, 'notes.json'), notes);
          writeJson(path.join(outDir, 'console_errors.json'), consoleErrors);
          writeJson(path.join(outDir, 'page_errors.json'), pageErrors);
          writeJson(path.join(outDir, 'api_places.json'), apiPlaces);

          await testInfo.attach('timings.json', { body: Buffer.from(JSON.stringify(timings, null, 2)), contentType: 'application/json' });
          await testInfo.attach('api_places.json', { body: Buffer.from(JSON.stringify(apiPlaces, null, 2)), contentType: 'application/json' });
          await testInfo.attach('console_errors.json', { body: Buffer.from(JSON.stringify(consoleErrors, null, 2)), contentType: 'application/json' });
          await testInfo.attach('page_errors.json', { body: Buffer.from(JSON.stringify(pageErrors, null, 2)), contentType: 'application/json' });
        }
      });
    });
  }
});
