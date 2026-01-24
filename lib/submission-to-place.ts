import type { Place } from "@/types/places";

import type { OwnerCommunitySubmissionPayload, StoredSubmission } from "./submissions";

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

  if (payload.verificationRequest === "report") {
    throw new Error("Report submissions cannot be converted to places");
  }

  const ownerPayload = payload as OwnerCommunitySubmissionPayload;
  const { lat: rawLat, lng: rawLng } = ownerPayload;
  if (
    typeof rawLat !== "number" ||
    typeof rawLng !== "number" ||
    !Number.isFinite(rawLat) ||
    !Number.isFinite(rawLng)
  ) {
    throw new Error("Missing or invalid lat/lng");
  }

  const lat = rawLat;
  const lng = rawLng;

  const prefix = buildPlaceIdPrefix(submission);
  const suffix = findNextSuffix(options?.existingIds ?? [], prefix);
  const id = `${prefix}${suffix}`;

  const verification: Place["verification"] =
    ownerPayload.verificationRequest === "owner" ? "owner" : "community";

  return {
    id,
    name: ownerPayload.name,
    category: ownerPayload.category,
    verification,
    lat,
    lng,
    country: ownerPayload.country,
    city: ownerPayload.city,
    address_full: ownerPayload.address,
    address: ownerPayload.address,
    supported_crypto: ownerPayload.acceptedChains,
    accepted: ownerPayload.acceptedChains,
    about: ownerPayload.about ?? null,
    paymentNote: ownerPayload.paymentNote ?? null,
    social_website: ownerPayload.website ?? null,
    social_twitter: ownerPayload.twitter ?? null,
    social_instagram: ownerPayload.instagram ?? null,
    website: ownerPayload.website ?? null,
    twitter: ownerPayload.twitter ?? null,
    instagram: ownerPayload.instagram ?? null,
    facebook: ownerPayload.facebook ?? null,
    amenities: ownerPayload.amenities ?? null,
    submitterName: ownerPayload.contactName ?? null,
  };
};
