import { test, expect } from "@playwright/test";

const baseURL = () => process.env.PW_BASE_URL ?? "http://127.0.0.1:3000";

async function assertNotUnderLeaflet(page: any, locator: any, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} boundingBox missing`).toBeTruthy();

  const x = Math.floor(box.x + Math.min(box.width / 2, Math.max(2, box.width - 2)));
  const y = Math.floor(box.y + Math.min(box.height / 2, Math.max(2, box.height - 2)));

  const top = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return { tag: el?.tagName ?? null, id: (el as any)?.id ?? null, cls: el?.className ? String(el.className).slice(0,180) : null };
  }, { x, y });

  const topStr = `${top.tag}#${top.id}.${top.cls}`;
  expect(/leaflet/i.test(topStr), `${label} is under Leaflet. top=${topStr}`).toBeFalsy();
}

test("UI overlays stay above the map after zoom-in; mobile Filters hidden on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(baseURL() + "/map", { waitUntil: "domcontentloaded" }).catch(async () => {
    await page.goto(baseURL() + "/", { waitUntil: "domcontentloaded" });
  });
  await page.waitForTimeout(900);

  const zoomIn = page.locator(".leaflet-control-zoom-in").first();
  if (await zoomIn.count()) {
    for (let i = 0; i < 7; i++) {
      await zoomIn.click().catch(() => {});
      await page.waitForTimeout(200);
    }
  }

  const locate = page.getByRole("button", { name: /Locate me/i }).first();
  await expect(locate).toBeVisible();
  await assertNotUnderLeaflet(page, locate, "Locate me");

  const placesPill = page.getByText(/\b\d+\s+places\b/i).first();
  if (await placesPill.count()) {
    await expect(placesPill).toBeVisible();
    await assertNotUnderLeaflet(page, placesPill, "places pill");
  }

  const dbok = page.getByText(/DB:\s*OK/i).first();
  if (await dbok.count()) {
    await expect(dbok).toBeVisible();
    await assertNotUnderLeaflet(page, dbok, "DB: OK");
  }

  const filtersBtn = page.getByRole("button", { name: /^Filters$/ }).first();
  if (await filtersBtn.count()) {
    await expect(filtersBtn, "Mobile Filters button must be hidden on desktop width").toBeHidden();
  }

  await page.setViewportSize({ width: 900, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  const filtersBtnMobile = page.getByRole("button", { name: /^Filters$/ }).first();
  if (await filtersBtnMobile.count()) {
    await expect(filtersBtnMobile).toBeVisible();
    await assertNotUnderLeaflet(page, filtersBtnMobile, "Filters (mobile)");
  }
});
