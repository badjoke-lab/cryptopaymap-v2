#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Pool } from "pg";

const loadEnv = () => {
  if (process.env.DATABASE_URL) return;

  const envFile = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envFile)) return;

  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(envFile, { override: false });
      return;
    } catch (error) {
      console.warn("[db-sanity] Failed to load env via process.loadEnvFile", error);
    }
  }

  const contents = fs.readFileSync(envFile, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const match = line.match(/^([^=\s]+)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2];
    if (value.startsWith("\"") && value.endsWith("\"")) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
};

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("[db-sanity] DATABASE_URL missing; skipping DB sanity checks.");
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl });

const allowedVerificationLevels = new Set(["owner", "community", "directory", "unverified"]);

const tableExists = async (client, table) => {
  const { rows } = await client.query("SELECT to_regclass($1) AS present", [`public.${table}`]);
  return Boolean(rows[0]?.present);
};

const columnExists = async (client, table, column) => {
  const { rows } = await client.query(
    `SELECT EXISTS(
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = $1
         AND column_name = $2
     ) AS present`,
    [table, column],
  );
  return Boolean(rows[0]?.present);
};

const ensurePlacesSanity = async (client) => {
  const { rows } = await client.query(
    `SELECT
       COUNT(*)::BIGINT AS total,
       SUM(CASE WHEN id IS NULL OR NULLIF(BTRIM(id), '') IS NULL THEN 1 ELSE 0 END)::BIGINT AS id_missing,
       SUM(CASE WHEN name IS NULL OR NULLIF(BTRIM(name), '') IS NULL THEN 1 ELSE 0 END)::BIGINT AS name_missing,
       SUM(CASE WHEN country IS NULL OR NULLIF(BTRIM(country), '') IS NULL THEN 1 ELSE 0 END)::BIGINT AS country_missing,
       SUM(CASE WHEN city IS NULL OR NULLIF(BTRIM(city), '') IS NULL THEN 1 ELSE 0 END)::BIGINT AS city_missing,
       SUM(CASE WHEN category IS NULL OR NULLIF(BTRIM(category), '') IS NULL THEN 1 ELSE 0 END)::BIGINT AS category_missing,
       SUM(CASE WHEN lat IS NULL THEN 1 ELSE 0 END)::BIGINT AS lat_missing,
       SUM(CASE WHEN lng IS NULL THEN 1 ELSE 0 END)::BIGINT AS lng_missing,
       SUM(CASE WHEN lat IS NOT NULL AND (lat < -90 OR lat > 90) THEN 1 ELSE 0 END)::BIGINT AS lat_out_of_range,
       SUM(CASE WHEN lng IS NOT NULL AND (lng < -180 OR lng > 180) THEN 1 ELSE 0 END)::BIGINT AS lng_out_of_range
     FROM places`,
  );

  const row = rows[0];
  const total = Number(row?.total ?? 0);
  console.log(`[db-sanity] places count: ${total}`);

  if (total === 0 && !process.env.ALLOW_EMPTY_DB) {
    throw new Error("places table is empty (set ALLOW_EMPTY_DB=1 to override)");
  }

  const issues = [
    ["id missing", row?.id_missing],
    ["name missing", row?.name_missing],
    ["country missing", row?.country_missing],
    ["city missing", row?.city_missing],
    ["category missing", row?.category_missing],
    ["lat missing", row?.lat_missing],
    ["lng missing", row?.lng_missing],
    ["lat out of range", row?.lat_out_of_range],
    ["lng out of range", row?.lng_out_of_range],
  ].filter(([, value]) => Number(value ?? 0) > 0);

  if (issues.length) {
    const summary = issues.map(([label, value]) => `${label}=${value}`).join(", ");
    throw new Error(`places sanity check failed: ${summary}`);
  }
};

const ensureVerificationLevels = async (client) => {
  if (!(await tableExists(client, "verifications"))) {
    console.log("[db-sanity] verifications table missing; skipping verification checks");
    return;
  }

  const hasLevel = await columnExists(client, "verifications", "level");
  const hasStatus = await columnExists(client, "verifications", "status");
  const column = hasLevel ? "level" : hasStatus ? "status" : null;

  if (!column) {
    throw new Error("verifications table missing level/status column");
  }

  const { rows } = await client.query(
    `SELECT COUNT(*)::BIGINT AS invalid
     FROM verifications
     WHERE ${column} IS NOT NULL AND ${column} NOT IN ('owner', 'community', 'directory', 'unverified')`,
  );

  const invalid = Number(rows[0]?.invalid ?? 0);
  if (invalid > 0) {
    throw new Error(`verifications.${column} has ${invalid} invalid values`);
  }
};

const ensureReferentialIntegrity = async (client) => {
  const tables = ["verifications", "payment_accepts", "payments", "socials", "media", "history"];
  for (const table of tables) {
    if (!(await tableExists(client, table))) continue;
    if (!(await columnExists(client, table, "place_id"))) continue;

    const { rows } = await client.query(
      `SELECT COUNT(*)::BIGINT AS orphans
       FROM ${table}
       WHERE place_id IS NOT NULL
         AND place_id NOT IN (SELECT id FROM places)`,
    );

    const orphans = Number(rows[0]?.orphans ?? 0);
    if (orphans > 0) {
      throw new Error(`${table}.place_id has ${orphans} orphaned rows`);
    }
  }
};

(async () => {
  const client = await pool.connect();

  try {
    const hasPlaces = await tableExists(client, "places");
    if (!hasPlaces) {
      throw new Error("places table is missing");
    }

    await ensurePlacesSanity(client);
    await ensureVerificationLevels(client);
    await ensureReferentialIntegrity(client);

    console.log("[db-sanity] PASS");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db-sanity] FAIL: ${message}`);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
