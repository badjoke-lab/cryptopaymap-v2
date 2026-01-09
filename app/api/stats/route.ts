import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";

type VerificationLevel = "owner" | "community" | "directory" | "unverified";

// Response shape for GET /api/stats.
export type StatsApiResponse = {
  meta: { source: "db" | "zero"; updatedAt: string };
  totals: { places: number };
  byCountry: Array<{ key: string; count: number }>;
  byCategory: Array<{ key: string; count: number }>;
  byVerification: Array<{ key: VerificationLevel; count: number }>;
  byChain: Array<{ key: string; count: number }>;
};

const VERIFICATION_LEVELS: VerificationLevel[] = [
  "owner",
  "community",
  "directory",
  "unverified",
];

const CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=60";
const TOP_COUNTRY_LIMIT = 50;
const TOP_CATEGORY_LIMIT = 50;
const TOP_CHAIN_LIMIT = 50;

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    "SELECT to_regclass($1) AS present",
    [`public.${table}`],
    { route },
  );

  return Boolean(rows[0]?.present);
};

const ensureIndexes = async (
  route: string,
  hasVerifications: boolean,
  verificationColumn: string | null,
  hasPayments: boolean,
) => {
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

  if (hasPayments) {
    await dbQuery(
      "CREATE INDEX IF NOT EXISTS payment_accepts_chain_idx ON public.payment_accepts (chain)",
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

const toZeroResponse = (updatedAt: string): StatsApiResponse => ({
  meta: { source: "zero", updatedAt },
  totals: { places: 0 },
  byCountry: [],
  byCategory: [],
  byVerification: VERIFICATION_LEVELS.map((level) => ({ key: level, count: 0 })),
  byChain: [],
});

const hasColumn = async (route: string, table: string, column: string) => {
  const { rows } = await dbQuery<{ present: number }>(
    `SELECT COUNT(*)::int AS present
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1
       AND column_name = $2`,
    [table, column],
    { route },
  );
  return (rows[0]?.present ?? 0) > 0;
};

export async function GET() {
  const route = "api_stats";
  const updatedAt = new Date().toISOString();

  if (!hasDatabaseUrl()) {
    return NextResponse.json<StatsApiResponse>(
      toZeroResponse(updatedAt),
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }

  try {
    const placesTableExists = await tableExists(route, "places");
    if (!placesTableExists) {
      return NextResponse.json<StatsApiResponse>(
        toZeroResponse(updatedAt),
        { headers: { "Cache-Control": CACHE_CONTROL } },
      );
    }

    const hasVerifications = await tableExists(route, "verifications");
    const hasPayments = await tableExists(route, "payment_accepts");
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

    await ensureIndexes(route, hasVerifications, verificationColumn, hasPayments);

    const hasCountry = await hasColumn(route, "places", "country");
    const hasCategory = await hasColumn(route, "places", "category");
    const hasPaymentChain = hasPayments ? await hasColumn(route, "payment_accepts", "chain") : false;
    const hasPaymentAsset = hasPayments ? await hasColumn(route, "payment_accepts", "asset") : false;

    const [{ rows: totalRows }, { rows: countryRows }, { rows: categoryRows }, { rows: chainRows }] = await Promise.all([
      dbQuery<{ total: string }>("SELECT COUNT(*) AS total FROM places", [], { route }),
      hasCountry
        ? dbQuery<{ key: string | null; total: string }>(
            `SELECT country AS key, COUNT(*) AS total
             FROM places
             WHERE NULLIF(BTRIM(country), '') IS NOT NULL
             GROUP BY country
             ORDER BY COUNT(*) DESC
             LIMIT $1`,
            [TOP_COUNTRY_LIMIT],
            { route },
          )
        : Promise.resolve({ rows: [] }),
      hasCategory
        ? dbQuery<{ key: string | null; total: string }>(
            `SELECT category AS key, COUNT(*) AS total
             FROM places
             WHERE NULLIF(BTRIM(category), '') IS NOT NULL
             GROUP BY category
             ORDER BY COUNT(*) DESC
             LIMIT $1`,
            [TOP_CATEGORY_LIMIT],
            { route },
          )
        : Promise.resolve({ rows: [] }),
      hasPayments && (hasPaymentChain || hasPaymentAsset)
        ? dbQuery<{ key: string | null; total: string }>(
            `SELECT
               COALESCE(NULLIF(BTRIM(chain), ''), NULLIF(BTRIM(asset), '')) AS key,
               COUNT(*) AS total
             FROM payment_accepts
             WHERE NULLIF(BTRIM(chain), '') IS NOT NULL
                OR NULLIF(BTRIM(asset), '') IS NOT NULL
             GROUP BY key
             ORDER BY COUNT(*) DESC
             LIMIT $1`,
            [TOP_CHAIN_LIMIT],
            { route },
          )
        : Promise.resolve({ rows: [] }),
    ]);

    const totalPlaces = Number(totalRows[0]?.total ?? 0);

    const byCountry = countryRows
      .map((row) => ({
        key: row.key ?? "Unknown",
        count: Number(row.total ?? 0),
      }))
      .filter((entry) => entry.count > 0);

    const byCategory = categoryRows
      .map((row) => ({
        key: row.key ?? "Unknown",
        count: Number(row.total ?? 0),
      }))
      .filter((entry) => entry.count > 0);

    const byChain = chainRows
      .map((row) => ({
        key: row.key ?? "Unknown",
        count: Number(row.total ?? 0),
      }))
      .filter((entry) => entry.count > 0);

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
      key: level,
      count: verificationCounts.get(level) ?? 0,
    }));

    return NextResponse.json<StatsApiResponse>(
      {
        meta: { source: "db", updatedAt },
        totals: { places: totalPlaces },
        byCountry,
        byCategory,
        byVerification,
        byChain,
      },
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      console.error("[stats] database unavailable, serving zero stats");
    } else {
      console.error("[stats] failed to load stats", error);
    }
    return NextResponse.json<StatsApiResponse>(
      toZeroResponse(updatedAt),
      { headers: { "Cache-Control": CACHE_CONTROL } },
    );
  }
}
