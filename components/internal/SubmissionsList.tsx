'use client';

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorBox from "@/components/internal/ErrorBox";
import Pagination from "@/components/internal/Pagination";
import StatusBadge from "@/components/internal/StatusBadge";
import { buildSubmissionQuery, parseSubmissionFilters } from "@/components/internal/filters";
import { fetchSubmissionList, type SubmissionListItem } from "@/lib/internal/submissions";

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const getSubmittedByValue = (submission: SubmissionListItem, key: string) => {
  const source = submission.submittedBy ?? submission.payload?.submittedBy;
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
};

const toText = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export default function SubmissionsList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseSubmissionFilters(new URLSearchParams(searchParams)), [searchParams]);
  const [items, setItems] = useState<SubmissionListItem[]>([]);
  const [pageInfo, setPageInfo] = useState<{ page: number; limit: number; total?: number | null; hasMore?: boolean }>(
    {
      page: filters.page,
      limit: filters.limit,
    },
  );
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<{ code?: string; message?: string } | null>(null);
  const [searchValue, setSearchValue] = useState(filters.q ?? "");

  const load = useCallback(async () => {
    setStatus("loading");
    const result = await fetchSubmissionList(filters);
    if (result.ok) {
      setItems(result.data.items ?? []);
      setPageInfo(result.data.pageInfo ?? { page: filters.page, limit: filters.limit });
      setStatus("loaded");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearchValue(filters.q ?? "");
  }, [filters.q]);

  const updateFilters = (updates: Partial<typeof filters>) => {
    const query = buildSubmissionQuery(filters, { ...updates, page: updates.page ?? 1 });
    router.push(`/internal/submissions?${query}`);
  };

  if (status === "loading") {
    return <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Loading submissions…</div>;
  }

  if (status === "error") {
    return <ErrorBox title="Unable to load submissions" error={error ?? { message: "Unknown error." }} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Status</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                value={filters.status}
                onChange={(event) => updateFilters({ status: event.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Kind</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                value={filters.kind ?? ""}
                onChange={(event) => updateFilters({ kind: event.target.value || undefined })}
              >
                <option value="">All</option>
                <option value="owner">Owner</option>
                <option value="community">Community</option>
                <option value="report">Report</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Page size</span>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
                value={filters.limit}
                onChange={(event) => updateFilters({ limit: Number(event.target.value) })}
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
          </div>
          <form
            className="flex w-full gap-2 lg:max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilters({ q: searchValue.trim() || undefined });
            }}
          >
            <input
              className="w-full rounded-md border border-gray-300 p-2 text-sm"
              placeholder="Search submissions, names, emails"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
          No submissions found for this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Submission</th>
                <th className="px-4 py-3">Submitter</th>
                <th className="px-4 py-3">Place</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Media</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((submission) => {
                const submitterName =
                  getSubmittedByValue(submission, "name") ??
                  submission.payload?.contactName ??
                  submission.payload?.submittedByName;
                const submitterNameText = toText(submitterName ?? "");
                const submitterEmail =
                  getSubmittedByValue(submission, "email") ??
                  submission.payload?.contactEmail ??
                  submission.payload?.submittedByEmail;
                const submitterEmailText = toText(submitterEmail ?? "");
                const placeName = submission.payload?.placeName ?? submission.payload?.name ?? submission.name;
                const placeNameText = toText(placeName ?? submission.payload?.placeName ?? "");
                const placeId = submission.placeId ?? submission.payload?.placeId;
                const placeIdText = toText(placeId ?? "");
                const acceptedMediaSummary =
                  submission.acceptedMediaSummary ?? submission.payload?.acceptedMediaSummary;
                const mediaSaved = submission.mediaSaved ?? submission.payload?.mediaSaved;

                return (
                  <tr key={submission.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      <div className="font-medium">{placeNameText || "(no place name)"}</div>
                      <div className="text-xs text-gray-500">{submission.id}</div>
                      <div className="text-xs text-gray-500">{submission.kind}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{submitterNameText || "—"}</div>
                      <div className="text-xs text-gray-500">{submitterEmailText || "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div>{placeIdText || "—"}</div>
                      <div className="text-xs text-gray-500">{placeNameText || "(no place name)"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={submission.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(submission.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <div>
                        {acceptedMediaSummary
                          ? Object.entries(acceptedMediaSummary)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(", ")
                          : "—"}
                      </div>
                      <div className="text-gray-500">Saved: {mediaSaved ? "Yes" : "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        href={`/internal/submissions/${submission.id}`}
                      >
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={pageInfo.page}
            limit={pageInfo.limit}
            total={pageInfo.total ?? undefined}
            hasMore={pageInfo.hasMore}
            onPageChange={(nextPage) => updateFilters({ page: nextPage })}
          />
        </div>
      )}
    </div>
  );
}
