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

const placeId = process.argv[2];
if (!placeId) {
  console.error("Usage: npm run db:check -- <place-id>");
  process.exitCode = 1;
  process.exit();
}

loadEnv();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Add it to .env.local or export it before running this script.");
  process.exitCode = 1;
  process.exit();
}

const pool = new Pool({ connectionString: databaseUrl });

const tableExists = async (client, table) => {
  const { rows } = await client.query(`SELECT to_regclass('public.${table}') AS present`);
  return Boolean(rows[0]?.present);
};

(async () => {
  const client = await pool.connect();

  try {
    const hasPlaces = await tableExists(client, "places");
    const hasPayments = await tableExists(client, "payment_accepts");
    const hasVerifications = await tableExists(client, "verifications");

    if (!hasPlaces) {
      console.error("places table is missing; cannot run DB smoke check.");
      return;
    }

    const { rows: placeRows } = await client.query(
      `SELECT * FROM places WHERE id = $1 LIMIT 1`,
      [placeId],
    );

    const place = placeRows[0] ?? null;
    console.log("Place:");
    console.log(place ? JSON.stringify(place, null, 2) : "(not found)");

    if (hasPayments) {
      const { rows: paymentRows } = await client.query(
        `SELECT * FROM payment_accepts WHERE place_id = $1 ORDER BY id ASC`,
        [placeId],
      );
      console.log("\nPayment accepts:");
      console.log(paymentRows.length ? JSON.stringify(paymentRows, null, 2) : "(none)");
    } else {
      console.log("\nPayment accepts: table missing");
    }

    if (hasVerifications) {
      const { rows: verificationRows } = await client.query(
        `SELECT * FROM verifications WHERE place_id = $1 LIMIT 1`,
        [placeId],
      );
      console.log("\nVerification:");
      console.log(
        verificationRows[0] ? JSON.stringify(verificationRows[0], null, 2) : "(none)",
      );
    } else {
      console.log("\nVerification: table missing");
    }
  } catch (error) {
    console.error("[db-check] Failed to query database", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
