import type { Place } from "@/types/places";

import type { StoredSubmission } from "./submissions";

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findNextSuffix = (existingIds: string[], prefix: string) => {
  const matcher = new RegExp(`^${escapeRegExp(prefix)}(\\d{3})$`);
  const currentMax = existingIds.reduce((max, id) => {
    const match = matcher.exec(id);
    if (!match) return max;
    return Math.max(max, Number.parseInt(match[1], 10));
  }, 0);

  return String(currentMax + 1).padStart(3, "0");
};

export const buildPlaceIdPrefix = (submission: StoredSubmission) => {
  const country = slugify(submission.payload.country || "xx");
  const citySlug = slugify(submission.payload.city || "city");
  const placeSlug = slugify(submission.payload.name || "place");

  return `cpm:${country}-${citySlug}-${placeSlug}-`;
};

export const submissionToPlace = (
  submission: StoredSubmission,
  options?: { existingIds?: string[] },
): Place => {
  const { payload } = submission;

  if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lng)) {
    throw new Error("Submission is missing coordinates");
  }

  const prefix = buildPlaceIdPrefix(submission);
  const suffix = findNextSuffix(options?.existingIds ?? [], prefix);
  const id = `${prefix}${suffix}`;

  const verification: Place["verification"] =
    payload.verificationRequest === "owner" ? "owner" : "community";

  return {
    id,
    name: payload.name,
    category: payload.category,
    verification,
    lat: payload.lat,
    lng: payload.lng,
    country: payload.country,
    city: payload.city,
    address_full: payload.address,
    address: payload.address,
    supported_crypto: payload.acceptedChains,
    accepted: payload.acceptedChains,
    about: payload.about ?? null,
    paymentNote: payload.paymentNote ?? null,
    social_website: payload.website ?? null,
    social_twitter: payload.twitter ?? null,
    social_instagram: payload.instagram ?? null,
    website: payload.website ?? null,
    twitter: payload.twitter ?? null,
    instagram: payload.instagram ?? null,
    facebook: payload.facebook ?? null,
    amenities: payload.amenities ?? null,
    submitterName: payload.contactName ?? null,
  };
};

