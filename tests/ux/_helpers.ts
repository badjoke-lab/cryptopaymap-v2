import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

export function writeJson(filePath: string, data: unknown) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function firstVisibleLocator(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if (await loc.count()) return loc;
    } catch {}
  }
  return null;
}

export async function waitAnyVisible(page: Page, selectors: string[], timeoutMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if ((await loc.count()) > 0) {
          const box = await loc.boundingBox();
          if (box && box.width > 0 && box.height > 0) return { selector: sel, ms: Date.now() - t0 };
        }
      } catch {}
    }
    await sleep(100);
  }
  throw new Error(`Timeout: none visible within ${timeoutMs}ms. selectors=${selectors.join(', ')}`);
}

export function overlap(a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}) {
  const ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx2 = b.x + b.width, by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  return ix * iy; // 0なら重なり無し
}

export function withinViewport(box: {x:number;y:number;width:number;height:number}, vw: number, vh: number) {
  return box.x >= -1 && box.y >= -1 && box.x + box.width <= vw + 1 && box.y + box.height <= vh + 1;
}
