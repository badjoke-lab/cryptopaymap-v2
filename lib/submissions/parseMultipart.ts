const KNOWN_FILE_FIELDS = ["proof", "gallery", "evidence"] as const;

type KnownFileField = (typeof KNOWN_FILE_FIELDS)[number];

const knownFieldSet = new Set<string>(KNOWN_FILE_FIELDS);

type MultipartParseError = {
  code: "INVALID_PAYLOAD";
  message: string;
  details?: Record<string, unknown>;
};

export type MultipartFilesByField = Record<KnownFileField, File[]>;

export type ParsedMultipartSubmission = {
  payload: Record<string, unknown>;
  filesByField: MultipartFilesByField;
  unexpectedFileFields: string[];
};

export type MultipartParseResult =
  | { ok: true; value: ParsedMultipartSubmission }
  | { ok: false; error: MultipartParseError };

const emptyFilesByField = (): MultipartFilesByField => ({
  proof: [],
  gallery: [],
  evidence: [],
});

const toFiles = (entries: FormDataEntryValue[]): File[] => entries.filter((entry): entry is File => entry instanceof File);

export const parseMultipartSubmission = async (request: Request): Promise<MultipartParseResult> => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "Failed to parse multipart form data",
      },
    };
  }

  const payloadField = form.get("payload");
  if (typeof payloadField !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "payload must be a JSON string",
        details: { field: "payload" },
      },
    };
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(payloadField);
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "payload must be valid JSON",
        details: { field: "payload" },
      },
    };
  }

  if (!parsedPayload || typeof parsedPayload !== "object") {
    return {
      ok: false,
      error: {
        code: "INVALID_PAYLOAD",
        message: "payload must be a JSON object",
        details: { field: "payload" },
      },
    };
  }

  const filesByField = emptyFilesByField();
  for (const field of KNOWN_FILE_FIELDS) {
    filesByField[field] = toFiles(form.getAll(field));
  }

  const unexpectedFileFields = new Set<string>();
  for (const [field, value] of form.entries()) {
    if (value instanceof File && !knownFieldSet.has(field)) {
      unexpectedFileFields.add(field);
    }
  }

  return {
    ok: true,
    value: {
      payload: parsedPayload as Record<string, unknown>,
      filesByField,
      unexpectedFileFields: [...unexpectedFileFields],
    },
  };
};
