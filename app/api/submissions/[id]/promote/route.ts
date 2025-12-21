import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { buildPlaceIdPrefix, submissionToPlace } from "@/lib/submission-to-place";
import { loadSubmissionById, saveSubmission } from "@/lib/submissions";

const tableExists = async (client: import("pg").PoolClient, table: string) => {
  const { rows } = await client.query<{ present: string | null }>(
    `SELECT to_regclass($1) AS present`,
    [`public.${table}`],
  );

  return Boolean(rows[0]?.present);
};

const loadExistingIds = async (client: import("pg").PoolClient, prefix: string) => {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM places WHERE id LIKE $1`,
    [`${prefix}%`],
  );

  return rows.map((row) => row.id);
};

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const { id } = params;

  let submission;
  try {
    submission = await loadSubmissionById(id);
  } catch {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  if (submission.status !== "approved") {
    return NextResponse.json({ error: "Submission must be approved first" }, { status: 400 });
  }

  if (submission.linkedPlaceId) {
    return NextResponse.json({ error: "Submission already linked to a place" }, { status: 400 });
  }

  let pool: ReturnType<typeof getDbPool>;
  try {
    pool = getDbPool();
  } catch (error) {
    console.error("[submissions] missing DATABASE_URL", error);
    return NextResponse.json({ error: "Database is not configured" }, { status: 500 });
  }

  const client = await pool.connect();

  try {
    const placesTableExists = await tableExists(client, "places");
    if (!placesTableExists) {
      return NextResponse.json({ error: "places table is missing" }, { status: 500 });
    }

    const idPrefix = buildPlaceIdPrefix(submission);
    const existingIds = await loadExistingIds(client, idPrefix);
    let place: ReturnType<typeof submissionToPlace>;

    try {
      place = submissionToPlace(submission, { existingIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid submission";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO places (id, name, country, city, category, lat, lng, address, about, amenities)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        place.id,
        place.name,
        place.country,
        place.city,
        place.category,
        place.lat,
        place.lng,
        place.address_full ?? place.address ?? null,
        place.about ?? null,
        place.amenities ? JSON.stringify(place.amenities) : null,
      ],
    );

    const verificationsTableExists = await tableExists(client, "verifications");
    if (verificationsTableExists) {
      await client.query(
        `INSERT INTO verifications (place_id, status, last_checked, last_verified)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (place_id) DO UPDATE SET status = EXCLUDED.status, last_checked = EXCLUDED.last_checked, last_verified = EXCLUDED.last_verified`,
        [place.id, place.verification],
      );
    }

    const paymentAcceptsExists = await tableExists(client, "payment_accepts");
    if (paymentAcceptsExists && place.accepted?.length) {
      for (const asset of place.accepted) {
        await client.query(
          `INSERT INTO payment_accepts (place_id, asset, chain)
           VALUES ($1, $2, $3)
           ON CONFLICT (place_id, asset, chain, method) DO NOTHING`,
          [place.id, asset, asset],
        );
      }
    }

    await client.query("COMMIT");

    const updatedSubmission = await saveSubmission({
      ...submission,
      linkedPlaceId: place.id,
      promotedAt: new Date().toISOString(),
    });

    return NextResponse.json({ place, submission: updatedSubmission });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[submissions] failed to promote", error);
    return NextResponse.json({ error: "Failed to promote submission" }, { status: 500 });
  } finally {
    client.release();
  }
}

