import { spawn } from "node:child_process";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickArray(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.places)) return json.places;
  if (Array.isArray(json.items)) return json.items;
  if (Array.isArray(json.data)) return json.data;
  if (json.result && Array.isArray(json.result.places)) return json.result.places;
  return [];
}

function parsePort(baseUrl) {
  try {
    const u = new URL(baseUrl);
    return u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
  } catch {
    return 3201;
  }
}

async function fetchJson(url, { timeoutMs = 8000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function waitHealth(baseUrl, { tries = 60, intervalMs = 500 } = {}) {
  const url = `${baseUrl.replace(/\/$/, "")}/api/health`;
  for (let i = 1; i <= tries; i++) {
    try {
      await fetchJson(url, { timeoutMs: 2000 });
      return true;
    } catch {
      await sleep(intervalMs);
    }
  }
  return false;
}

function spawnDevServer({ port }) {
  // Next dev を npm 経由で起動（package.json の dev を利用）
  const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(cmd, ["run", "dev", "--", "-p", String(port)], {
    stdio: "inherit",
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
    },
  });
  return child;
}

const baseUrl = process.env.REGRESSION_BASE_URL || "http://localhost:3201";
const ci = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const wantSpawn = String(process.env.REGRESSION_SPAWN_SERVER || "").toLowerCase() === "true";

console.log(`[verify] baseUrl=${baseUrl}`);
let child = null;

try {
  // 1) 既に生きてるならそのまま使う
  let ok = await waitHealth(baseUrl, { tries: 6, intervalMs: 300 });
  if (!ok && wantSpawn) {
    // 2) 死んでたら spawn + 起動待ち
    const port = parsePort(baseUrl);
    console.log(`[verify] health not ready -> spawning dev server on port ${port} ...`);
    child = spawnDevServer({ port });

    ok = await waitHealth(baseUrl, { tries: 80, intervalMs: 500 });
    if (!ok) {
      throw new Error(`[verify] dev server did not become healthy at ${baseUrl}/api/health`);
    }
    console.log("[verify] dev server is healthy");
  } else if (!ok) {
    throw new Error(`[verify] server not reachable at ${baseUrl} (set REGRESSION_SPAWN_SERVER=true to spawn)`);
  }

  // 3) bbox 候補（minLng,minLat,maxLng,maxLat）
  const cities = [
    { name: "Tokyo",      bbox: [139.55, 35.53, 139.91, 35.82] },
    { name: "NewYork",    bbox: [-74.26, 40.49, -73.70, 40.92] },
    { name: "London",     bbox: [-0.51, 51.28, 0.33, 51.70] },
    { name: "Singapore",  bbox: [103.60, 1.16, 104.10, 1.48] },
    { name: "Bangkok",    bbox: [100.35, 13.50, 100.93, 13.91] },
  ];

  console.log("[verify] fetching candidates...");
  const results = [];
  for (const c of cities) {
    const qs = new URLSearchParams({
      bbox: c.bbox.join(","),
      limit: "50",
    });
    const url = `${baseUrl.replace(/\/$/, "")}/api/places?${qs.toString()}`;
    try {
      const json = await fetchJson(url, { timeoutMs: 12000 });
      const arr = pickArray(json);
      console.log(`[verify] ${c.name}: ok count=${arr.length}`);
      results.push({ name: c.name, count: arr.length, ok: true });
    } catch (e) {
      console.log(`[verify] ${c.name}: ERROR ${e?.message || e}`);
      results.push({ name: c.name, count: 0, ok: false });
    }
  }

  const okOnes = results.filter((r) => r.ok);
  const nonEmpty = okOnes.filter((r) => r.count > 0);

  // 4) 判断（今の挙動を踏襲：CIなら「比較できない」はスキップ）
  if (okOnes.length === 0) {
    throw new Error("[verify] all candidate fetches failed (server/API issue)");
  }

  if (nonEmpty.length < 2) {
    const msg = "[verify] Not enough non-empty bbox results to compare.";
    if (ci) {
      console.log(msg + " CI mode => skipping.");
      process.exit(0);
    } else {
      throw new Error(msg + " (local) fix data or bbox, or check DB/API)");
    }
  }

  console.log(`[verify] PASS (non-empty cities=${nonEmpty.length})`);
  process.exit(0);
} catch (e) {
  console.error(String(e?.stack || e));
  process.exitCode = 1;
} finally {
  if (child) {
    console.log("[verify] stopping spawned dev server...");
    child.kill("SIGTERM");
  }
}
