#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

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

const main = async () => {
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
    log("PASS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[smoke] FAIL: ${message}`);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
};

main();
