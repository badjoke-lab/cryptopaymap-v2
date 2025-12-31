import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { DbUnavailableError, dbQuery, getDbClient, hasDatabaseUrl } from "@/lib/db";
import { ensureSubmissionColumns, hasColumn, tableExists } from "@/lib/internal-submissions";
import type { SubmissionPayload } from "@/lib/submissions";

export const runtime = "nodejs";

type SubmissionRow = {
  id: string;
  status: string;
  kind: string;
  created_at: string;
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  accepted_chains: string[];
  contact_email: string;
  contact_name: string | null;
  role: string | null;
  about: string | null;
  payment_note: string | null;
  website: string | null;
  twitter: string | null;
  instagram: string | null;
  facebook: string | null;
  lat: number | null;
  lng: number | null;
  amenities: string[] | null;
  notes_for_admin: string | null;
  terms_accepted: boolean | null;
  payload: SubmissionPayload;
  published_place_id: string | null;
};

const buildVerificationInsert = async (
  route: string,
  client: Awaited<ReturnType<typeof getDbClient>>,
  placeId: string,
  level: string,
) => {
  const columnsCheck = await dbQuery<{ column_name: string }>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'verifications'
       AND column_name IN ('level', 'status', 'last_checked', 'last_verified')`,
    [],
    { route, client, retry: false },
  );

  const columns = new Set(columnsCheck.rows.map((row) => row.column_name));
  const hasLevel = columns.has("level");
  const hasStatus = columns.has("status");
  const hasLastChecked = columns.has("last_checked");
  const hasLastVerified = columns.has("last_verified");

  if (!hasLevel && !hasStatus) {
    return;
  }

  const insertColumns = ["place_id"];
  const values: string[] = ["$1"];
  const params: unknown[] = [placeId];

  if (hasStatus) {
    insertColumns.push("status");
    values.push(`$${params.length + 1}`);
    params.push(level);
  }

  if (hasLevel) {
    insertColumns.push("level");
    values.push(`$${params.length + 1}`);
    params.push(level);
  }

  if (hasLastChecked) {
    insertColumns.push("last_checked");
    values.push("NOW()");
  }

  if (hasLastVerified) {
    insertColumns.push("last_verified");
    values.push("NOW()");
  }

  const updateColumns = insertColumns
    .filter((column) => column !== "place_id")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");

  await dbQuery(
    `INSERT INTO verifications (${insertColumns.join(", ")})
     VALUES (${values.join(", ")})
     ON CONFLICT (place_id) DO UPDATE SET ${updateColumns}`,
    params,
    { route, client, retry: false },
  );
};

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
  }

  const { id } = params;
  const route = "api_internal_submissions_approve";
  let client: Awaited<ReturnType<typeof getDbClient>> | null = null;

  try {
    client = await getDbClient(route);

    const submissionsTableExists = await tableExists(route, "submissions", client);
    if (!submissionsTableExists) {
      return NextResponse.json({ error: "submissions table is missing" }, { status: 500 });
    }

    await ensureSubmissionColumns(route, client);

    const placesTableExists = await tableExists(route, "places", client);
    if (!placesTableExists) {
      return NextResponse.json({ error: "places table is missing" }, { status: 500 });
    }

    await dbQuery("BEGIN", [], { route, client, retry: false });

    const { rows } = await dbQuery<SubmissionRow>(
      `SELECT id, status, kind, created_at, name, country, city, address, category,
        accepted_chains, contact_email, contact_name, role, about, payment_note, website,
        twitter, instagram, facebook, lat, lng, amenities, notes_for_admin, terms_accepted,
        payload, published_place_id
       FROM submissions
       WHERE id = $1
       FOR UPDATE`,
      [id],
      { route, client, retry: false },
    );

    const submission = rows[0];
    if (!submission) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "pending") {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      if (submission.status === "approved" && submission.published_place_id) {
        return NextResponse.json({ placeId: submission.published_place_id });
      }
      return NextResponse.json({ error: `Submission already ${submission.status}` }, { status: 409 });
    }

    const placeId = randomUUID();

    await dbQuery(
      `INSERT INTO places (id, name, country, city, category, lat, lng, address, about)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        placeId,
        submission.name,
        submission.country,
        submission.city,
        submission.category,
        submission.lat,
        submission.lng,
        submission.address,
        submission.about,
      ],
      { route, client, retry: false },
    );

    const verificationsTableExists = await tableExists(route, "verifications", client);
    if (verificationsTableExists) {
      const verificationLevel = submission.kind === "owner" ? "owner" : "community";
      await buildVerificationInsert(route, client, placeId, verificationLevel);
    }

    const paymentAcceptsExists = await tableExists(route, "payment_accepts", client);
    if (paymentAcceptsExists && submission.accepted_chains?.length) {
      const hasMethod = await hasColumn(route, "payment_accepts", "method", client);
      const columns = hasMethod ? "(place_id, asset, chain, method)" : "(place_id, asset, chain)";
      const values = hasMethod ? "($1, $2, $3, $4)" : "($1, $2, $3)";
      const conflictTarget = hasMethod
        ? "(place_id, asset, chain, method)"
        : "(place_id, asset, chain)";

      for (const asset of submission.accepted_chains) {
        await dbQuery(
          `INSERT INTO payment_accepts ${columns}
           VALUES ${values}
           ON CONFLICT ${conflictTarget} DO NOTHING`,
          hasMethod ? [placeId, asset, asset, null] : [placeId, asset, asset],
          { route, client, retry: false },
        );
      }
    }

    await dbQuery(
      `UPDATE submissions
       SET status = 'approved',
           published_place_id = $2,
           approved_at = NOW()
       WHERE id = $1`,
      [id, placeId],
      { route, client, retry: false },
    );

    await dbQuery("COMMIT", [], { route, client, retry: false });

    return NextResponse.json({ placeId });
  } catch (error) {
    if (client) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    }
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[internal submissions] approve failed", error);
    return NextResponse.json({ error: "Failed to approve submission" }, { status: 500 });
  } finally {
    client?.release();
  }
}
