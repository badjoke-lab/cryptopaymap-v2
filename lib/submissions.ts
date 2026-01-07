import { promises as fs } from "fs";
import path from "path";

import { DbUnavailableError, dbQuery, hasDatabaseUrl } from "@/lib/db";

export type SubmissionKind = "owner" | "community";

export type SubmissionPayload = {
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  acceptedChains: string[];
  verificationRequest: SubmissionKind;
  contactEmail?: string;
  contactName?: string;
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
  notesForAdmin?: string;
  termsAccepted?: boolean;
};

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
  notesForAdmin: 300,
  chain: 40,
  amenity: 40,
};

const MAX_ACCEPTED_CHAINS = 12;
const MAX_AMENITIES = 20;

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
  const country = payload.country.toLowerCase();
  const citySlug = slugify(payload.city || "city");
  const nameSlug = slugify(payload.name || "place");
  const categorySlug = slugify(payload.category || "category");
  const suffix = generateRandomSuffix();
  return `cpm:${country}-${citySlug}-${payload.verificationRequest}-${categorySlug}-${nameSlug}-${suffix}`;
};

const validateLength = (
  errors: SubmissionErrors,
  field: keyof SubmissionPayload,
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
  field: keyof SubmissionPayload,
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
  const name = ensureString(obj.name);
  const country = ensureString(obj.country);
  const city = ensureString(obj.city);
  const address = ensureString(obj.address);
  const category = ensureString(obj.category);
  const contactEmail = ensureString(obj.contactEmail);
  const contactName = ensureString(obj.contactName);
  const role = ensureString(obj.role);
  const about = ensureString(obj.about);
  const paymentNote = ensureString(obj.paymentNote);
  const website = ensureString(obj.website);
  const twitter = ensureString(obj.twitter);
  const instagram = ensureString(obj.instagram);
  const facebook = ensureString(obj.facebook);
  const notesForAdmin = ensureString(obj.notesForAdmin);
  const rawLat = obj.lat;
  const rawLng = obj.lng;
  const parsedLat = ensureNumber(rawLat);
  const parsedLng = ensureNumber(rawLng);

  if (!name) errors.name = "Required";
  if (!country) errors.country = "Required";
  if (!city) errors.city = "Required";
  if (!address) errors.address = "Required";
  if (!category) errors.category = "Required";
  if (!contactEmail) errors.contactEmail = "Required";

  const verificationRequest =
    obj.verificationRequest === "owner" || obj.verificationRequest === "community"
      ? obj.verificationRequest
      : undefined;

  if (!verificationRequest) {
    errors.verificationRequest = "Must be owner or community";
  }

  const acceptedChains = normalizeStringArray(
    obj.acceptedChains,
    MAX_LENGTHS.chain,
    MAX_ACCEPTED_CHAINS,
    "acceptedChains",
    errors,
  );
  if (!acceptedChains?.length) {
    errors.acceptedChains = "Select at least one";
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
  validateLength(errors, "role", role, MAX_LENGTHS.role);
  validateLength(errors, "about", about, MAX_LENGTHS.about);
  validateLength(errors, "paymentNote", paymentNote, MAX_LENGTHS.paymentNote);
  validateLength(errors, "website", website, MAX_LENGTHS.website);
  validateLength(errors, "twitter", twitter, MAX_LENGTHS.twitter);
  validateLength(errors, "instagram", instagram, MAX_LENGTHS.instagram);
  validateLength(errors, "facebook", facebook, MAX_LENGTHS.facebook);
  validateLength(errors, "notesForAdmin", notesForAdmin, MAX_LENGTHS.notesForAdmin);

  const payload: SubmissionPayload = {
    name: name ?? "",
    country: country ?? "",
    city: city ?? "",
    address: address ?? "",
    category: category ?? "",
    verificationRequest: verificationRequest as SubmissionKind,
    acceptedChains: acceptedChains as string[],
    contactEmail,
    contactName,
    role,
    about,
    paymentNote,
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
    notesForAdmin,
    termsAccepted: typeof obj.termsAccepted === "boolean" ? obj.termsAccepted : undefined,
  };

  if (rawLat !== null && rawLat !== undefined && rawLat !== "" && parsedLat === undefined) {
    errors.lat = "Invalid latitude";
  }
  if (rawLng !== null && rawLng !== undefined && rawLng !== "" && parsedLng === undefined) {
    errors.lng = "Invalid longitude";
  }

  if ((payload.lat !== undefined && payload.lng === undefined) || (payload.lat === undefined && payload.lng !== undefined)) {
    errors.lat = "Lat/Lng must be provided together";
    errors.lng = "Lat/Lng must be provided together";
  }

  if (payload.lat !== undefined && (payload.lat < -90 || payload.lat > 90)) {
    errors.lat = "Latitude out of range";
  }
  if (payload.lng !== undefined && (payload.lng < -180 || payload.lng > 180)) {
    errors.lng = "Longitude out of range";
  }

  if (payload.termsAccepted === false) {
    errors.termsAccepted = "Terms must be accepted";
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  return { ok: true, payload };
};

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

  const payload = record.payload;

  await dbQuery(
    `INSERT INTO submissions (
      id,
      status,
      kind,
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
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25
    )`,
    [
      record.submissionId,
      record.status,
      record.payload.verificationRequest,
      record.suggestedPlaceId,
      payload.name,
      payload.country,
      payload.city,
      payload.address,
      payload.category,
      payload.acceptedChains,
      payload.contactEmail,
      payload.contactName ?? null,
      payload.role ?? null,
      payload.about ?? null,
      payload.paymentNote ?? null,
      payload.website ?? null,
      payload.twitter ?? null,
      payload.instagram ?? null,
      payload.facebook ?? null,
      payload.lat ?? null,
      payload.lng ?? null,
      payload.amenities ?? null,
      payload.notesForAdmin ?? null,
      payload.termsAccepted ?? null,
      JSON.stringify(payload),
    ],
    { route },
  );
};

export const persistSubmission = async (payload: SubmissionPayload): Promise<StoredSubmission> => {
  const submissionId = generateSubmissionId();
  const suggestedPlaceId = generateSuggestedPlaceId(payload);
  const stored: StoredSubmission = {
    submissionId,
    createdAt: new Date().toISOString(),
    status: "pending",
    suggestedPlaceId,
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

export const handleUnifiedSubmission = async (request: Request) => {
  const ip = getClientIp(request);
  const rateLimitKey = `${ip}:/api/submissions`;
  let body: unknown;

  // NOTE: This in-memory rate limit is best-effort and may reset in serverless environments.
  if (isRateLimited(rateLimitKey)) {
    console.info(`[submissions] reject ip=${ip} reason=rate_limit`);
    return new Response(JSON.stringify({ ok: false, error: "rate_limited" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    body = await request.json();
  } catch {
    console.info(`[submissions] reject ip=${ip} reason=invalid`);
    return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (!body || typeof body !== "object") {
      console.info(`[submissions] reject ip=${ip} reason=invalid`);
      return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (getHoneypotValue(body as Record<string, unknown>)) {
      console.info(`[submissions] reject ip=${ip} reason=honeypot`);
      return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const normalized = normalizeSubmission(body);

    if (!normalized.ok) {
      console.info(`[submissions] reject ip=${ip} reason=invalid`);
      return new Response(JSON.stringify({ ok: false, error: "invalid_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = await persistSubmission(normalized.payload);

    console.info(
      `[submissions] accept ip=${ip} kind=${record.payload.verificationRequest}`,
    );
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
    console.error("[submissions] unexpected", error);
    return new Response(JSON.stringify({ ok: false, error: "Failed to process submission" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
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
