import type { SubmissionKind } from "@/lib/submissions";

import { ALLOWED_MIME_TYPES, FILE_LIMITS, MAX_FILE_SIZE_BYTES, MAX_LENGTHS } from "./constants";
import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft, SubmissionDraftFiles, StoredFile } from "./types";

const emailRegex = /[^@]+@[^.]+\..+/;

const isEmpty = (value: string) => !value.trim();

const parseOptionalNumber = (value: string) => {
  if (!value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
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
    if (payload.name.length > MAX_LENGTHS.businessName) errors.name = `Must be ${MAX_LENGTHS.businessName} characters or fewer`;
    if (isEmpty(payload.country)) errors.country = "Required";
    if (isEmpty(payload.city)) errors.city = "Required";
    if (isEmpty(payload.address)) errors.address = "Required";
    if (payload.address.length > MAX_LENGTHS.address) errors.address = `Must be ${MAX_LENGTHS.address} characters or fewer`;
    if (isEmpty(payload.category)) errors.category = "Required";
    if (!payload.acceptedChains.length) errors.acceptedChains = "Select at least one";
    if (payload.about) {
      const limit = kind === "owner" ? MAX_LENGTHS.aboutOwner : MAX_LENGTHS.aboutCommunity;
      if (payload.about.length > limit) errors.about = `Must be ${limit} characters or fewer`;
    }
    if (payload.paymentNote && payload.paymentNote.length > MAX_LENGTHS.paymentNote) {
      errors.paymentNote = `Must be ${MAX_LENGTHS.paymentNote} characters or fewer`;
    }
    if (isEmpty(payload.submitterName)) {
      errors.submitterName = "Required";
    } else if (
      payload.submitterName.length < MAX_LENGTHS.submitterNameMin ||
      payload.submitterName.length > MAX_LENGTHS.submitterNameMax
    ) {
      errors.submitterName = `Must be between ${MAX_LENGTHS.submitterNameMin} and ${MAX_LENGTHS.submitterNameMax} characters`;
    }
    if (isEmpty(payload.submitterEmail)) {
      errors.submitterEmail = "Required";
    } else if (!emailRegex.test(payload.submitterEmail)) {
      errors.submitterEmail = "Invalid email";
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
    if (isEmpty(payload.submitterName)) {
      errors.submitterName = "Required";
    } else if (
      payload.submitterName.length < MAX_LENGTHS.submitterNameMin ||
      payload.submitterName.length > MAX_LENGTHS.submitterNameMax
    ) {
      errors.submitterName = `Must be between ${MAX_LENGTHS.submitterNameMin} and ${MAX_LENGTHS.submitterNameMax} characters`;
    }
    if (payload.submitterEmail && !emailRegex.test(payload.submitterEmail)) {
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
