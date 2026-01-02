#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const PORT = Number(process.env.PORT ?? 3201);
const BASE_URL = process.env.REGRESSION_BASE_URL ?? `http://localhost:${PORT}`;

const log = (message) => {
  console.log(`[verify-regression] ${message}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const retryBackoffMs = [200, 400];

const fetchWithRetry = async (url, options = {}, { label = url } = {}) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.status !== 503) {
        return response;
      }

      if (attempt === 3) {
        return response;
      }

      log(`${label} returned 503 (attempt ${attempt}), retrying...`);
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      log(`${label} failed (attempt ${attempt}), retrying...`);
    }

    const backoff = retryBackoffMs[attempt - 1] ?? retryBackoffMs.at(-1) ?? 0;
    await sleep(backoff);
  }

  throw new Error(`failed to fetch ${label}`);
};

const waitForReady = async (url, { timeoutMs = 30000, intervalMs = 500 } = {}) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (_) {
      // ignore until ready
    }
    await sleep(intervalMs);
  }

  throw new Error(`timed out waiting for ${url}`);
};

const readBodySnippet = async (response, limit = 200) => {
  try {
    const text = await response.text();
    if (!text) return "<empty body>";
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  } catch {
    return "<unreadable body>";
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertPlaceShape = (place, label) => {
  assert(place && typeof place === "object", `${label} place is not an object`);
  assert(typeof place.id === "string" && place.id.length > 0, `${label} place.id is missing`);
  assert(typeof place.name === "string" && place.name.length > 0, `${label} place.name is missing`);
  assert(typeof place.category === "string" && place.category.length > 0, `${label} place.category is missing`);
  assert(typeof place.country === "string", `${label} place.country is missing`);
  assert(typeof place.city === "string", `${label} place.city is missing`);
  assert(typeof place.verification === "string", `${label} place.verification is missing`);
  assert(typeof place.lat === "number" && !Number.isNaN(place.lat), `${label} place.lat is invalid`);
  assert(typeof place.lng === "number" && !Number.isNaN(place.lng), `${label} place.lng is invalid`);
};

const buildBbox = (lat, lng, delta) => {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const minLat = clamp(lat - delta, -90, 90);
  const maxLat = clamp(lat + delta, -90, 90);
  const minLng = clamp(lng - delta, -180, 180);
  const maxLng = clamp(lng + delta, -180, 180);
  return `${minLng},${minLat},${maxLng},${maxLat}`;
};

const buildFarawayCenter = (lat, lng) => {
  const wrapLng = (value) => {
    let result = value;
    while (result > 180) result -= 360;
    while (result < -180) result += 360;
    return result;
  };
  const clampLat = (value) => Math.min(Math.max(value, -80), 80);
  const latShift = lat >= 0 ? lat - 60 : lat + 60;
  const lngShift = lng >= 0 ? lng - 120 : lng + 120;
  return { lat: clampLat(latShift), lng: wrapLng(lngShift) };
};

const fetchPlaces = async ({ bbox, limit = 200 } = {}) => {
  const params = new URLSearchParams();
  if (bbox) params.set("bbox", bbox);
  params.set("limit", String(limit));
  const url = `${BASE_URL}/api/places?${params.toString()}`;
  const response = await fetchWithRetry(url, {}, { label: `places ${bbox ?? "all"}` });
  if (!response.ok) {
    const snippet = await readBodySnippet(response);
    throw new Error(`places ${bbox ?? "all"} returned ${response.status}: ${snippet}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`places ${bbox ?? "all"} returned invalid JSON`);
  }

  assert(Array.isArray(body), `places ${bbox ?? "all"} returned non-array JSON`);
  body.forEach((place, index) => assertPlaceShape(place, `places ${bbox ?? "all"}[${index}]`));
  assert(body.length <= limit, `places ${bbox ?? "all"} exceeded limit ${limit}`);
  return body;
};

const comparePlaceIds = (first, second) => {
  const firstIds = [...new Set(first.map((place) => place.id))].sort();
  const secondIds = [...new Set(second.map((place) => place.id))].sort();
  if (firstIds.length !== secondIds.length) return false;
  for (let i = 0; i < firstIds.length; i += 1) {
    if (firstIds[i] !== secondIds[i]) return false;
  }
  return true;
};

const checkPlaceDetail = async (id) => {
  const response = await fetchWithRetry(`${BASE_URL}/api/places/${id}`, {}, { label: `detail ${id}` });
  if (!response.ok) {
    const snippet = await readBodySnippet(response);
    throw new Error(`detail ${id} returned ${response.status}: ${snippet}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`detail ${id} returned invalid JSON`);
  }

  assertPlaceShape(body, `detail ${id}`);
  assert(body.id === id, `detail ${id} returned mismatched id`);
};

const checkUnknownDetail = async () => {
  const unknownId = "cpm:unknown:regression-404";
  const response = await fetchWithRetry(`${BASE_URL}/api/places/${unknownId}`, {}, { label: "detail 404" });
  if (response.status !== 404) {
    const snippet = await readBodySnippet(response);
    throw new Error(`detail 404 returned ${response.status}: ${snippet}`);
  }
};

const checkStats = async () => {
  const response = await fetchWithRetry(`${BASE_URL}/api/stats`, {}, { label: "stats" });
  if (!response.ok) {
    const snippet = await readBodySnippet(response);
    throw new Error(`stats returned ${response.status}: ${snippet}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("stats returned invalid JSON");
  }

  assert(body && typeof body === "object", "stats returned non-object JSON");
  assert(typeof body.total_places === "number", "stats.total_places is missing");
  assert(Array.isArray(body.by_country), "stats.by_country is missing");
  assert(Array.isArray(body.by_verification), "stats.by_verification is missing");

  body.by_country.forEach((entry, index) => {
    assert(typeof entry.country === "string", `stats.by_country[${index}].country is missing`);
    assert(typeof entry.total === "number", `stats.by_country[${index}].total is missing`);
  });

  const allowedLevels = new Set(["owner", "community", "directory", "unverified"]);
  body.by_verification.forEach((entry, index) => {
    assert(typeof entry.level === "string", `stats.by_verification[${index}].level is missing`);
    assert(allowedLevels.has(entry.level), `stats.by_verification[${index}].level is invalid`);
    assert(typeof entry.total === "number", `stats.by_verification[${index}].total is missing`);
  });
};

const checkTrends = async () => {
  const response = await fetchWithRetry(`${BASE_URL}/api/stats/trends`, {}, { label: "stats trends" });
  if (!response.ok) {
    const snippet = await readBodySnippet(response);
    throw new Error(`stats trends returned ${response.status}: ${snippet}`);
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("stats trends returned invalid JSON");
  }
  assert(body && typeof body === "object", "stats trends returned non-object JSON");
  assert(Array.isArray(body.points), "stats trends points is missing");
  body.points.forEach((point, index) => {
    assert(typeof point.date === "string", `stats trends point[${index}].date is missing`);
    assert(typeof point.delta === "number", `stats trends point[${index}].delta is missing`);
    assert(typeof point.total === "number", `stats trends point[${index}].total is missing`);
  });

  if (body.meta) {
    assert(
      body.meta.reason === "no_history_data",
      `stats trends meta.reason unexpected value ${body.meta.reason}`,
    );
  }
};

const checkSubmissionsContract = async () => {
  const response = await fetchWithRetry(
    `${BASE_URL}/api/submissions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
    { label: "submissions" },
  );

  if (response.status !== 400) {
    const snippet = await readBodySnippet(response);
    throw new Error(`submissions returned ${response.status}: ${snippet}`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("submissions returned invalid JSON");
  }

  assert(body && typeof body === "object", "submissions returned non-object JSON");
  assert(body.errors && typeof body.errors === "object", "submissions errors payload missing");
};

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const runChecks = async () => {
  const allPlaces = await fetchPlaces({ limit: 200 });
  assert(allPlaces.length > 0, "places list is empty");

  const seedPlace = allPlaces[0];
  const bboxA = buildBbox(seedPlace.lat, seedPlace.lng, 0.5);
  const faraway = buildFarawayCenter(seedPlace.lat, seedPlace.lng);
  const bboxB = buildBbox(faraway.lat, faraway.lng, 0.5);

  const [bboxAResults, bboxBResults] = await Promise.all([
    fetchPlaces({ bbox: bboxA, limit: 200 }),
    fetchPlaces({ bbox: bboxB, limit: 200 }),
  ]);

  assert(bboxAResults.length > 0, "bbox A returned empty results");

  const identical = comparePlaceIds(bboxAResults, bboxBResults);
  assert(!identical, "bbox A and bbox B returned identical IDs");

  const knownId = bboxAResults[0]?.id ?? seedPlace.id;
  await checkPlaceDetail(knownId);
  await checkUnknownDetail();
  await checkStats();
  await checkTrends();
  await checkSubmissionsContract();
};

const main = async () => {
  const shouldSpawn = !process.env.REGRESSION_BASE_URL;
  let serverProcess;
  const cleanup = () => {
    if (!serverProcess?.pid) return;
    try {
      process.kill(-serverProcess.pid, "SIGTERM");
    } catch (_) {
      // ignore cleanup errors
    }
  };

  try {
    if (shouldSpawn) {
      log(`starting dev server on :${PORT}`);
      serverProcess = spawn(npmCmd, ["run", "dev", "--", "-p", String(PORT)], {
        env: { ...process.env, PORT: String(PORT) },
        stdio: "inherit",
        detached: true,
      });

      process.on("SIGINT", () => {
        cleanup();
        process.exit(1);
      });
      process.on("SIGTERM", () => {
        cleanup();
        process.exit(1);
      });

      await waitForReady(`${BASE_URL}/api/filters/meta`);
      log("server ready");
    }

    await runChecks();
    log("PASS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[verify-regression] FAIL: ${message}`);
    process.exitCode = 1;
  } finally {
    if (shouldSpawn) {
      cleanup();
    }
  }
};

main();
