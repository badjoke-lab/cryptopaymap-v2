import { NextResponse } from "next/server";

export type SubmissionKind = "owner" | "community";

export type SubmissionPlaceInput = {
  name?: string;
  country?: string;
  city?: string;
  address?: string;
  category?: string;
  lat?: unknown;
  lng?: unknown;
  accepted?: unknown;
  about?: string;
  paymentNote?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
};

export type SubmitterInput = {
  name?: string;
  email?: string;
  role?: string;
  notesForAdmin?: string;
};

export type SubmissionPayload = {
  kind?: SubmissionKind;
  place?: SubmissionPlaceInput;
  submitter?: SubmitterInput;
};

export type NormalizedPlace = {
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  accepted: string[];
  verification: SubmissionKind;
  updatedAt: string;
  lat?: number;
  lng?: number;
  about?: string;
  paymentNote?: string;
  website?: string;
  twitter?: string;
  instagram?: string;
  facebook?: string;
  submitterName?: string;
  submitterEmail?: string;
};

const ensureString = (value: unknown): string | undefined => {
  if (typeof value === "string") return value.trim();
  return undefined;
};

const ensureStringArray = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  return undefined;
};

const ensureNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export const validateAndNormalizeSubmission = (
  payload: SubmissionPayload,
  expectedKind: SubmissionKind,
): { normalizedPlace: NormalizedPlace } | { error: string } => {
  if (!payload || payload.kind !== expectedKind) {
    return { error: "Invalid submission" };
  }

  const { place = {}, submitter = {} } = payload;

  const name = ensureString(place.name);
  const country = ensureString(place.country);
  const city = ensureString(place.city);
  const address = ensureString(place.address);
  const category = ensureString(place.category);
  const accepted = ensureStringArray(place.accepted);
  const submitterName = ensureString(submitter.name);
  const submitterEmail = ensureString(submitter.email);

  if (!name || !country || !city || !address || !category || !accepted?.length || !submitterName || !submitterEmail) {
    return { error: "Invalid submission" };
  }

  const normalizedPlace: NormalizedPlace = {
    name,
    country,
    city,
    address,
    category,
    accepted,
    verification: expectedKind,
    updatedAt: new Date().toISOString(),
    about: ensureString(place.about),
    paymentNote: ensureString(place.paymentNote),
    website: ensureString(place.website),
    twitter: ensureString(place.twitter),
    instagram: ensureString(place.instagram),
    facebook: ensureString(place.facebook),
    lat: ensureNumber(place.lat),
    lng: ensureNumber(place.lng),
    submitterName,
    submitterEmail,
  };

  return { normalizedPlace };
};

export const handleSubmission = async (request: Request, expectedKind: SubmissionKind) => {
  try {
    const payload = (await request.json()) as SubmissionPayload;
    const result = validateAndNormalizeSubmission(payload, expectedKind);

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log(`[submission] ${expectedKind}`, { normalizedPlace: result.normalizedPlace, submitter: payload.submitter });

    return NextResponse.json({ status: "received", normalizedPlace: result.normalizedPlace });
  } catch (error) {
    console.error("[submission] error", error);
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }
};
