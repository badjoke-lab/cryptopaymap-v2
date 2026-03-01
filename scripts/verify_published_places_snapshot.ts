import { readFile } from "node:fs/promises";
import path from "node:path";

type SnapshotPlace = {
  id?: unknown;
  country?: unknown;
};

type Snapshot = {
  places?: SnapshotPlace[];
};

const SNAPSHOT_PATH = path.join(process.cwd(), "data", "fallback", "published_places_snapshot.json");

const LEGACY_TEST_IDS = new Set([
  "cpm:tokyo:owner-cafe-1",
  "cpm:newyork:community-diner-1",
  "cpm:paris:directory-bistro-1",
  "cpm:sydney:unverified-bookstore-1",
  "cpm:toronto:owner-bakery-1",
]);

const isAntarcticaDemoId = (id: string) => id.toLowerCase().startsWith("antarctica-");

async function main() {
  const raw = await readFile(SNAPSHOT_PATH, "utf8");
  const parsed = JSON.parse(raw) as Snapshot;
  const places = Array.isArray(parsed.places) ? parsed.places : [];

  const flaggedIds: string[] = [];
  let antarcticaCountryCount = 0;

  for (const place of places) {
    const id = typeof place.id === "string" ? place.id : "";
    const country = typeof place.country === "string" ? place.country.trim().toUpperCase() : "";

    if (id && (LEGACY_TEST_IDS.has(id) || isAntarcticaDemoId(id))) {
      flaggedIds.push(id);
    }

    if (country === "AQ") {
      antarcticaCountryCount += 1;
    }
  }

  if (flaggedIds.length > 0 || antarcticaCountryCount > 0) {
    console.error("[verify_published_places_snapshot] FAILED", {
      snapshot: SNAPSHOT_PATH,
      total_places: places.length,
      flagged_ids: flaggedIds,
      aq_count: antarcticaCountryCount,
    });
    process.exitCode = 1;
    return;
  }

  console.log("[verify_published_places_snapshot] PASS", {
    snapshot: SNAPSHOT_PATH,
    total_places: places.length,
    flagged_ids: 0,
    aq_count: antarcticaCountryCount,
  });
}

main().catch((error) => {
  console.error("[verify_published_places_snapshot] FAILED", error);
  process.exitCode = 1;
});
