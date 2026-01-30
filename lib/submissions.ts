import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";
import { insertSubmissionMedia, withSubmissionMediaClient } from "@/lib/db/media";
import { MediaProcessingError, processImage } from "@/lib/media/processImage";
import {
  deleteSubmissionMediaObject,
  type SubmissionMediaKind,
  uploadSubmissionMediaObject,
} from "@/lib/storage/r2";

import { parseMultipartSubmission, type MultipartFilesByField } from "@/lib/submissions/parseMultipart";
import { emptyAcceptedMediaSummary, validateMultipartSubmission } from "@/lib/submissions/validateMultipart";

export type SubmissionKind = "owner" | "community" | "report";
export type SubmissionLevel = "owner" | "community" | "unverified";

type SubmissionPayloadBase = {
  verificationRequest: SubmissionKind;
  kind: SubmissionKind;
  placeId?: string;
  placeName?: string;
  notes?: string;
  contactEmail?: string;
  contactName?: string;
  submitterName?: string;
  communityEvidenceUrls?: string[];
  amenitiesNotes?: string;
  submittedBy?: Record<string, unknown>;
};

export type OwnerCommunitySubmissionPayload = SubmissionPayloadBase & {
  verificationRequest: "owner" | "community";
  kind: "owner" | "community";
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  acceptedChains: string[];
  ownerVerification: string;
  role?: string;
  about?: string;
  paymentNote?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  lat?: number;
  lng?: number;
  amenities?: string[];
  amenitiesNotes?: string;
  notesForAdmin?: string;
  termsAccepted?: boolean;
};

export type ReportSubmissionPayload = SubmissionPayloadBase & {
  verificationRequest: "report";
  kind: "report";
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  acceptedChains: string[];
  reportAction: string;
  reportReason: string;
  reportDetails?: string;
};

export type SubmissionPayload = OwnerCommunitySubmissionPayload | ReportSubmissionPayload;

type SubmissionErrors = Record<string, string>;

const submissionsDir = path.join(process.cwd(), "data", "submissions");

const HONEYPOT_FIELDS = ["websiteUrl", "url", "website_url"];
const RATE_LIMIT_WINDOW_MS = 30_000;
const RATE_LIMIT_MAX = 3;
const rateLimitBuckets = new Map<string, number[]>();

const getClientIp = (request: Request): string => {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? "unknown";
};

const isRateLimited = (key: string) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (rateLimitBuckets.get(key) ?? []).filter((timestamp) => timestamp >= windowStart);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(key, recent);
    return true;
  }
  recent.push(now);
  rateLimitBuckets.set(key, recent);
  return false;
};

const getHoneypotValue = (body: Record<string, unknown>): string | undefined => {
  for (const field of HONEYPOT_FIELDS) {
    const value = ensureString(body[field]);
    if (value) return value;
  }
  return undefined;
};

const writeSubmissionToDisk = async (record: StoredSubmission) => {
  await fs.mkdir(submissionsDir, { recursive: true });
  const filePath = path.join(submissionsDir, `${record.submissionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
};

export const saveSubmission = async (record: StoredSubmission): Promise<StoredSubmission> => {
  try {
    await writeSubmissionToDisk(record);
  } catch (error) {
    console.error("[submissions] failed to write to disk", error);
  }
  return record;
};

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type StoredSubmission = {
  submissionId: string;
  createdAt: string;
  status: SubmissionStatus;
  suggestedPlaceId: string;
  kind: SubmissionKind;
  level: SubmissionLevel;
  placeId?: string | null;
  submittedBy: Record<string, unknown>;
  linkedPlaceId?: string;
  promotedAt?: string;
  payload: SubmissionPayload;
  reviewNote?: string;
  reviewedAt?: string;
};

type NormalizationResult =
  | { ok: true; payload: SubmissionPayload }
  | { ok: false; errors: SubmissionErrors };

const MAX_LENGTHS = {
  name: 160,
  country: 3,
  city: 120,
  address: 200,
  category: 60,
  contactEmail: 200,
  contactName: 120,
  role: 40,
  about: 600,
  paymentNote: 150,
  website: 200,
  twitter: 200,
  instagram: 200,
  facebook: 200,
  ownerVerification: 40,
  reportAction: 40,
  notesForAdmin: 300,
  placeName: 80,
  reportReason: 120,
  reportDetails: 2000,
  chain: 40,
  amenity: 40,
  amenitiesNotes: 300,
  communityEvidenceUrl: 500,
};

const MAX_ACCEPTED_CHAINS = 12;
const MAX_AMENITIES = 20;
const MAX_COMMUNITY_EVIDENCE_URLS = 10;

const emailRegex = /[^@]+@[^.]+\..+/;

const ensureString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
};

const ensureStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
};

const ensureNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const generateRandomSuffix = () => Math.random().toString(36).slice(2, 7);

const generateSubmissionId = () => {
  const now = new Date();
  const pad = (num: number) => num.toString().padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `sub-${date}-${time}-${generateRandomSuffix()}`;
};

const generateSuggestedPlaceId = (payload: SubmissionPayload) => {
  if (payload.verificationRequest === "report") {
    const suffix = generateRandomSuffix();
    const base = payload.placeId ? slugify(payload.placeId) : slugify(payload.placeName ?? "report");
    return `cpm:report-${base}-${suffix}`;
  }

  const country = payload.country.toLowerCase();
  const citySlug = slugify(payload.city || "city");
  const nameSlug = slugify(payload.name || "place");
  const categorySlug = slugify(payload.category || "category");
  const suffix = generateRandomSuffix();
  return `cpm:${country}-${citySlug}-${payload.verificationRequest}-${categorySlug}-${nameSlug}-${suffix}`;
};

const resolveSubmissionKind = (obj: Record<string, unknown>): SubmissionKind | undefined => {
  const kind = ensureString(obj.kind);
  const verificationRequest = ensureString(obj.verificationRequest);
  const candidate = kind ?? verificationRequest;
  if (candidate === "owner" || candidate === "community" || candidate === "report") {
    return candidate;
  }
  return undefined;
};

const levelForKind = (kind: SubmissionKind): SubmissionLevel => {
  if (kind === "owner") return "owner";
  if (kind === "community") return "community";
  return "unverified";
};

const buildSubmittedBy = (obj: Record<string, unknown> | SubmissionPayload, kind: SubmissionKind) => {
  if (obj.submittedBy && typeof obj.submittedBy === "object") {
    return obj.submittedBy as Record<string, unknown>;
  }

  const submittedBy: Record<string, unknown> = {};
  const contactName = ensureString(obj.contactName);
  const submitterName = ensureString(obj.submitterName);
  const contactEmail = ensureString(obj.contactEmail);
  if (contactName || submitterName) submittedBy.name = contactName ?? submitterName;
  if (contactEmail) submittedBy.email = contactEmail;
  submittedBy.kind = kind;
  return submittedBy;
};

const validateLength = (
  errors: SubmissionErrors,
  field: string,
  value: string | undefined,
  max: number,
) => {
  if (!value) return;
  if (value.length > max) {
    errors[field] = `Must be ${max} characters or fewer`;
  }
};

const normalizeStringArray = (
  value: unknown,
  maxItemLength: number,
  maxItems: number,
  field: string,
  errors: SubmissionErrors,
) => {
  const cleaned = ensureStringArray(value);
  if (!cleaned) return undefined;
  if (cleaned.length > maxItems) {
    errors[field] = `Must include ${maxItems} items or fewer`;
    return cleaned.slice(0, maxItems);
  }
  const tooLong = cleaned.find((entry) => entry.length > maxItemLength);
  if (tooLong) {
    errors[field] = `Entries must be ${maxItemLength} characters or fewer`;
  }
  return cleaned;
};

export const normalizeSubmission = (raw: unknown): NormalizationResult => {
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: { body: "Invalid JSON" } };
  }

  const obj = raw as Record<string, unknown>;
  const errors: SubmissionErrors = {};
  const kind = resolveSubmissionKind(obj);
  if (!kind) {
    errors.verificationRequest = "Must be owner, community, or report";
  }

  const contactEmail = ensureString(obj.contactEmail);
  const contactName = ensureString(obj.contactName);
  const submitterName = ensureString(obj.submitterName);
  const submittedBy = kind ? buildSubmittedBy(obj, kind) : {};
  const placeId = ensureString(obj.placeId);
  const placeName = ensureString(obj.placeName);

  const name = ensureString(obj.name) ?? placeName ?? (kind === "report" ? "Report" : undefined);
  const country = ensureString(obj.country);
  const city = ensureString(obj.city);
  const address = ensureString(obj.address);
  const category = ensureString(obj.category);
  const role = ensureString(obj.role);
  const about = ensureString(obj.about);
  const paymentNote = ensureString(obj.paymentNote);
  const ownerVerification = ensureString(obj.ownerVerification);
  const reportAction = ensureString(obj.reportAction);
  const amenitiesNotes = ensureString(obj.amenitiesNotes);
  const website = ensureString(obj.website);
  const twitter = ensureString(obj.twitter);
  const instagram = ensureString(obj.instagram);
  const facebook = ensureString(obj.facebook);
  const notesForAdmin = ensureString(obj.notesForAdmin);
  const rawLat = obj.lat;
  const rawLng = obj.lng;
  const parsedLat = ensureNumber(rawLat);
  const parsedLng = ensureNumber(rawLng);

  if (kind !== "report") {
    if (!name) errors.name = "Required";
    if (!country) errors.country = "Required";
    if (!city) errors.city = "Required";
    if (!address) errors.address = "Required";
    if (!category) errors.category = "Required";
    if (!contactEmail) errors.contactEmail = "Required";
    if (!ownerVerification) errors.ownerVerification = "Required";
    if (ownerVerification && !["domain", "otp", "dashboard_ss"].includes(ownerVerification)) {
      errors.ownerVerification = "Invalid owner verification";
    }
  }

  let acceptedChains: string[] | undefined;
  if (kind !== "report") {
    acceptedChains = normalizeStringArray(
      obj.acceptedChains,
      MAX_LENGTHS.chain,
      MAX_ACCEPTED_CHAINS,
      "acceptedChains",
      errors,
    );
    if (!acceptedChains?.length) {
      errors.acceptedChains = "Select at least one";
    }
  }

  const communityEvidenceUrls = normalizeStringArray(
    obj.communityEvidenceUrls,
    MAX_LENGTHS.communityEvidenceUrl,
    MAX_COMMUNITY_EVIDENCE_URLS,
    "communityEvidenceUrls",
    errors,
  );
  if (kind === "community" && (!communityEvidenceUrls || communityEvidenceUrls.length === 0)) {
    errors.communityEvidenceUrls = "Provide at least one URL";
  }

  if (contactEmail && (!emailRegex.test(contactEmail) || contactEmail.length > MAX_LENGTHS.contactEmail)) {
    errors.contactEmail = "Invalid email";
  }

  validateLength(errors, "name", name, MAX_LENGTHS.name);
  validateLength(errors, "country", country, MAX_LENGTHS.country);
  validateLength(errors, "city", city, MAX_LENGTHS.city);
  validateLength(errors, "address", address, MAX_LENGTHS.address);
  validateLength(errors, "category", category, MAX_LENGTHS.category);
  validateLength(errors, "contactName", contactName, MAX_LENGTHS.contactName);
  validateLength(errors, "submitterName", submitterName, MAX_LENGTHS.contactName);
  validateLength(errors, "role", role, MAX_LENGTHS.role);
  validateLength(errors, "about", about, MAX_LENGTHS.about);
  validateLength(errors, "paymentNote", paymentNote, MAX_LENGTHS.paymentNote);
  validateLength(errors, "ownerVerification", ownerVerification, MAX_LENGTHS.ownerVerification);
  validateLength(errors, "reportAction", reportAction, MAX_LENGTHS.reportAction);
  validateLength(errors, "website", website, MAX_LENGTHS.website);
  validateLength(errors, "twitter", twitter, MAX_LENGTHS.twitter);
  validateLength(errors, "instagram", instagram, MAX_LENGTHS.instagram);
  validateLength(errors, "facebook", facebook, MAX_LENGTHS.facebook);
  validateLength(errors, "notesForAdmin", notesForAdmin, MAX_LENGTHS.notesForAdmin);
  validateLength(errors, "placeName", placeName, MAX_LENGTHS.placeName);
  validateLength(errors, "amenitiesNotes", amenitiesNotes, MAX_LENGTHS.amenitiesNotes);

  const reportReason = ensureString(obj.reportReason) ?? ensureString(obj.reason) ?? ensureString(obj.notes);
  const reportDetails = ensureString(obj.reportDetails) ?? ensureString(obj.details);

  if (kind === "report") {
    if (!reportReason) {
      errors.notesForAdmin = "Report reason is required";
    }
    if (!reportAction) {
      errors.reportAction = "Report action is required";
    } else if (!["hide", "edit"].includes(reportAction)) {
      errors.reportAction = "Invalid report action";
    }

    if (reportReason && reportReason.length > MAX_LENGTHS.reportReason) {
      errors.notesForAdmin = `Must be ${MAX_LENGTHS.reportReason} characters or fewer`;
    }
    if (reportDetails && reportDetails.length > MAX_LENGTHS.reportDetails) {
      errors.notesForAdmin = `Details must be ${MAX_LENGTHS.reportDetails} characters or fewer`;
    }
  }

  let payload: SubmissionPayload;
  if (kind === "report") {
    payload = {
      kind,
      verificationRequest: kind,
      name: name ?? "Report",
      country: country ?? "",
      city: city ?? "",
      address: address ?? "",
      category: category ?? "",
      acceptedChains: [],
      contactEmail,
      contactName,
      submitterName,
      submittedBy,
      placeId,
      placeName,
      notes: reportReason,
      reportReason: reportReason ?? "",
      reportDetails,
      reportAction: reportAction ?? "",
      communityEvidenceUrls,
    };
  } else {
    payload = {
      kind: kind ?? "community",
      verificationRequest: (kind ?? "community") as SubmissionKind,
      name: name ?? "",
      country: country ?? "",
      city: city ?? "",
      address: address ?? "",
      category: category ?? "",
      acceptedChains: acceptedChains as string[],
      contactEmail,
      contactName,
      submitterName,
      submittedBy,
      placeId,
      placeName,
      notes: notesForAdmin,
      role,
      about,
      paymentNote,
      ownerVerification: ownerVerification ?? "",
      communityEvidenceUrls,
      website,
      twitter,
      instagram,
      facebook,
      lat: parsedLat,
      lng: parsedLng,
      amenities: normalizeStringArray(
        obj.amenities,
        MAX_LENGTHS.amenity,
        MAX_AMENITIES,
        "amenities",
        errors,
      ),
      amenitiesNotes,
      notesForAdmin,
      termsAccepted: typeof obj.termsAccepted === "boolean" ? obj.termsAccepted : undefined,
    } as OwnerCommunitySubmissionPayload;
  }

  if (rawLat !== null && rawLat !== undefined && rawLat !== "" && parsedLat === undefined) {
    errors.lat = "Invalid latitude";
  }
  if (rawLng !== null && rawLng !== undefined && rawLng !== "" && parsedLng === undefined) {
    errors.lng = "Invalid longitude";
  }

  if (kind !== "report") {
    if ((parsedLat !== undefined && parsedLng === undefined) || (parsedLat === undefined && parsedLng !== undefined)) {
      errors.lat = "Lat/Lng must be provided together";
      errors.lng = "Lat/Lng must be provided together";
    }

    if (parsedLat !== undefined && (parsedLat < -90 || parsedLat > 90)) {
      errors.lat = "Latitude out of range";
    }
    if (parsedLng !== undefined && (parsedLng < -180 || parsedLng > 180)) {
      errors.lng = "Longitude out of range";
    }

    const ownerPayload = payload as OwnerCommunitySubmissionPayload;
    if (ownerPayload.termsAccepted === false) {
      errors.termsAccepted = "Terms must be accepted";
    }
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  return { ok: true, payload };
};

const ensureSubmissionCompatColumns = async (route: string) => {
  await dbQuery(
    `ALTER TABLE IF EXISTS public.submissions
      ADD COLUMN IF NOT EXISTS place_id TEXT,
      ADD COLUMN IF NOT EXISTS submitted_by JSONB,
      ADD COLUMN IF NOT EXISTS reviewed_by JSONB,
      ADD COLUMN IF NOT EXISTS review_note TEXT,
      ADD COLUMN IF NOT EXISTS level TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
    [],
    { route },
  );
};

const isReportPayload = (payload: SubmissionPayload): payload is ReportSubmissionPayload =>
  payload.verificationRequest === "report";

const insertSubmissionToDb = async (record: StoredSubmission) => {
  if (!hasDatabaseUrl()) {
    throw new DbUnavailableError("DB_UNAVAILABLE");
  }
  const route = "api_submissions_create";

  const { rows } = await dbQuery<{ present: string | null }>(
    "SELECT to_regclass('public.submissions') AS present",
    [],
    { route },
  );
  if (!rows[0]?.present) {
    throw new Error("SUBMISSIONS_TABLE_MISSING");
  }

  await ensureSubmissionCompatColumns(route);

  const payload = record.payload;
  const reportPayload = isReportPayload(payload) ? payload : null;
  const ownerPayload = reportPayload ? null : (payload as OwnerCommunitySubmissionPayload);
  const normalizedName = payload.placeName ?? payload.name;
  const normalizedContactEmail = payload.contactEmail ?? "";
  const normalizedAcceptedChains = reportPayload ? [] : payload.acceptedChains;

  await dbQuery(
    `INSERT INTO submissions (
      id,
      created_at,
      status,
      kind,
      level,
      place_id,
      submitted_by,
      updated_at,
      suggested_place_id,
      name,
      country,
      city,
      address,
      category,
      accepted_chains,
      contact_email,
      contact_name,
      role,
      about,
      payment_note,
      website,
      twitter,
      instagram,
      facebook,
      lat,
      lng,
      amenities,
      notes_for_admin,
      terms_accepted,
      payload
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
    )`,
    [
      record.submissionId,
      record.createdAt,
      record.status,
      record.kind,
      record.level,
      record.placeId ?? null,
      record.submittedBy,
      record.suggestedPlaceId,
      normalizedName,
      payload.country,
      payload.city,
      payload.address,
      payload.category,
      normalizedAcceptedChains,
      normalizedContactEmail,
      payload.contactName ?? null,
      ownerPayload?.role ?? null,
      reportPayload ? reportPayload.reportDetails ?? reportPayload.notes ?? null : ownerPayload?.about ?? null,
      ownerPayload?.paymentNote ?? null,
      ownerPayload?.website ?? null,
      ownerPayload?.twitter ?? null,
      ownerPayload?.instagram ?? null,
      ownerPayload?.facebook ?? null,
      ownerPayload?.lat ?? null,
      ownerPayload?.lng ?? null,
      ownerPayload?.amenities ?? null,
      reportPayload ? reportPayload.reportReason : ownerPayload?.notesForAdmin ?? ownerPayload?.notes ?? null,
      ownerPayload?.termsAccepted ?? null,
      JSON.stringify(payload),
    ],
    { route },
  );
};

export const persistSubmission = async (payload: SubmissionPayload): Promise<StoredSubmission> => {
  const submissionId = generateSubmissionId();
  const suggestedPlaceId = generateSuggestedPlaceId(payload);
  const kind = payload.verificationRequest;
  const level = levelForKind(kind);
  const submittedBy = payload.submittedBy ?? buildSubmittedBy(payload, kind);
  const stored: StoredSubmission = {
    submissionId,
    createdAt: new Date().toISOString(),
    status: "pending",
    suggestedPlaceId,
    kind,
    level,
    placeId: payload.placeId ?? null,
    submittedBy,
    payload,
  };

  await insertSubmissionToDb(stored);
  await saveSubmission(stored);

  return stored;
};

export const loadSubmissionById = async (submissionId: string): Promise<StoredSubmission> => {
  const filePath = path.join(submissionsDir, `${submissionId}.json`);
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents) as StoredSubmission;
};

export const updateSubmissionStatus = async (
  submissionId: string,
  status: Exclude<SubmissionStatus, "pending">,
  reviewNote?: string,
): Promise<StoredSubmission> => {
  const filePath = path.join(submissionsDir, `${submissionId}.json`);
  const existing = await loadSubmissionById(submissionId);

  const updated: StoredSubmission = {
    ...existing,
    status,
    reviewedAt: new Date().toISOString(),
  };

  if (reviewNote !== undefined) {
    updated.reviewNote = reviewNote;
  }

  return saveSubmission(updated);
};

type SubmissionErrorCode =
  | "INVALID_PAYLOAD"
  | "INVALID_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "REQUIRED_FILE_MISSING"
  | "UNKNOWN_FORM_FIELD"
  | "MEDIA_PROCESSING_FAILED"
  | "RATE_LIMIT"
  | "DB_UNAVAILABLE"
  | "SUBMISSIONS_TABLE_MISSING"
  | "UPLOAD_FAILED"
  | "INTERNAL";

type SubmissionError = {
  code: SubmissionErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

const errorResponse = (status: number, error: SubmissionError) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const invalidPayloadResponse = (message: string, details?: Record<string, unknown>) =>
  errorResponse(400, { code: "INVALID_PAYLOAD", message, details });

const MEDIA_KINDS: SubmissionMediaKind[] = ["gallery", "proof", "evidence"];

const buildSubmissionMediaUrl = (submissionId: string, kind: SubmissionMediaKind, mediaId: string) => {
  if (kind === "gallery") {
    return `/api/media/submissions/${submissionId}/gallery/${mediaId}`;
  }
  return `/api/internal/media/submissions/${submissionId}/${kind}/${mediaId}`;
};

const hasAnyMedia = (filesByField: MultipartFilesByField) =>
  MEDIA_KINDS.some((kind) => filesByField[kind].length > 0);

const processAndStoreSubmissionMedia = async (submissionId: string, filesByField: MultipartFilesByField) => {
  if (!hasAnyMedia(filesByField)) {
    return false;
  }

  const uploadedKeys: string[] = [];

  try {
    await withSubmissionMediaClient("/api/submissions", async (client) => {
      await client.query("BEGIN");
      try {
        for (const kind of MEDIA_KINDS) {
          for (const file of filesByField[kind]) {
            const mediaId = randomUUID();
            const inputBuffer = Buffer.from(await file.arrayBuffer());
            const processed = await processImage(inputBuffer);
            const { key } = await uploadSubmissionMediaObject({
              submissionId,
              kind,
              mediaId,
              body: processed.buffer,
              contentType: processed.contentType,
            });
            uploadedKeys.push(key);

            const url = buildSubmissionMediaUrl(submissionId, kind, mediaId);
            await insertSubmissionMedia({
              submissionId,
              kind,
              url,
              client,
              route: "/api/submissions",
            });
          }
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    });
  } catch (error) {
    await Promise.allSettled(
      uploadedKeys.map(async (key) => {
        try {
          await deleteSubmissionMediaObject(key);
        } catch {
          // best-effort cleanup only
        }
      }),
    );

    if (error instanceof MediaProcessingError) {
      throw error;
    }

    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      throw error;
    }

    throw new Error("UPLOAD_FAILED");
  }

  return true;
};

export const handleUnifiedSubmission = async (request: Request) => {
  const ip = getClientIp(request);
  const rateLimitKey = `${ip}:/api/submissions`;
  const contentType = request.headers.get("content-type") ?? "";
  const isMultipart = contentType.includes("multipart/form-data");
  let body: Record<string, unknown> | null = null;
  let acceptedMediaSummary: Record<string, number> | null = null;

  // NOTE: This in-memory rate limit is best-effort and may reset in serverless environments.
  if (isRateLimited(rateLimitKey)) {
    console.info(`[submissions] reject ip=${ip} reason=rate_limit`);
    return errorResponse(429, {
      code: "RATE_LIMIT",
      message: "Too many requests",
      details: { route: "/api/submissions" },
    });
  }

  if (isMultipart) {
    const parsedMultipart = await parseMultipartSubmission(request);
    if (!parsedMultipart.ok) {
      console.info(`[submissions] reject ip=${ip} reason=invalid_payload`);
      return invalidPayloadResponse(parsedMultipart.error.message, parsedMultipart.error.details);
    }

    body = parsedMultipart.value.payload;

    if (getHoneypotValue(body)) {
      console.info(`[submissions] reject ip=${ip} reason=honeypot`);
      return invalidPayloadResponse("Honeypot triggered", { field: "website" });
    }

    const normalized = normalizeSubmission(body);
    if (!normalized.ok) {
      console.info(`[submissions] reject ip=${ip} reason=invalid_payload`);
      return invalidPayloadResponse("payload failed validation", { errors: normalized.errors });
    }

    const multipartValidation = validateMultipartSubmission(
      normalized.payload.verificationRequest,
      parsedMultipart.value.filesByField,
      parsedMultipart.value.unexpectedFileFields,
    );
    if (!multipartValidation.ok) {
      console.info(`[submissions] reject ip=${ip} reason=${multipartValidation.error.code}`);
      return errorResponse(400, multipartValidation.error);
    }

    acceptedMediaSummary = multipartValidation.acceptedMediaSummary;

    try {
      const record = await persistSubmission(normalized.payload);
      const mediaSaved = await processAndStoreSubmissionMedia(record.submissionId, parsedMultipart.value.filesByField);
      console.info(`[submissions] accept ip=${ip} kind=${record.kind}`);
      return new Response(
        JSON.stringify({
          submissionId: record.submissionId,
          acceptedMediaSummary,
          ...(mediaSaved ? { mediaSaved: true } : {}),
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      if (error instanceof MediaProcessingError) {
        return errorResponse(400, {
          code: "MEDIA_PROCESSING_FAILED",
          message: "Invalid image data",
        });
      }
      if (error instanceof Error && error.message === "UPLOAD_FAILED") {
        return errorResponse(500, {
          code: "UPLOAD_FAILED",
          message: "Failed to upload submission media",
        });
      }
      if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
        return errorResponse(503, {
          code: "DB_UNAVAILABLE",
          message: "Database unavailable",
        });
      }
      if (error instanceof Error && error.message === "SUBMISSIONS_TABLE_MISSING") {
        return errorResponse(500, {
          code: "SUBMISSIONS_TABLE_MISSING",
          message: "Submissions table missing",
        });
      }
      console.error("[submissions] unexpected", error);
      return errorResponse(500, {
        code: "INTERNAL",
        message: "Failed to process submission",
      });
    }
  }

  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    console.info(`[submissions] reject ip=${ip} reason=invalid_payload`);
    return invalidPayloadResponse("Request body must be valid JSON");
  }

  try {
    if (!body) {
      console.info(`[submissions] reject ip=${ip} reason=invalid_payload`);
      return invalidPayloadResponse("payload must be a JSON object");
    }

    if (getHoneypotValue(body)) {
      console.info(`[submissions] reject ip=${ip} reason=honeypot`);
      return invalidPayloadResponse("Honeypot triggered", { field: "website" });
    }

    const normalized = normalizeSubmission(body);

    if (!normalized.ok) {
      console.info(`[submissions] reject ip=${ip} reason=invalid_payload`);
      return invalidPayloadResponse("payload failed validation", { errors: normalized.errors });
    }

    acceptedMediaSummary = emptyAcceptedMediaSummary(normalized.payload.verificationRequest);

    const record = await persistSubmission(normalized.payload);

    console.info(`[submissions] accept ip=${ip} kind=${record.kind}`);
    return new Response(
      JSON.stringify({
        submissionId: record.submissionId,
        acceptedMediaSummary,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return errorResponse(503, {
        code: "DB_UNAVAILABLE",
        message: "Database unavailable",
      });
    }
    if (error instanceof Error && error.message === "SUBMISSIONS_TABLE_MISSING") {
      return errorResponse(500, {
        code: "SUBMISSIONS_TABLE_MISSING",
        message: "Submissions table missing",
      });
    }
    console.error("[submissions] unexpected", error);
    return errorResponse(500, {
      code: "INTERNAL",
      message: "Failed to process submission",
    });
  }
};

export const handleLegacySubmission = async (request: Request, expectedKind: SubmissionKind) => {
  try {
    const body = await request.json();
    const normalizedBody = {
      name: (body.place?.name ?? body.name) as unknown,
      country: (body.place?.country ?? body.country) as unknown,
      city: (body.place?.city ?? body.city) as unknown,
      address: (body.place?.address ?? body.address) as unknown,
      category: (body.place?.category ?? body.category) as unknown,
      acceptedChains: (body.place?.accepted ?? body.accepted) as unknown,
      verificationRequest: expectedKind,
      contactEmail: (body.submitter?.email ?? body.contactEmail) as unknown,
      contactName: (body.submitter?.name ?? body.contactName) as unknown,
      role: (body.submitter?.role ?? body.role) as unknown,
      about: (body.place?.about ?? body.about) as unknown,
      paymentNote: (body.place?.paymentNote ?? body.paymentNote) as unknown,
      website: (body.place?.website ?? body.website) as unknown,
      twitter: (body.place?.twitter ?? body.twitter) as unknown,
      instagram: (body.place?.instagram ?? body.instagram) as unknown,
      facebook: (body.place?.facebook ?? body.facebook) as unknown,
      lat: (body.place?.lat ?? body.lat) as unknown,
      lng: (body.place?.lng ?? body.lng) as unknown,
      notesForAdmin: (body.submitter?.notesForAdmin ?? body.notesForAdmin) as unknown,
    };

    const normalized = normalizeSubmission(normalizedBody);
    if (!normalized.ok) {
      return new Response(JSON.stringify({ errors: normalized.errors }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = await persistSubmission(normalized.payload);

    return new Response(
      JSON.stringify({
        id: record.submissionId,
        status: record.status,
        suggestedPlaceId: record.suggestedPlaceId,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof DbUnavailableError || (error as Error).message?.includes("DATABASE_URL")) {
      return new Response(JSON.stringify({ error: "DB_UNAVAILABLE" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (error instanceof Error && error.message === "SUBMISSIONS_TABLE_MISSING") {
      return new Response(JSON.stringify({ error: "Submissions table missing" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("[submissions] legacy", error);
    return new Response(JSON.stringify({ ok: false, error: "Invalid submission" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
