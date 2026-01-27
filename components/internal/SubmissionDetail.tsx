'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import ErrorBox from "@/components/internal/ErrorBox";
import MediaPreviewGrid from "@/components/internal/MediaPreviewGrid";
import StatusBadge from "@/components/internal/StatusBadge";
import SubmissionActions from "@/components/internal/SubmissionActions";
import {
  fetchSubmissionDetail,
  fetchSubmissionHistory,
  type SubmissionDetail,
  type SubmissionHistoryEntry,
} from "@/lib/internal/submissions";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const toStringValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
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

const getSubmittedByValue = (submission: SubmissionDetail, key: string) => {
  const source = submission.submittedBy ?? submission.payload?.submittedBy;
  if (!source || typeof source !== "object") return undefined;
  return (source as Record<string, unknown>)[key];
};

export default function SubmissionDetailCard({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [history, setHistory] = useState<SubmissionHistoryEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [historyStatus, setHistoryStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<{ code?: string; message?: string } | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string; placeId?: string | null } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setStatus("loading");
    const result = await fetchSubmissionDetail(submissionId);
    if (result.ok) {
      setSubmission(result.data.submission);
      setStatus("loaded");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }, [submissionId]);

  const refreshHistory = useCallback(async () => {
    setHistoryStatus("loading");
    const result = await fetchSubmissionHistory(submissionId);
    if (result.ok) {
      setHistory(result.data.entries ?? []);
      setHistoryStatus("loaded");
    } else {
      setHistoryStatus("error");
    }
  }, [submissionId]);

  useEffect(() => {
    void refresh();
    void refreshHistory();
  }, [refresh, refreshHistory]);

  const reviewInfo = useMemo(() => {
    if (!submission) return null;
    return {
      reviewer: submission.reviewedBy?.name ?? submission.reviewedBy?.email,
      reviewNote: submission.reviewNote,
      approvedAt: submission.approvedAt,
      rejectedAt: submission.rejectedAt,
    };
  }, [submission]);

  if (status === "loading") {
    return <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Loading submission…</div>;
  }

  if (status === "error" || !submission) {
    return <ErrorBox title="Unable to load submission" error={error ?? { message: "Unknown error." }} />;
  }

  const submitterName =
    getSubmittedByValue(submission, "name") ??
    submission.payload?.contactName ??
    submission.payload?.submittedByName;
  const submitterEmail =
    getSubmittedByValue(submission, "email") ??
    submission.payload?.contactEmail ??
    submission.payload?.submittedByEmail;
  const placeName = submission.payload?.placeName ?? submission.payload?.name ?? submission.name;
  const placeNameText = toText(placeName ?? submission.payload?.placeName ?? "");
  const placeId = submission.placeId ?? submission.payload?.placeId;
  const acceptedMediaSummary = submission.acceptedMediaSummary ?? submission.payload?.acceptedMediaSummary;
  const mediaSaved = submission.mediaSaved ?? submission.payload?.mediaSaved;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{placeNameText || "(no place name)"}</h1>
            <p className="text-sm text-gray-500">Submission ID: {submission.id}</p>
          </div>
          <StatusBadge status={submission.status} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-800">Submission</h2>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt>Kind</dt>
                <dd>{submission.kind}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Status</dt>
                <dd>{submission.status}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Submitted</dt>
                <dd>{formatDate(submission.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Reviewed</dt>
                <dd>{formatDate(reviewInfo?.approvedAt ?? reviewInfo?.rejectedAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-800">Reviewer</h2>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt>Reviewer</dt>
                <dd>{toStringValue(reviewInfo?.reviewer)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Review note</dt>
                <dd>{toStringValue(reviewInfo?.reviewNote)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-800">Place</h2>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt>Place ID</dt>
                <dd>{toStringValue(placeId)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Published</dt>
                <dd>{toStringValue(submission.publishedPlaceId)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-800">Submitter</h2>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt>Name</dt>
                <dd>{toStringValue(submitterName)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Email</dt>
                <dd>{toStringValue(submitterEmail)}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-800">Media summary</h2>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex justify-between gap-4">
                <dt>Accepted media</dt>
                <dd>
                  {acceptedMediaSummary
                    ? Object.entries(acceptedMediaSummary)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(", ")
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Media saved</dt>
                <dd>{mediaSaved ? "Yes" : "—"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Media preview</h2>
        <div className="mt-4">
          <MediaPreviewGrid submissionId={submission.id} media={submission.media ?? []} />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Normalized payload</h2>
        <details className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">View payload JSON</summary>
          <pre className="mt-3 max-h-96 overflow-auto text-xs text-gray-700">
            {JSON.stringify(submission.payload, null, 2)}
          </pre>
        </details>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Action history</h2>
        {historyStatus === "loading" && <p className="mt-3 text-sm text-gray-500">Loading history…</p>}
        {historyStatus === "error" && <p className="mt-3 text-sm text-rose-700">Failed to load history.</p>}
        {historyStatus === "loaded" && history.length === 0 && (
          <p className="mt-3 text-sm text-gray-500">No history entries yet.</p>
        )}
        {historyStatus === "loaded" && history.length > 0 && (
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">{entry.action}</span>
                  <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Actor</p>
                    <p>{entry.actor}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Place</p>
                    <p>{entry.placeId ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Meta</p>
                    <p className="truncate">{entry.meta ? JSON.stringify(entry.meta) : "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800">Actions</h2>
          <Link className="text-sm font-semibold text-blue-600 hover:text-blue-700" href="/internal/submissions">
            Back to list
          </Link>
        </div>
        <div className="mt-4 space-y-4">
          <SubmissionActions
            submission={submission}
            onActionComplete={(message) => setToast(message)}
            onRefresh={() => {
              void refresh();
              void refreshHistory();
              router.refresh();
            }}
          />
          {toast && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                toast.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              <p>{toast.text}</p>
              {toast.placeId && (
                <p className="mt-1">
                  Place: <Link className="font-semibold text-emerald-700" href={`/places/${toast.placeId}`}>
                    {toast.placeId}
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
