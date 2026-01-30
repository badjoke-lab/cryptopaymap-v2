import type { SubmissionKind } from "@/lib/submissions";

import { ALLOWED_MIME_TYPES, FILE_LIMITS, MAX_FILE_SIZE_BYTES, MAX_LENGTHS } from "./constants";
import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft, SubmissionDraftFiles, StoredFile } from "./types";

const emailRegex = /[^@]+@[^.]+\..+/;
const urlRegex = /^https?:\/\//i;

const isEmpty = (value: string) => !value.trim();
const normalizeList = (value?: string[]) => (value ?? []).map((entry) => entry.trim()).filter(Boolean);

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

const isValidUrl = (value: string) => {
  if (!urlRegex.test(value)) return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const validateFile = (file: StoredFile) => {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return "Unsupported file type";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File exceeds 2MB limit";
  }
  return null;
};

export type ValidationErrors = Record<string, string>;

export const validateDraft = (
  kind: SubmissionKind,
  draft: SubmissionDraft,
  files: SubmissionDraftFiles,
): ValidationErrors => {
  const errors: ValidationErrors = {};

  if (kind === "owner" || kind === "community") {
    const payload = draft as OwnerCommunityDraft;
    if (isEmpty(payload.name)) errors.name = "Required";
    if (payload.name.length > MAX_LENGTHS.businessName) {
      errors.name = `Must be ${MAX_LENGTHS.businessName} characters or fewer`;
    }
    if (isEmpty(payload.country)) errors.country = "Required";
    if (payload.country.length > MAX_LENGTHS.country) {
      errors.country = `Must be ${MAX_LENGTHS.country} characters or fewer`;
    }
    if (isEmpty(payload.city)) errors.city = "Required";
    if (payload.city.length > MAX_LENGTHS.city) {
      errors.city = `Must be ${MAX_LENGTHS.city} characters or fewer`;
    }
    if (isEmpty(payload.address)) errors.address = "Required";
    if (payload.address.length > MAX_LENGTHS.address) {
      errors.address = `Must be ${MAX_LENGTHS.address} characters or fewer`;
    }
    if (isEmpty(payload.category)) errors.category = "Required";
    if (payload.category.length > MAX_LENGTHS.category) {
      errors.category = `Must be ${MAX_LENGTHS.category} characters or fewer`;
    }
    if (!payload.acceptedChains.length) errors.acceptedChains = "Select at least one";
    if (payload.acceptedChains.length > MAX_LENGTHS.acceptedChainsMax) {
      errors.acceptedChains = `Must include ${MAX_LENGTHS.acceptedChainsMax} items or fewer`;
    }
    if (payload.acceptedChains.some((chain) => chain.length > MAX_LENGTHS.chain)) {
      errors.acceptedChains = `Entries must be ${MAX_LENGTHS.chain} characters or fewer`;
    }
    if (payload.about) {
      if (payload.about.length > MAX_LENGTHS.about) {
        errors.about = `Must be ${MAX_LENGTHS.about} characters or fewer`;
      }
    }
    if (payload.paymentNote && payload.paymentNote.length > MAX_LENGTHS.paymentNote) {
      errors.paymentNote = `Must be ${MAX_LENGTHS.paymentNote} characters or fewer`;
    }
    const hasPaymentUrl = !isEmpty(payload.paymentUrl);
    const hasPaymentProof = files.proof.length > 0;
    if (payload.paymentUrl && payload.paymentUrl.length > MAX_LENGTHS.paymentUrl) {
      errors.paymentUrl = `Must be ${MAX_LENGTHS.paymentUrl} characters or fewer`;
    }
    if (hasPaymentUrl && !isValidUrl(payload.paymentUrl.trim())) {
      errors.paymentUrl = "Enter a valid URL";
    }
    if (kind === "owner" && !hasPaymentUrl && !hasPaymentProof) {
      errors.paymentRequirement = "Provide a payment URL or screenshot";
    }
    if (kind === "owner") {
      if (isEmpty(payload.desiredStatus)) {
        errors.desiredStatus = "Required";
      }
    }
    if (payload.desiredStatus && payload.desiredStatus.length > MAX_LENGTHS.desiredStatus) {
      errors.desiredStatus = `Must be ${MAX_LENGTHS.desiredStatus} characters or fewer`;
    }
    if (isEmpty(payload.ownerVerification)) {
      errors.ownerVerification = "Required";
    } else if (!["domain", "otp", "dashboard_ss"].includes(payload.ownerVerification)) {
      errors.ownerVerification = "Select a valid option";
    }
    if (payload.ownerVerification === "domain") {
      if (isEmpty(payload.ownerVerificationDomain)) {
        errors.ownerVerificationDomain = "Required";
      } else if (payload.ownerVerificationDomain.length > MAX_LENGTHS.ownerVerificationDomain) {
        errors.ownerVerificationDomain = `Must be ${MAX_LENGTHS.ownerVerificationDomain} characters or fewer`;
      }
    }
    if (payload.ownerVerification === "otp") {
      if (isEmpty(payload.ownerVerificationWorkEmail)) {
        errors.ownerVerificationWorkEmail = "Required";
      } else if (
        !emailRegex.test(payload.ownerVerificationWorkEmail) ||
        payload.ownerVerificationWorkEmail.length > MAX_LENGTHS.ownerVerificationWorkEmail
      ) {
        errors.ownerVerificationWorkEmail = "Invalid email";
      }
    }
    if (payload.ownerVerification === "dashboard_ss" && !files.proof.length) {
      errors.proof = "Proof image required for dashboard verification";
    }
    if (payload.amenitiesNotes && payload.amenitiesNotes.length > MAX_LENGTHS.amenitiesNotes) {
      errors.amenitiesNotes = `Must be ${MAX_LENGTHS.amenitiesNotes} characters or fewer`;
    }
    const amenities = normalizeList(payload.amenities);
    if (amenities.length > MAX_LENGTHS.amenitiesMax) {
      errors.amenities = `Must include ${MAX_LENGTHS.amenitiesMax} items or fewer`;
    }
    if (amenities.some((entry) => entry.length > MAX_LENGTHS.amenity)) {
      errors.amenities = `Entries must be ${MAX_LENGTHS.amenity} characters or fewer`;
    }
    const evidenceUrls = normalizeList(payload.communityEvidenceUrls);
    if (kind === "community" && evidenceUrls.length < 2) {
      errors.communityEvidenceUrls = "Provide at least two URLs";
    }
    if (evidenceUrls.length > MAX_LENGTHS.communityEvidenceUrlsMax) {
      errors.communityEvidenceUrls = `Must include ${MAX_LENGTHS.communityEvidenceUrlsMax} items or fewer`;
    }
    if (evidenceUrls.some((entry) => entry.length > MAX_LENGTHS.communityEvidenceUrl)) {
      errors.communityEvidenceUrls = `Entries must be ${MAX_LENGTHS.communityEvidenceUrl} characters or fewer`;
    }
    if (isEmpty(payload.submitterName)) {
      errors.submitterName = "Required";
    } else if (payload.submitterName.length > MAX_LENGTHS.submitterNameMax) {
      errors.submitterName = `Must be ${MAX_LENGTHS.submitterNameMax} characters or fewer`;
    }
    if (isEmpty(payload.submitterEmail)) {
      errors.submitterEmail = "Required";
    } else if (
      !emailRegex.test(payload.submitterEmail) ||
      payload.submitterEmail.length > MAX_LENGTHS.contactEmail
    ) {
      errors.submitterEmail = "Invalid email";
    }
    if (payload.role && payload.role.length > MAX_LENGTHS.role) {
      errors.role = `Must be ${MAX_LENGTHS.role} characters or fewer`;
    }
    if (payload.website && payload.website.length > MAX_LENGTHS.website) {
      errors.website = `Must be ${MAX_LENGTHS.website} characters or fewer`;
    }
    if (payload.twitter && payload.twitter.length > MAX_LENGTHS.twitter) {
      errors.twitter = `Must be ${MAX_LENGTHS.twitter} characters or fewer`;
    }
    if (payload.instagram && payload.instagram.length > MAX_LENGTHS.instagram) {
      errors.instagram = `Must be ${MAX_LENGTHS.instagram} characters or fewer`;
    }
    if (payload.facebook && payload.facebook.length > MAX_LENGTHS.facebook) {
      errors.facebook = `Must be ${MAX_LENGTHS.facebook} characters or fewer`;
    }
    if (payload.notesForAdmin && payload.notesForAdmin.length > MAX_LENGTHS.notesForAdmin) {
      errors.notesForAdmin = `Must be ${MAX_LENGTHS.notesForAdmin} characters or fewer`;
    }
    if (payload.placeName && payload.placeName.length > MAX_LENGTHS.placeName) {
      errors.placeName = `Must be ${MAX_LENGTHS.placeName} characters or fewer`;
    }
    const parsedLat = parseOptionalNumber(payload.lat);
    const parsedLng = parseOptionalNumber(payload.lng);
    const hasLat = payload.lat.trim().length > 0;
    const hasLng = payload.lng.trim().length > 0;
    if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
      errors.lat = "Latitude and longitude must be provided together";
      errors.lng = "Latitude and longitude must be provided together";
    }
    if (hasLat && Number.isNaN(parsedLat)) {
      errors.lat = "Invalid latitude";
    } else if (parsedLat !== undefined && (parsedLat < -90 || parsedLat > 90)) {
      errors.lat = "Latitude out of range";
    }
    if (hasLng && Number.isNaN(parsedLng)) {
      errors.lng = "Invalid longitude";
    } else if (parsedLng !== undefined && (parsedLng < -180 || parsedLng > 180)) {
      errors.lng = "Longitude out of range";
    }
  }

  if (kind === "report") {
    const payload = draft as ReportDraft;
    if (isEmpty(payload.placeName)) errors.placeName = "Required";
    if (payload.placeName.length > MAX_LENGTHS.reportPlaceName) {
      errors.placeName = `Must be ${MAX_LENGTHS.reportPlaceName} characters or fewer`;
    }
    if (isEmpty(payload.reportReason)) errors.reportReason = "Required";
    if (payload.reportReason.length > MAX_LENGTHS.reportReason) {
      errors.reportReason = `Must be ${MAX_LENGTHS.reportReason} characters or fewer`;
    }
    if (payload.reportDetails && payload.reportDetails.length > MAX_LENGTHS.reportDetails) {
      errors.reportDetails = `Must be ${MAX_LENGTHS.reportDetails} characters or fewer`;
    }
    if (isEmpty(payload.reportAction)) {
      errors.reportAction = "Required";
    } else if (!["hide", "edit"].includes(payload.reportAction)) {
      errors.reportAction = "Select a valid option";
    }
    const evidenceUrls = normalizeList(payload.communityEvidenceUrls);
    if (evidenceUrls.length > MAX_LENGTHS.communityEvidenceUrlsMax) {
      errors.communityEvidenceUrls = `Must include ${MAX_LENGTHS.communityEvidenceUrlsMax} items or fewer`;
    }
    if (evidenceUrls.some((entry) => entry.length > MAX_LENGTHS.communityEvidenceUrl)) {
      errors.communityEvidenceUrls = `Entries must be ${MAX_LENGTHS.communityEvidenceUrl} characters or fewer`;
    }
    if (payload.submitterName && payload.submitterName.length > MAX_LENGTHS.submitterNameMax) {
      errors.submitterName = `Must be ${MAX_LENGTHS.submitterNameMax} characters or fewer`;
    }
    if (
      payload.submitterEmail &&
      (!emailRegex.test(payload.submitterEmail) || payload.submitterEmail.length > MAX_LENGTHS.contactEmail)
    ) {
      errors.submitterEmail = "Invalid email";
    }
  }

  const limits = FILE_LIMITS[kind];
  (Object.keys(limits) as Array<keyof SubmissionDraftFiles>).forEach((field) => {
    const count = files[field].length;
    if (count > limits[field]) {
      errors[field] = `Maximum ${limits[field]} file(s)`;
    }
    for (const file of files[field]) {
      const fileError = validateFile(file);
      if (fileError) {
        errors[`${field}:${file.name}`] = fileError;
      }
    }
  });

  return errors;
};
