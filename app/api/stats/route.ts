import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";

type VerificationLevel = "owner" | "community" | "directory" | "unverified";

// Response shape for GET /api/stats.
export type StatsApiResponse = {
  total_places: number;
  by_country: Array<{ country: string; total: number }>;
  by_verification: Array<{ level: VerificationLevel; total: number }>;
};

const VERIFICATION_LEVELS: VerificationLevel[] = [
  "owner",
  "community",
  "directory",
  "unverified",
];

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const TOP_COUNTRY_LIMIT = 50;

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    "SELECT to_regclass($1) AS present",
    [`public.${table}`],
    { route },
  );

  return Boolean(rows[0]?.present);
};

const ensureIndexes = async (route: string, hasVerifications: boolean, verificationColumn: string | null) => {
  await dbQuery(
    "CREATE INDEX IF NOT EXISTS places_country_idx ON public.places (country)",
    [],
    { route },
  );

  if (hasVerifications && verificationColumn) {
    await dbQuery(
      `CREATE INDEX IF NOT EXISTS verifications_${verificationColumn}_idx ON public.verifications (${verificationColumn})`,
      [],
      { route },
    );
  }
};

const normalizeVerificationLevel = (value: string | null): VerificationLevel => {
  if (value === "owner" || value === "community" || value === "directory" || value === "unverified") {
    return value;
  }
  return "unverified";
};

export async function GET() {
  const route = "api_stats";

  if (!hasDatabaseUrl()) {
    const empty = VERIFICATION_LEVELS.map((level) => ({ level, total: 0 }));
    return NextResponse.json<StatsApiResponse>(
      { total_places: 0, by_country: [], by_verification: empty },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  try {
    const placesTableExists = await tableExists(route, "places");
    if (!placesTableExists) {
      const empty = VERIFICATION_LEVELS.map((level) => ({ level, total: 0 }));
      return NextResponse.json<StatsApiResponse>(
        { total_places: 0, by_country: [], by_verification: empty },
        { headers: { "Cache-Control": CACHE_CONTROL } },
      );
    }

    const hasVerifications = await tableExists(route, "verifications");
    let verificationColumn: string | null = null;

    if (hasVerifications) {
      const { rows } = await dbQuery<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'verifications'
           AND column_name IN ('level', 'status')`,
        [],
        { route },
      );
      if (rows.some((row) => row.column_name === "level")) {
        verificationColumn = "level";
      } else if (rows.some((row) => row.column_name === "status")) {
        verificationColumn = "status";
      }
    }

    await ensureIndexes(route, hasVerifications, verificationColumn);

    const [{ rows: totalRows }, { rows: countryRows }] = await Promise.all([
      dbQuery<{ total: string }>("SELECT COUNT(*) AS total FROM places", [], { route }),
      dbQuery<{ country: string | null; total: string }>(
        `SELECT country, COUNT(*) AS total
         FROM places
         WHERE NULLIF(BTRIM(country), '') IS NOT NULL
         GROUP BY country
         ORDER BY COUNT(*) DESC
         LIMIT $1`,
        [TOP_COUNTRY_LIMIT],
        { route },
      ),
    ]);

    const totalPlaces = Number(totalRows[0]?.total ?? 0);

    const byCountry = countryRows
      .map((row) => ({
        country: row.country ?? "Unknown",
        total: Number(row.total ?? 0),
      }))
      .filter((entry) => entry.total > 0);

    let verificationCounts = new Map<VerificationLevel, number>();
    VERIFICATION_LEVELS.forEach((level) => verificationCounts.set(level, 0));

    if (hasVerifications && verificationColumn) {
      const { rows } = await dbQuery<{ level: string | null; total: string }>(
        `SELECT COALESCE(v.${verificationColumn}, 'unverified') AS level, COUNT(*) AS total
         FROM places p
         LEFT JOIN verifications v ON v.place_id = p.id
         GROUP BY level`,
        [],
        { route },
      );
      verificationCounts = new Map(
        VERIFICATION_LEVELS.map((level) => [level, 0]),
      );
      rows.forEach((row) => {
        const level = normalizeVerificationLevel(row.level);
        verificationCounts.set(level, (verificationCounts.get(level) ?? 0) + Number(row.total ?? 0));
      });
    } else {
      verificationCounts.set("unverified", totalPlaces);
    }

    const byVerification = VERIFICATION_LEVELS.map((level) => ({
      level,
      total: verificationCounts.get(level) ?? 0,
    }));

    return NextResponse.json<StatsApiResponse>(
      {
        total_places: totalPlaces,
        by_country: byCountry,
        by_verification: byVerification,
      },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[stats] failed to load stats", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
