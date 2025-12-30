import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, getDbClient } from "@/lib/db";
import { buildPlaceIdPrefix, submissionToPlace } from "@/lib/submission-to-place";
import { loadSubmissionById, saveSubmission } from "@/lib/submissions";

const tableExists = async (route: string, table: string) => {
  const { rows } = await dbQuery<{ present: string | null }>(
    `SELECT to_regclass($1) AS present`,
    [`public.${table}`],
    { route },
  );

  return Boolean(rows[0]?.present);
};

const loadExistingIds = async (route: string, prefix: string) => {
  const { rows } = await dbQuery<{ id: string }>(
    `SELECT id FROM places WHERE id LIKE $1`,
    [`${prefix}%`],
    { route },
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

  const route = "api_submissions_promote";

  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);
    const placesTableExists = await tableExists(route, "places");
    if (!placesTableExists) {
      return NextResponse.json({ error: "places table is missing" }, { status: 500 });
    }

    const idPrefix = buildPlaceIdPrefix(submission);
    const existingIds = await loadExistingIds(route, idPrefix);
    let place: ReturnType<typeof submissionToPlace>;

    try {
      place = submissionToPlace(submission, { existingIds });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid submission";
      if (message.toLowerCase().includes("lat/lng")) {
        return NextResponse.json(
          { error: "Cannot promote: missing coordinates (lat/lng)." },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: message }, { status: 400 });
    }

    await dbQuery("BEGIN", [], { route, client, retry: false });

    await dbQuery(
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
      { route, client, retry: false },
    );

    const verificationsTableExists = await tableExists(route, "verifications");
    if (verificationsTableExists) {
      await dbQuery(
        `INSERT INTO verifications (place_id, status, last_checked, last_verified)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (place_id) DO UPDATE SET status = EXCLUDED.status, last_checked = EXCLUDED.last_checked, last_verified = EXCLUDED.last_verified`,
        [place.id, place.verification],
        { route, client, retry: false },
      );
    }

    const paymentAcceptsExists = await tableExists(route, "payment_accepts");
    if (paymentAcceptsExists && place.accepted?.length) {
      for (const asset of place.accepted) {
        await dbQuery(
          `INSERT INTO payment_accepts (place_id, asset, chain)
           VALUES ($1, $2, $3)
           ON CONFLICT (place_id, asset, chain, method) DO NOTHING`,
          [place.id, asset, asset],
          { route, client, retry: false },
        );
      }
    }

    await dbQuery("COMMIT", [], { route, client, retry: false });

    const updatedSubmission = await saveSubmission({
      ...submission,
      linkedPlaceId: place.id,
      promotedAt: new Date().toISOString(),
    });

    return NextResponse.json({ place, submission: updatedSubmission });
  } catch (error) {
    if (client) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    }
    if (
      error instanceof DbUnavailableError ||
      (error instanceof Error && error.message.includes("DATABASE_URL"))
    ) {
      return NextResponse.json({ ok: false, error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[submissions] failed to promote", error);
    return NextResponse.json({ error: "Failed to promote submission" }, { status: 500 });
  } finally {
    client?.release();
  }
}
