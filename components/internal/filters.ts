export type SubmissionFilters = {
  status: string;
  kind?: string;
  q?: string;
  page: number;
  limit: number;
};

const parseNumber = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseSubmissionFilters = (params: URLSearchParams): SubmissionFilters => {
  const status = params.get("status") ?? "pending";
  const kind = params.get("kind") ?? undefined;
  const q = params.get("q") ?? undefined;
  const page = parseNumber(params.get("page"), 1);
  const limit = parseNumber(params.get("limit"), 20);

  return {
    status,
    kind,
    q,
    page,
    limit,
  };
};

export const buildSubmissionQuery = (
  current: SubmissionFilters,
  updates: Partial<SubmissionFilters>,
) => {
  const merged: SubmissionFilters = {
    ...current,
    ...updates,
  };

  const params = new URLSearchParams();
  if (merged.status) params.set("status", merged.status);
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.q) params.set("q", merged.q);
  if (merged.page) params.set("page", merged.page.toString());
  if (merged.limit) params.set("limit", merged.limit.toString());

  return params.toString();
};
