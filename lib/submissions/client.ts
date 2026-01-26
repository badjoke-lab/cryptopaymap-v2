export type SubmitResponse = {
  submissionId: string;
  acceptedMediaSummary?: Record<string, number> | null;
  mediaSaved?: boolean;
  status?: string;
  accepted?: boolean;
};

export type SubmitError = {
  code?: string;
  message?: string;
  details?: unknown;
};

export type SubmitResult =
  | { ok: true; status: number; data: SubmitResponse }
  | { ok: false; status?: number; error: SubmitError };

const parseJsonSafely = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const submitMultipartSubmission = async (
  payload: Record<string, unknown>,
  files: Record<string, File[]>,
): Promise<SubmitResult> => {
  const formData = new FormData();
  formData.append("payload", JSON.stringify(payload));

  Object.entries(files).forEach(([field, list]) => {
    list.forEach((file) => {
      formData.append(field, file);
    });
  });

  const response = await fetch("/api/submissions", {
    method: "POST",
    body: formData,
  });

  const json = await parseJsonSafely(response);

  if (response.ok) {
    return { ok: true, status: response.status, data: json as SubmitResponse };
  }

  const error = (json as { error?: SubmitError })?.error ?? { message: "Submission failed" };
  return { ok: false, status: response.status, error };
};
