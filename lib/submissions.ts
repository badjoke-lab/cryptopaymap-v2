import { promises as fs } from "fs";
import path from "path";

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

const submissionsDir = path.join(process.cwd(), "data", "submissions");

const writeSubmissionToDisk = async (record: StoredSubmission) => {
  await fs.mkdir(submissionsDir, { recursive: true });
  const filePath = path.join(submissionsDir, `${record.submissionId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
};

export const saveSubmission = async (record: StoredSubmission): Promise<StoredSubmission> => {
  await writeSubmissionToDisk(record);
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
  | { ok: false; error: string };

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

export const normalizeSubmission = (raw: unknown): NormalizationResult => {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Invalid JSON" };
  }

  const obj = raw as Record<string, unknown>;
  const requiredFields: Array<[keyof SubmissionPayload, string | undefined]> = [
    ["name", ensureString(obj.name)],
    ["country", ensureString(obj.country)],
    ["city", ensureString(obj.city)],
    ["address", ensureString(obj.address)],
    ["category", ensureString(obj.category)],
  ];

  const missing = requiredFields.filter(([, value]) => !value).map(([key]) => key);

  const verificationRequest = obj.verificationRequest === "owner" || obj.verificationRequest === "community"
    ? obj.verificationRequest
    : undefined;

  const acceptedChains = ensureStringArray(obj.acceptedChains);

  if (!verificationRequest) missing.push("verificationRequest");
  if (!acceptedChains?.length) missing.push("acceptedChains");

  if (missing.length) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };
  }

  const payload: SubmissionPayload = {
    name: requiredFields[0][1]!,
    country: requiredFields[1][1]!,
    city: requiredFields[2][1]!,
    address: requiredFields[3][1]!,
    category: requiredFields[4][1]!,
    verificationRequest: verificationRequest as SubmissionKind,
    acceptedChains: acceptedChains as string[],
    contactEmail: ensureString(obj.contactEmail),
    contactName: ensureString(obj.contactName),
    role: ensureString(obj.role),
    about: ensureString(obj.about),
    paymentNote: ensureString(obj.paymentNote),
    website: ensureString(obj.website),
    twitter: ensureString(obj.twitter),
    instagram: ensureString(obj.instagram),
    facebook: ensureString(obj.facebook),
    lat: ensureNumber(obj.lat),
    lng: ensureNumber(obj.lng),
    amenities: ensureStringArray(obj.amenities),
    notesForAdmin: ensureString(obj.notesForAdmin),
    termsAccepted: typeof obj.termsAccepted === "boolean" ? obj.termsAccepted : undefined,
  };

  if (payload.termsAccepted === false) {
    return { ok: false, error: "Terms must be accepted" };
  }

  return { ok: true, payload };
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const normalized = normalizeSubmission(body);

    if (!normalized.ok) {
      return new Response(JSON.stringify({ ok: false, error: normalized.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = await persistSubmission(normalized.payload);

    return new Response(
      JSON.stringify({ ok: true, submissionId: record.submissionId, suggestedPlaceId: record.suggestedPlaceId }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
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
      return new Response(JSON.stringify({ ok: false, error: normalized.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const record = await persistSubmission(normalized.payload);

    return new Response(
      JSON.stringify({ ok: true, submissionId: record.submissionId, suggestedPlaceId: record.suggestedPlaceId }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[submissions] legacy", error);
    return new Response(JSON.stringify({ ok: false, error: "Invalid submission" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
