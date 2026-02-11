import type { PoolClient } from "pg";

import { dbQuery } from "@/lib/db";
import { recordHistoryEntry } from "@/lib/history";
import { hasColumn, tableExists } from "@/lib/internal-submissions";
import { buildSubmissionMediaUrl } from "@/lib/media/submissionMedia";
import type { OwnerCommunitySubmissionPayload, SubmissionPayload } from "@/lib/submissions";

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
  suggested_place_id?: string | null;
  published_place_id?: string | null;
  linked_place_id?: string | null;
  promoted_at?: string | null;
};

type PromoteResult =
  | { ok: true; placeId: string; mode: "insert" | "update" }
  | { ok: false; status: number; body: Record<string, unknown> };

type PromoteOptions = {
  galleryMediaIds?: string[];
};

type SubmissionMediaRow = {
  media_id: string | null;
  r2_key: string | null;
  url: string | null;
};

type PlaceMedia = {
  mediaId: string;
  url: string;
};

const extractMediaIdFromKey = (key?: string | null) => {
  if (!key) return null;
  const match = key.match(/\/([^/]+)\.webp$/);
  return match ? match[1] : key;
};

const extractMediaIdFromUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : url;
};

const loadSubmissionGalleryMedia = async (route: string, client: PoolClient, submissionId: string) => {
  const submissionsMediaExists = await tableExists(route, "submission_media", client);
  if (!submissionsMediaExists) {
    return [] as PlaceMedia[];
  }

  const columnRows = await dbQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'submission_media'
        AND column_name IN ('media_id', 'r2_key', 'url')
    `,
    [],
    { route, client, retry: false },
  );

  const columns = new Set(columnRows.rows.map((row) => row.column_name));
  const { rows } = await dbQuery<SubmissionMediaRow>(
    `SELECT
        ${columns.has("media_id") ? "media_id" : "NULL::text AS media_id"},
        ${columns.has("r2_key") ? "r2_key" : "NULL::text AS r2_key"},
        ${columns.has("url") ? "url" : "NULL::text AS url"}
     FROM submission_media
     WHERE submission_id = $1
       AND kind = 'gallery'
     ORDER BY id ASC`,
    [submissionId],
    { route, client, retry: false },
  );

  return rows
    .map((row) => {
      const mediaId = row.media_id ?? extractMediaIdFromKey(row.r2_key) ?? extractMediaIdFromUrl(row.url);
      if (!mediaId) return null;
      return {
        mediaId,
        url: buildSubmissionMediaUrl(submissionId, "gallery", mediaId),
      };
    })
    .filter((item): item is PlaceMedia => Boolean(item));
};

const syncPlaceMedia = async (route: string, client: PoolClient, placeId: string, media: PlaceMedia[]) => {
  const mediaTableExists = await tableExists(route, "media", client);
  if (!mediaTableExists) return;

  const columnRows = await dbQuery<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'media'
    `,
    [],
    { route, client, retry: false },
  );

  const columns = new Set(columnRows.rows.map((row) => row.column_name));
  if (!columns.has("place_id") || !columns.has("url")) {
    return;
  }

  await dbQuery(
    `DELETE FROM media
     WHERE place_id = $1`,
    [placeId],
    { route, client, retry: false },
  );

  if (!media.length) return;

  const hasKind = columns.has("kind");
  const hasType = columns.has("type");
  const deduped = Array.from(new Map(media.map((item) => [item.mediaId, item])).values());

  for (const item of deduped) {
    const insertColumns = ["place_id", "url"];
    const params: string[] = [placeId, item.url];

    if (hasKind) {
      insertColumns.push("kind");
      params.push("gallery");
    }

    if (hasType) {
      insertColumns.push("type");
      params.push("gallery");
    }

    const values = params.map((_, index) => `$${index + 1}`).join(", ");
    await dbQuery(
      `INSERT INTO media (${insertColumns.join(", ")})
       VALUES (${values})`,
      params,
      { route, client, retry: false },
    );
  }
};

const buildVerificationInsert = async (route: string, client: PoolClient, placeId: string, level: string) => {
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
    params.push("approved");
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

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const buildFallbackPlaceId = (submission: SubmissionRow) => {
  const country = submission.country?.toLowerCase() || "xx";
  const citySlug = slugify(submission.city || "city");
  const nameSlug = slugify(submission.name || "place");
  const categorySlug = slugify(submission.category || "category");
  const suffix = slugify(submission.id);
  return `cpm:${country}-${citySlug}-${submission.kind}-${categorySlug}-${nameSlug}-${suffix}`;
};

const collectMissingFields = (submission: SubmissionRow) => {
  const missing: string[] = [];

  const requireString = (value: string | null | undefined, field: string) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(field);
    }
  };

  const requireNumber = (value: number | null | undefined, field: string) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      missing.push(field);
    }
  };

  requireString(submission.name, "name");
  requireString(submission.country, "country");
  requireString(submission.city, "city");
  requireString(submission.category, "category");
  requireString(submission.address, "address");
  requireNumber(submission.lat, "lat");
  requireNumber(submission.lng, "lng");

  return missing;
};

export const promoteSubmission = async (
  route: string,
  client: PoolClient,
  actor: PromoteActor,
  submissionId: string,
  options: PromoteOptions = {},
): Promise<PromoteResult> => {
  const submissionsTableExists = await tableExists(route, "submissions", client);
  if (!submissionsTableExists) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Failed to promote submission",
        detail: "submissions table is missing",
        code: "SUBMISSIONS_TABLE_MISSING",
      },
    };
  }

  const placesTableExists = await tableExists(route, "places", client);
  if (!placesTableExists) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "Failed to promote submission",
        detail: "places table is missing",
        code: "PLACES_TABLE_MISSING",
      },
    };
  }

  const hasLinkedPlaceId = await hasColumn(route, "submissions", "linked_place_id", client);
  const hasPublishedPlaceId = await hasColumn(route, "submissions", "published_place_id", client);
  const hasSuggestedPlaceId = await hasColumn(route, "submissions", "suggested_place_id", client);
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
      hasSuggestedPlaceId ? "suggested_place_id" : null,
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
      return {
        ok: false,
        status: 404,
        body: {
          error: "Failed to promote submission",
          detail: "Submission not found",
          code: "NOT_FOUND",
        },
      };
    }

    if (!promoteKindAllowed(submission.kind)) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 409,
        body: {
          error: "Failed to promote submission",
          detail: `Submission kind cannot be promoted (${submission.kind})`,
          code: "INVALID_KIND",
          kind: submission.kind,
        },
      };
    }

    if (submission.status !== "approved") {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 409,
        body: {
          error: "Failed to promote submission",
          detail: "Submission must be approved before promote",
          code: "NOT_APPROVED",
          status: submission.status,
        },
      };
    }

    const missingFields = collectMissingFields(submission);
    if (missingFields.length) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return {
        ok: false,
        status: 400,
        body: {
          error: "Failed to promote submission",
          detail: `Submission missing required fields: ${missingFields.join(", ")}`,
          code: "MISSING_FIELDS",
          missingFields,
        },
      };
    }

    const linkedPlaceId =
      (linkColumn === "linked_place_id" ? submission.linked_place_id : submission.published_place_id) ?? null;
    const suggestedPlaceId = hasSuggestedPlaceId ? submission.suggested_place_id ?? null : null;
    const placeId = linkedPlaceId ?? suggestedPlaceId ?? buildFallbackPlaceId(submission);

    // Idempotency:
    // - Prefer promoted_at when available.
    // - Otherwise (or additionally), treat an existing promote history entry as already promoted.
    // This prevents duplicate history entries / repeated upserts on retries.
    const historyTableExists = await tableExists(route, "history", client);
    const alreadyPromoted =
      (hasPromotedAt && Boolean(submission.promoted_at)) ||
      (historyTableExists &&
        (await dbQuery(
          `SELECT 1
           FROM public.history
           WHERE submission_id = $1
             AND action = 'promote'
           LIMIT 1`,
          [submissionId],
          { route, client, retry: false },
        )).rowCount > 0);

    if (alreadyPromoted) {
      await dbQuery("ROLLBACK", [], { route, client, retry: false });
      return { ok: true, placeId, mode: "update" };
    }

    const {
      rows: placeExistsRows,
    } = await dbQuery<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM places WHERE id = $1) AS exists",
      [placeId],
      { route, client, retry: false },
    );
    const placeExists = placeExistsRows[0]?.exists ?? false;
    const mode: "insert" | "update" = placeExists || Boolean(linkedPlaceId) ? "update" : "insert";

    const availableGalleryMedia = await loadSubmissionGalleryMedia(route, client, submissionId);
    const requestedGalleryMediaIds = options.galleryMediaIds
      ? Array.from(new Set(options.galleryMediaIds.map((item) => item.trim()).filter((item) => item.length > 0)))
      : null;

    if (requestedGalleryMediaIds) {
      const availableIds = new Set(availableGalleryMedia.map((item) => item.mediaId));
      const invalidIds = requestedGalleryMediaIds.filter((item) => !availableIds.has(item));
      if (invalidIds.length) {
        await dbQuery("ROLLBACK", [], { route, client, retry: false });
        return {
          ok: false,
          status: 400,
          body: {
            error: "Failed to promote submission",
            detail: "Invalid gallery media selection",
            code: "INVALID_GALLERY_MEDIA",
            invalidMediaIds: invalidIds,
          },
        };
      }
    }

    const ownerPayload = submission.payload as OwnerCommunitySubmissionPayload;
    const paymentNote = ownerPayload.paymentNote ?? null;
    const amenities = ownerPayload.amenities ?? null;
    const submitterName = ownerPayload.contactName ?? ownerPayload.submitterName ?? null;

    await dbQuery(
      `INSERT INTO places (
        id,
        name,
        country,
        city,
        category,
        lat,
        lng,
        address,
        about,
        payment_note,
        amenities,
        submitter_name
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         country = EXCLUDED.country,
         city = EXCLUDED.city,
         category = EXCLUDED.category,
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         address = EXCLUDED.address,
         about = EXCLUDED.about,
         payment_note = EXCLUDED.payment_note,
         amenities = EXCLUDED.amenities,
         submitter_name = EXCLUDED.submitter_name`,
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
        paymentNote,
        amenities,
        submitterName,
      ],
      { route, client, retry: false },
    );

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
      const conflictTarget = hasMethod ? "(place_id, asset, chain, method)" : "(place_id, asset, chain)";

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

    const mediaToPublish = requestedGalleryMediaIds
      ? availableGalleryMedia.filter((item) => requestedGalleryMediaIds.includes(item.mediaId))
      : availableGalleryMedia;
    await syncPlaceMedia(route, client, placeId, mediaToPublish);

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

    return { ok: true, placeId, mode };
  } catch (error) {
    await dbQuery("ROLLBACK", [], { route, client, retry: false }).catch(() => undefined);
    throw error;
  }
};
