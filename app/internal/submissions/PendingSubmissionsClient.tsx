'use client';

import Link from "next/link";
import { useEffect, useState } from "react";

import type { InternalSubmission } from "@/lib/internal-submissions";
import type { ReportSubmissionPayload } from "@/lib/submissions";

type SubmissionListResponse = {
  submissions: InternalSubmission[];
};

const isReportSubmission = (
  submission: InternalSubmission,
): submission is InternalSubmission & { kind: "report"; payload: ReportSubmissionPayload } =>
  submission.kind === "report" || submission.payload.verificationRequest === "report";

const displayName = (submission: InternalSubmission) =>
  isReportSubmission(submission)
    ? submission.payload.placeName ?? submission.payload.name ?? submission.name
    : submission.name;

const reportSummary = (submission: InternalSubmission) => {
  if (!isReportSubmission(submission)) return null;
  const notes = submission.payload.reportReason ?? submission.payload.notes;
  if (!notes) return null;
  return notes.length > 80 ? `${notes.slice(0, 77)}…` : notes;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
};

export default function PendingSubmissionsClient() {
  const [submissions, setSubmissions] = useState<InternalSubmission[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus("loading");
        const response = await fetch("/api/internal/submissions?status=pending&limit=200");
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error ?? "Failed to load submissions");
        }
        const payload = (await response.json()) as SubmissionListResponse;
        setSubmissions(payload.submissions ?? []);
        setStatus("loaded");
      } catch (err) {
        console.error("Failed to load submissions", err);
        setError(err instanceof Error ? err.message : "Failed to load submissions");
        setStatus("error");
      }
    };

    void load();
  }, []);

  if (status === "loading") {
    return <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Loading submissions…</div>;
  }

  if (status === "error") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {error ?? "Failed to load submissions."}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
        No pending submissions.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-3">Business</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {submissions.map((submission) => {
            const summary = reportSummary(submission);
            const reportSubmission = isReportSubmission(submission) ? submission : null;
            return (
              <tr key={submission.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-900">
                  <div className="font-medium">{displayName(submission)}</div>
                  {reportSubmission?.placeId && (
                    <div className="text-xs text-gray-500">place_id: {reportSubmission.placeId}</div>
                  )}
                  {reportSubmission && summary && (
                    <div className="text-xs text-gray-600">{summary}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">{submission.kind}</td>
                <td className="px-4 py-3 text-gray-700">
                  {reportSubmission
                    ? reportSubmission.placeId ?? "—"
                    : `${submission.city}, ${submission.country}`}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDate(submission.createdAt)}</td>
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
    </div>
  );
}
