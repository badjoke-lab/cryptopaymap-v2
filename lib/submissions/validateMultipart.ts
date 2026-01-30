import type { SubmissionKind } from "@/lib/submissions";

import type { MultipartFilesByField } from "./parseMultipart";

type MediaField = "proof" | "gallery" | "evidence";

type MultipartValidationErrorCode =
  | "INVALID_MEDIA_TYPE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_FILES"
  | "REQUIRED_FILE_MISSING"
  | "UNKNOWN_FORM_FIELD";

type MultipartValidationError = {
  code: MultipartValidationErrorCode;
  message: string;
  details: Record<string, unknown>;
};

type MultipartValidationResult =
  | { ok: true; acceptedMediaSummary: Record<string, number> }
  | { ok: false; error: MultipartValidationError };

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

type FileCountRequirement = {
  min: number;
  max: number;
};

const KIND_REQUIREMENTS: Record<SubmissionKind, Record<MediaField, FileCountRequirement>> = {
  owner: {
    proof: { min: 1, max: 4 },
    gallery: { min: 0, max: 8 },
    evidence: { min: 0, max: 0 },
  },
  community: {
    proof: { min: 0, max: 0 },
    gallery: { min: 0, max: 4 },
    evidence: { min: 0, max: 0 },
  },
  report: {
    proof: { min: 0, max: 0 },
    gallery: { min: 0, max: 0 },
    evidence: { min: 0, max: 4 },
  },
};

const KIND_ALLOWED_FIELDS: Record<SubmissionKind, MediaField[]> = {
  owner: ["proof", "gallery"],
  community: ["gallery"],
  report: ["evidence"],
};

const buildAcceptedMediaSummary = (
  kind: SubmissionKind,
  filesByField: MultipartFilesByField,
): Record<string, number> => {
  const allowedFields = KIND_ALLOWED_FIELDS[kind];
  return allowedFields.reduce<Record<string, number>>((summary, field) => {
    summary[field] = filesByField[field].length;
    return summary;
  }, {});
};

const validateCounts = (kind: SubmissionKind, filesByField: MultipartFilesByField): MultipartValidationError | null => {
  const requirements = KIND_REQUIREMENTS[kind];
  const allowedFields = new Set(KIND_ALLOWED_FIELDS[kind]);

  for (const field of Object.keys(filesByField) as MediaField[]) {
    const count = filesByField[field].length;
    const requirement = requirements[field];

    if (!allowedFields.has(field) && count > 0) {
      return {
        code: "UNKNOWN_FORM_FIELD",
        message: `Unexpected file field: ${field}`,
        details: { field, allowedFields: KIND_ALLOWED_FIELDS[kind] },
      };
    }

    if (count < requirement.min) {
      return {
        code: "REQUIRED_FILE_MISSING",
        message: `${field} requires at least ${requirement.min} file(s)`,
        details: { field, count, min: requirement.min },
      };
    }

    if (count > requirement.max) {
      return {
        code: "TOO_MANY_FILES",
        message: `${field} exceeds the allowed file count`,
        details: { field, count, limit: requirement.max },
      };
    }
  }

  return null;
};

const validateFile = (field: MediaField, file: File): MultipartValidationError | null => {
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      code: "INVALID_MEDIA_TYPE",
      message: `${field} has an unsupported media type`,
      details: { field, mimeType: file.type || "unknown", allowedMimeTypes: ALLOWED_MIME_TYPES },
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      code: "FILE_TOO_LARGE",
      message: `${field} exceeds the maximum file size`,
      details: { field, size: file.size, limitBytes: MAX_FILE_SIZE_BYTES },
    };
  }

  return null;
};

const validateFiles = (kind: SubmissionKind, filesByField: MultipartFilesByField): MultipartValidationError | null => {
  const allowedFields = new Set(KIND_ALLOWED_FIELDS[kind]);

  for (const field of Object.keys(filesByField) as MediaField[]) {
    if (!allowedFields.has(field)) continue;
    for (const file of filesByField[field]) {
      const error = validateFile(field, file);
      if (error) return error;
    }
  }

  return null;
};

export const validateMultipartSubmission = (
  kind: SubmissionKind,
  filesByField: MultipartFilesByField,
  unexpectedFileFields: string[],
): MultipartValidationResult => {
  if (unexpectedFileFields.length > 0) {
    return {
      ok: false,
      error: {
        code: "UNKNOWN_FORM_FIELD",
        message: "Unexpected file fields provided",
        details: { fields: unexpectedFileFields, allowedFields: KIND_ALLOWED_FIELDS[kind] },
      },
    };
  }

  const countError = validateCounts(kind, filesByField);
  if (countError) {
    return { ok: false, error: countError };
  }

  const fileError = validateFiles(kind, filesByField);
  if (fileError) {
    return { ok: false, error: fileError };
  }

  return {
    ok: true,
    acceptedMediaSummary: buildAcceptedMediaSummary(kind, filesByField),
  };
};

export const emptyAcceptedMediaSummary = (kind: SubmissionKind): Record<string, number> =>
  KIND_ALLOWED_FIELDS[kind].reduce<Record<string, number>>((summary, field) => {
    summary[field] = 0;
    return summary;
  }, {});
