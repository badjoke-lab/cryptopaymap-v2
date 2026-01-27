export type ApiError = {
  code?: string;
  message?: string;
};

export type SubmissionMedia = {
  kind: string;
  mediaId: string;
  url?: string | null;
};

export type SubmissionListItem = {
  id: string;
  status: string;
  kind: string;
  createdAt: string;
  updatedAt?: string | null;
  name: string;
  country?: string | null;
  city?: string | null;
  payload?: Record<string, unknown>;
  placeId?: string | null;
  submittedBy?: Record<string, unknown> | null;
  reviewedBy?: Record<string, unknown> | null;
  reviewNote?: string | null;
  publishedPlaceId?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  acceptedMediaSummary?: Record<string, number> | null;
  mediaSaved?: boolean;
};

export type SubmissionDetail = SubmissionListItem & {
  media?: SubmissionMedia[];
};

export type SubmissionListResponse = {
  items: SubmissionListItem[];
  pageInfo: {
    page: number;
    limit: number;
    total?: number | null;
    hasMore?: boolean;
  };
};

export type SubmissionHistoryEntry = {
  id: string;
  actor: string;
  action: string;
  submissionId: string;
  placeId: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
};

export type SubmissionHistoryResponse = {
  entries: SubmissionHistoryEntry[];
};

export type SubmissionActionResponse = {
  status?: string;
  placeId?: string;
  promoted?: boolean;
};

type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status?: number; error: ApiError };

const parseErrorPayload = (payload: unknown): ApiError => {
  if (!payload || typeof payload !== "object") {
    return { message: "Request failed" };
  }

  const record = payload as { error?: unknown; message?: unknown; code?: unknown };
  if (record.error && typeof record.error === "object") {
    const nested = record.error as { code?: unknown; message?: unknown };
    return {
      code: typeof nested.code === "string" ? nested.code : undefined,
      message: typeof nested.message === "string" ? nested.message : "Request failed",
    };
  }

  if (typeof record.error === "string") {
    return { message: record.error };
  }

  return {
    code: typeof record.code === "string" ? record.code : undefined,
    message: typeof record.message === "string" ? record.message : "Request failed",
  };
};

const parseJsonSafely = async (response: Response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const buildAuthError = () => ({
  code: "UNAUTHORIZED",
  message: "Authentication required to access internal submissions.",
});

const fetchJson = async <T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<T>> => {
  const response = await fetch(input, { credentials: "same-origin", ...init });
  const payload = await parseJsonSafely(response);

  if (response.ok) {
    return { ok: true, status: response.status, data: payload as T };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: response.status, error: buildAuthError() };
  }

  return { ok: false, status: response.status, error: parseErrorPayload(payload) };
};

export const buildSubmissionMediaUrl = (submissionId: string, kind: string, mediaId: string) => {
  if (kind === "gallery") {
    return `/api/media/submissions/${submissionId}/gallery/${mediaId}`;
  }
  return `/api/internal/media/submissions/${submissionId}/${kind}/${mediaId}`;
};

export const fetchSubmissionList = async (params: {
  status?: string;
  kind?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<ApiResult<SubmissionListResponse>> => {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.kind) search.set("kind", params.kind);
  if (params.q) search.set("q", params.q);
  if (params.page) search.set("page", params.page.toString());
  if (params.limit) search.set("limit", params.limit.toString());

  return fetchJson<SubmissionListResponse>(`/api/internal/submissions?${search.toString()}`);
};

export const fetchSubmissionDetail = async (submissionId: string) =>
  fetchJson<{ submission: SubmissionDetail }>(`/api/internal/submissions/${submissionId}`);

export const fetchSubmissionHistory = async (submissionId: string) =>
  fetchJson<SubmissionHistoryResponse>(`/api/internal/submissions/${submissionId}/history`);

export const approveSubmission = async (submissionId: string, reviewNote?: string) =>
  fetchJson<SubmissionActionResponse>(`/api/internal/submissions/${submissionId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reviewNote ? { review_note: reviewNote } : {}),
  });

export const rejectSubmission = async (
  submissionId: string,
  reason: string,
  reviewNote?: string,
) =>
  fetchJson<SubmissionActionResponse>(`/api/internal/submissions/${submissionId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reject_reason: reason, ...(reviewNote ? { review_note: reviewNote } : {}) }),
  });

export const promoteSubmission = async (submissionId: string) =>
  fetchJson<SubmissionActionResponse>(`/api/internal/submissions/${submissionId}/promote`, {
    method: "POST",
  });
