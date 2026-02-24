import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

const SCRIPT_NAME = "validate_map_stats_parity";
const EXPECTED_POPULATION_ID = "places:map_population:v2";
const STATS_ROUTE_PATH = path.join(process.cwd(), "app/api/stats/route.ts");

const mapPopulationSql = `
  SELECT p.id
  FROM places p
  WHERE p.lat IS NOT NULL
    AND p.lng IS NOT NULL
`;

const statsPopulationSql = `
  WITH filtered_places AS (
    SELECT p.id
    FROM places p
    WHERE p.lat IS NOT NULL
      AND p.lng IS NOT NULL
  )
  SELECT id
  FROM filtered_places
`;

function isCiLikeEnvironment() {
  return process.env.CI === "true" || process.env.REQUIRE_DB_VALIDATION === "true";
}

function parsePopulationIdFromStatsRoute() {
  const source = readFileSync(STATS_ROUTE_PATH, "utf8");
  const match = source.match(/const\s+MAP_POPULATION_ID\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`MAP_POPULATION_ID is missing in ${STATS_ROUTE_PATH}`);
  }
  return match[1];
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const ciLike = isCiLikeEnvironment();

  if (!databaseUrl) {
    if (ciLike) {
      console.error(`[${SCRIPT_NAME}] DATABASE_URL is required in CI/required mode.`);
      process.exitCode = 1;
      return;
    }

    console.warn(`[${SCRIPT_NAME}] SKIP: DATABASE_URL is not set.`);
    return;
  }

  const populationId = parsePopulationIdFromStatsRoute();
  if (populationId !== EXPECTED_POPULATION_ID) {
    console.error(
      `[${SCRIPT_NAME}] population_id mismatch: expected ${EXPECTED_POPULATION_ID}, got ${populationId}`,
    );
    process.exitCode = 1;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const [{ rows: mapRows }, { rows: statsRows }] = await Promise.all([
      client.query<{ id: string }>(mapPopulationSql),
      client.query<{ id: string }>(statsPopulationSql),
    ]);

    const mapIds = new Set(mapRows.map((row) => row.id));
    const statsIds = new Set(statsRows.map((row) => row.id));

    const mapMinusStats = [...mapIds].filter((id) => !statsIds.has(id));
    const statsMinusMap = [...statsIds].filter((id) => !mapIds.has(id));

    const mapCount = mapIds.size;
    const statsCount = statsIds.size;

    if (mapCount !== statsCount || mapMinusStats.length > 0 || statsMinusMap.length > 0) {
      console.error(`[${SCRIPT_NAME}] parity check failed`, {
        population_id: populationId,
        map_count: mapCount,
        stats_count: statsCount,
        map_minus_stats: mapMinusStats.length,
        stats_minus_map: statsMinusMap.length,
        sample_map_minus_stats: mapMinusStats.slice(0, 20),
        sample_stats_minus_map: statsMinusMap.slice(0, 20),
      });
      process.exitCode = 1;
      return;
    }

    console.log(`[${SCRIPT_NAME}] OK`, {
      population_id: populationId,
      map_count: mapCount,
      stats_count: statsCount,
      map_minus_stats: 0,
      stats_minus_map: 0,
    });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`[${SCRIPT_NAME}] unexpected error`, error);
  process.exitCode = 1;
});
