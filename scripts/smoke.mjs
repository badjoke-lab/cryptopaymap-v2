#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";
import { Pool } from "pg";
import { normalizeAccepted } from "../lib/accepted.ts";

const PORT = Number(process.env.PORT ?? 3100);
const BASE_URL = process.env.SMOKE_BASE_URL ?? `http://localhost:${PORT}`;

const log = (message) => {
  console.log(`[smoke] ${message}`);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const assertArrayEqual = (actual, expected, label) => {
  if (!Array.isArray(actual)) {
    throw new Error(`${label} accepted is not an array`);
  }
  if (actual.length !== expected.length) {
    throw new Error(
      `${label} accepted mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        `${label} accepted mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      );
    }
  }
};

const assertUnique = (values, label) => {
  const uniqueCount = new Set(values).size;
  if (uniqueCount !== values.length) {
    throw new Error(`${label} accepted has duplicates: ${JSON.stringify(values)}`);
  }
};

const runUnitChecks = () => {
  const payments = [
    { asset: "ETH", chain: null, is_preferred: false },
    { asset: "BTC", chain: null, is_preferred: true },
    { asset: "USDT", chain: null, is_preferred: false },
    { asset: "Lightning", chain: "lightning", is_preferred: true },
    { asset: "btc", chain: "bitcoin", is_preferred: true },
  ];

  const expected = ["BTC", "Lightning", "ETH", "USDT"];
  const normalized = normalizeAccepted(payments);
  assertArrayEqual(normalized, expected, "unit normalizeAccepted");
  assertUnique(normalized, "unit normalizeAccepted");

  const secondPass = normalizeAccepted(payments);
  assertArrayEqual(secondPass, normalized, "unit normalizeAccepted stability");

  log("ok unit normalizeAccepted");
};

const checkDetail = async (id, { verification, accepted }) => {
  const response = await fetch(`${BASE_URL}/api/places/${id}`);
  if (!response.ok) throw new Error(`detail ${id} returned ${response.status}`);

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`detail ${id} returned invalid JSON`);
  }

  if (!body || typeof body !== "object") throw new Error(`detail ${id} returned non-object JSON`);
  if (body.verification !== verification) {
    throw new Error(
      `detail ${id} verification mismatch: expected ${verification}, got ${body.verification}`,
    );
  }

  assertArrayEqual(body.accepted, accepted, `detail ${id}`);
  log(`ok detail ${id}`);
};

const checkList = async () => {
  const response = await fetch(`${BASE_URL}/api/places?country=AQ`);
  if (!response.ok) throw new Error(`list country=AQ returned ${response.status}`);

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("list country=AQ returned invalid JSON");
  }

  if (!Array.isArray(body)) throw new Error("list country=AQ returned non-array JSON");

  const record = body.find((place) => place?.id === "antarctica-owner-1");
  if (!record) throw new Error("list country=AQ missing antarctica-owner-1");

  assertArrayEqual(record.accepted, ["BTC", "Lightning", "ETH", "USDT"], "list country=AQ");
  log("ok list country=AQ");
};

const expectations = [
  ["antarctica-owner-1", { verification: "owner", accepted: ["BTC", "Lightning", "ETH", "USDT"] }],
  ["antarctica-community-1", { verification: "community", accepted: ["BTC", "ETH"] }],
  ["antarctica-directory-1", { verification: "directory", accepted: ["BTC"] }],
  ["antarctica-unverified-1", { verification: "unverified", accepted: ["BTC"] }],
];

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const runApiChecks = async () => {
  log(`starting dev server on :${PORT}`);

  const serverProcess = spawn(npmCmd, ["run", "dev", "--", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit",
    detached: true,
  });

  const cleanup = () => {
    if (!serverProcess.pid) return;
    try {
      process.kill(-serverProcess.pid, "SIGTERM");
    } catch (_) {
      // ignore cleanup errors
    }
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(1);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(1);
  });

  try {
    await waitForReady(`${BASE_URL}/api/filters/meta`);
    log("ready");

    for (const [id, expected] of expectations) {
      await checkDetail(id, expected);
    }

    await checkList();
    log("ok api");
  } finally {
    cleanup();
  }
};

const runDbChecks = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL missing");
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const antarcticaExpectations = {
    "antarctica-owner-1": "owner",
    "antarctica-community-1": "community",
    "antarctica-directory-1": "directory",
    "antarctica-unverified-1": "unverified",
  };

  try {
    const { rows: placeCountRows } = await client.query("SELECT COUNT(*)::int AS count FROM places");
    const placeCount = placeCountRows[0]?.count ?? 0;
    if (placeCount <= 0) {
      throw new Error("places count is 0");
    }

    const { rows: placeSampleRows } = await client.query(
      "SELECT id, name, geom, lat, lng FROM places LIMIT 50",
    );
    for (const place of placeSampleRows) {
      if (!place?.id || String(place.id).trim() === "") {
        throw new Error("places sample has empty id");
      }
      if (!place?.name || String(place.name).trim() === "") {
        throw new Error(`places sample ${place.id} has empty name`);
      }
      const hasGeom = place.geom != null;
      const hasLatLng = place.lat != null && place.lng != null;
      if (!hasGeom && !hasLatLng) {
        throw new Error(`places sample ${place.id} missing geom/lat/lng`);
      }
    }

    const { rows: verificationCountRows } = await client.query(
      "SELECT COUNT(*)::int AS count FROM verifications",
    );
    const verificationCount = verificationCountRows[0]?.count ?? 0;
    if (verificationCount <= 0) {
      throw new Error("verifications count is 0");
    }

    const { rows: invalidLevelRows } = await client.query(
      `SELECT place_id, level FROM verifications
       WHERE level NOT IN ('owner', 'community', 'directory', 'unverified')
       LIMIT 1`,
    );
    if (invalidLevelRows.length > 0) {
      throw new Error(`invalid level: ${invalidLevelRows[0].level}`);
    }

    const { rows: invalidStatusRows } = await client.query(
      `SELECT place_id, status FROM verifications
       WHERE status NOT IN ('approved', 'pending', 'rejected')
       LIMIT 1`,
    );
    if (invalidStatusRows.length > 0) {
      throw new Error(`invalid status: ${invalidStatusRows[0].status}`);
    }

    const antarcticaIds = Object.keys(antarcticaExpectations);
    const { rows: antarcticaPlaces } = await client.query(
      "SELECT id FROM places WHERE id = ANY($1)",
      [antarcticaIds],
    );
    const foundPlaceIds = new Set(antarcticaPlaces.map((row) => row.id));
    for (const id of antarcticaIds) {
      if (!foundPlaceIds.has(id)) {
        throw new Error(`missing ${id} in places`);
      }
    }

    const { rows: antarcticaVerifications } = await client.query(
      "SELECT place_id, level FROM verifications WHERE place_id = ANY($1)",
      [antarcticaIds],
    );
    const verificationByPlace = new Map(
      antarcticaVerifications.map((row) => [row.place_id, row.level]),
    );
    for (const [id, expectedLevel] of Object.entries(antarcticaExpectations)) {
      const actualLevel = verificationByPlace.get(id);
      if (!actualLevel) {
        throw new Error(`missing ${id} in verifications`);
      }
      if (actualLevel !== expectedLevel) {
        throw new Error(`verification level mismatch for ${id}: expected ${expectedLevel}`);
      }
    }

    log("ok db sanity");
  } finally {
    client.release();
    await pool.end();
  }
};

const main = async () => {
  try {
    runUnitChecks();

    if (!process.env.DATABASE_URL) {
      log("skip db/api checks (DATABASE_URL missing)");
      log("PASS");
      return;
    }

    await runDbChecks();
    await runApiChecks();
    log("PASS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[smoke] FAIL: ${message}`);
    process.exitCode = 1;
  }
};

main();
