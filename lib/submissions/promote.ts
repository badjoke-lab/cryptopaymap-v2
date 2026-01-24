import { randomUUID } from "crypto";

import type { PoolClient } from "pg";

import { dbQuery } from "@/lib/db";
import { recordHistoryEntry } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";
import type { SubmissionPayload } from "@/lib/submissions";

type PromoteActor = Parameters<typeof recordHistoryEntry>[0]["actor"];

type SubmissionRow = {
  id: string;
  status: string;
  kind: string;
  country: string;
  city: string;
  category: string;
  accepted_chains: string[] | null;
  name: string;
  address: string;
  about: string | null;
  lat: number | null;
  lng: number | null;
  payload: SubmissionPayload;
  published_place_id?: string | null;
  linked_place_id?: string | null;
  promoted_at?: string | null;
};

type PromoteResult =
  | { ok: true; placeId: string; promoted: boolean }
  | { ok: false; status: number; body: Record<string, unknown> };

const buildVerificationInsert = async (
  route: string,
  client: PoolClient,
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

const promoteKindAllowed = (kind: string) => kind === "owner" || kind === "community";

export const promoteSubmission = async (
  route: string,
  client: PoolClient,
  actor: PromoteActor,
  submissionId: string,
): Promise<PromoteResult> => {
  const submissionsTableExists = await tableExists(route, "submissions", client);
  if (!submissionsTableExists) {
    return { ok: false, status: 500, body: { error: "submissions table is missing" } };
  }

  const placesTableExists = await tableExists(route, "places", client);
  if (!placesTableExists) {
    return { ok: false, status: 500, body: { error: "places table is missing" } };
  }

  const hasLinkedPlaceId = await hasColumn(route, "submissions", "linked_place_id", client);
  const hasPublishedPlaceId = await hasColumn(route, "submissions", "published_place_id", client);
  const linkColumn = hasLinkedPlaceId ? "linked_place_id" : hasPublishedPlaceId ? "published_place_id" : null;
  const hasPromotedAt = await hasColumn(route, "submissions", "promoted_at", client);

  await dbQuery("BEGIN", [], { route, client, retry: false });

  try {
    const selectColumns = [
      "id",
      "status",
      "kind",
      "country",
      "city",
      "category",
      "accepted_chains",
      "name",
      "address",
      "about",
      "lat",
      "lng",
      "payload",
      hasPublishedPlaceId ? "published_place_id" : null,
      hasLinkedPlaceId ? "linked_place_id" : null,
      hasPromotedAt ? "promoted_at" : null,
    ]
      .filter(Boolean)
      .join(", ");

    const { rows } = await dbQuery<SubmissionRow>(
      `SELECT ${selectColumns}
       FROM submissions
       WHERE id = $1
       FOR UPDATE`,
      [submissionId],
      { route, client, retry: false },
    );

    const submission = rows[0];
    if (!submission) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return { ok: false, status: 404, body: { error: "Submission not found" } };
    }

    if (!promoteKindAllowed(submission.kind)) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 409,
        body: { error: "Submission kind cannot be promoted", kind: submission.kind },
      };
    }

    if (submission.status !== "approved") {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 409,
        body: { error: "Submission must be approved before promote", status: submission.status },
      };
    }

    const linkedPlaceId =
      (linkColumn === "linked_place_id" ? submission.linked_place_id : submission.published_place_id) ?? null;
    const alreadyPromoted = Boolean(linkedPlaceId) || (hasPromotedAt && submission.promoted_at);
    if (alreadyPromoted) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 409,
        body: { error: "Submission already promoted", placeId: linkedPlaceId },
      };
    }

    const placeId = linkedPlaceId ?? randomUUID();

    if (linkedPlaceId) {
      await dbQuery(
        `UPDATE places
         SET name = $2,
             country = $3,
             city = $4,
             category = $5,
             lat = $6,
             lng = $7,
             address = $8,
             about = $9
         WHERE id = $1`,
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
    } else {
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
    }

    const verificationsTableExists = await tableExists(route, "verifications", client);
    if (verificationsTableExists) {
      const verificationLevel = submission.kind === "owner" ? "owner" : "community";
      await buildVerificationInsert(route, client, placeId, verificationLevel);
    }

    const paymentAcceptsExists = await tableExists(route, "payment_accepts", client);
    if (paymentAcceptsExists) {
      const hasMethod = await hasColumn(route, "payment_accepts", "method", client);
      const columns = hasMethod ? "(place_id, asset, chain, method)" : "(place_id, asset, chain)";
      const values = hasMethod ? "($1, $2, $3, $4)" : "($1, $2, $3)";
      const conflictTarget = hasMethod
        ? "(place_id, asset, chain, method)"
        : "(place_id, asset, chain)";

      if (submission.accepted_chains?.length) {
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
    }

    const submissionUpdates: string[] = [];
    const submissionParams: unknown[] = [submissionId];

    if (linkColumn) {
      submissionUpdates.push(`${linkColumn} = $${submissionParams.length + 1}`);
      submissionParams.push(placeId);
    }

    if (hasPromotedAt) {
      submissionUpdates.push(`promoted_at = NOW()`);
    }

    if (submissionUpdates.length) {
      await dbQuery(
        `UPDATE submissions
         SET ${submissionUpdates.join(", ")}
         WHERE id = $1`,
        submissionParams,
        { route, client, retry: false },
      );
    }

    await recordHistoryEntry({
      route,
      client,
      actor,
      action: "promote",
      submissionId,
      placeId,
      meta: {
        statusBefore: submission.status,
        statusAfter: submission.status,
        country: submission.country,
        city: submission.city,
        kind: submission.kind,
        category: submission.category,
      },
    });

    await dbQuery("COMMIT", [], { route, client, retry: false });

    return { ok: true, placeId, promoted: true };
  } catch (error) {
    await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    throw error;
  }
};
