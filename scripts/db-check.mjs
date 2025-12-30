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
      console.warn("[db-check] Failed to load env via process.loadEnvFile", error);
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
  console.error("DATABASE_URL is not set. Add it to .env.local or export it before running this script.");
  process.exitCode = 1;
  process.exit();
}

const requiredTables = [
  "places",
  "verifications",
  "payments",
  "payment_accepts",
  "socials",
  "media",
  "categories",
  "history",
];

const pool = new Pool({ connectionString: databaseUrl });

const tableExists = async (client, table) => {
  const { rows } = await client.query(`SELECT to_regclass('public.${table}') AS present`);
  return Boolean(rows[0]?.present);
};

(async () => {
  const client = await pool.connect();

  try {
    const { rowCount: postgisCount } = await client.query(
      "SELECT 1 FROM pg_extension WHERE extname = 'postgis'",
    );

    if (!postgisCount) {
      console.error("PostGIS extension is missing. Run: CREATE EXTENSION postgis;");
      process.exitCode = 1;
      return;
    }

    const missingTables = [];
    for (const table of requiredTables) {
      const present = await tableExists(client, table);
      if (!present) missingTables.push(table);
    }

    if (missingTables.length) {
      console.error(`Missing required tables: ${missingTables.join(", ")}`);
      process.exitCode = 1;
      return;
    }

    const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM places");
    const count = rows[0]?.count ?? 0;

    console.log("[db-check] Database OK");
    console.log(`[db-check] places count: ${count}`);
  } catch (error) {
    console.error("[db-check] Failed to query database", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
