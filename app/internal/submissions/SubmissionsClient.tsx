'use client';

import { type ReactNode, useMemo, useState } from "react";

import type { StoredSubmission } from "@/lib/submissions";
import { SubmissionStatus } from "@/lib/submissions";

import { LoadedSubmission } from "./types";

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

const formatArray = (value?: string[]) => {
  if (!value || value.length === 0) return "—";
  return value.join(", ");
};

const formatPrimitive = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const statusStyle: Record<SubmissionStatus, string> = {
  pending: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3 last:border-none last:pb-0">
    <div className="text-sm font-medium text-gray-600">{label}</div>
    <div className="col-span-2 text-sm text-gray-900">{value}</div>
  </div>
);

type Props = {
  submissions: LoadedSubmission[];
};

type SubmissionMessage = { type: "success" | "error"; text: string };

export default function SubmissionsClient({ submissions: initialSubmissions }: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, SubmissionMessage | undefined>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialSubmissions.map(({ data }) => [data.submissionId, data.reviewNote ?? ""])),
  );

  const handleStatusChange = async (submissionId: string, status: Exclude<SubmissionStatus, "pending">) => {
    setPendingId(submissionId);
    setMessages((prev) => ({ ...prev, [submissionId]: undefined }));

    try {
      const response = await fetch(`/api/submissions/${submissionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNote: reviewNotes[submissionId]?.trim() || undefined }),
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => ({ error: "Failed to update" })) as { error?: string }).error;
        setMessages((prev) => ({ ...prev, [submissionId]: { type: "error", text: error ?? "Failed to update" } }));
        return;
      }

      const updated = (await response.json()) as StoredSubmission;

      setSubmissions((prev) =>
        prev.map((entry) => (entry.data.submissionId === submissionId ? { ...entry, data: updated } : entry)),
      );
      setMessages((prev) => ({ ...prev, [submissionId]: { type: "success", text: `Marked as ${status}.` } }));
    } catch (error) {
      console.error("Failed to update submission", error);
      setMessages((prev) => ({ ...prev, [submissionId]: { type: "error", text: "Unexpected error" } }));
    } finally {
      setPendingId(null);
    }
  };

  const notePlaceholder = useMemo(() => ({
    approved: "Optional note for approval",
    rejected: "Reason for rejection (optional)",
  }), []);

  return (
    <div className="space-y-4">
      {submissions.map(({ data }) => (
        <details key={data.submissionId} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer flex-col gap-3 bg-gray-50 px-4 py-3 hover:bg-gray-100 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold text-gray-900">{data.payload.name}</div>
            <div className="grid flex-1 grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-3">
              <div>
                <span className="font-medium text-gray-600">Submission ID:</span>
                <span className="ml-1 text-gray-900">{data.submissionId}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-600">Status:</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyle[data.status]}`}>
                  {data.status}
                </span>
              </div>
              <div className="text-gray-600">
                <span className="font-medium">Created:</span>
                <span className="ml-1 text-gray-900">{formatDate(data.createdAt)}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Location:</span>
                <span className="ml-1 text-gray-900">
                  {data.payload.city}, {data.payload.country}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Category:</span>
                <span className="ml-1 text-gray-900">{data.payload.category}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Accepted chains:</span>
                <span className="ml-1 text-gray-900">{formatArray(data.payload.acceptedChains)}</span>
              </div>
            </div>
          </summary>

          <div className="space-y-4 px-4 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Submission info</h3>
                <div className="space-y-3">
                  <DetailRow label="Submission ID" value={data.submissionId} />
                  <DetailRow label="Status" value={data.status} />
                  <DetailRow label="Created" value={formatDate(data.createdAt)} />
                  <DetailRow label="Reviewed" value={data.reviewedAt ? formatDate(data.reviewedAt) : "—"} />
                  <DetailRow label="Suggested place ID" value={data.suggestedPlaceId} />
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Place overview</h3>
                <div className="space-y-3">
                  <DetailRow label="Name" value={data.payload.name} />
                  <DetailRow label="Country" value={data.payload.country} />
                  <DetailRow label="City" value={data.payload.city} />
                  <DetailRow label="Address" value={data.payload.address} />
                  <DetailRow label="Category" value={data.payload.category} />
                  <DetailRow label="Verification request" value={data.payload.verificationRequest} />
                  <DetailRow label="Accepted chains" value={formatArray(data.payload.acceptedChains)} />
                  <DetailRow
                    label="Amenities"
                    value={Array.isArray(data.payload.amenities) ? formatArray(data.payload.amenities) : "—"}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Contact</h3>
                <div className="space-y-3">
                  <DetailRow label="Contact email" value={formatPrimitive(data.payload.contactEmail)} />
                  <DetailRow label="Contact name" value={formatPrimitive(data.payload.contactName)} />
                  <DetailRow label="Role" value={formatPrimitive(data.payload.role)} />
                  <DetailRow label="About" value={formatPrimitive(data.payload.about)} />
                  <DetailRow label="Payment note" value={formatPrimitive(data.payload.paymentNote)} />
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Links</h3>
                <div className="space-y-3">
                  <DetailRow label="Website" value={formatPrimitive(data.payload.website)} />
                  <DetailRow label="Twitter" value={formatPrimitive(data.payload.twitter)} />
                  <DetailRow label="Instagram" value={formatPrimitive(data.payload.instagram)} />
                  <DetailRow label="Facebook" value={formatPrimitive(data.payload.facebook)} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Coordinates</h3>
                <div className="space-y-3">
                  <DetailRow label="Latitude" value={formatPrimitive(data.payload.lat)} />
                  <DetailRow label="Longitude" value={formatPrimitive(data.payload.lng)} />
                </div>
              </div>

              <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-800">Notes</h3>
                <div className="space-y-3">
                  <DetailRow label="Notes for admin" value={formatPrimitive(data.payload.notesForAdmin)} />
                  <DetailRow label="Terms accepted" value={formatPrimitive(data.payload.termsAccepted)} />
                  <DetailRow label="Review note" value={formatPrimitive(data.reviewNote)} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-800">Review actions</h3>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700" htmlFor={`review-note-${data.submissionId}`}>
                  Review note (optional)
                </label>
                <textarea
                  id={`review-note-${data.submissionId}`}
                  className="w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={notePlaceholder[data.status === "pending" ? "approved" : data.status]}
                  rows={3}
                  value={reviewNotes[data.submissionId] ?? ""}
                  onChange={(event) =>
                    setReviewNotes((prev) => ({ ...prev, [data.submissionId]: event.target.value }))
                  }
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleStatusChange(data.submissionId, "approved")}
                    disabled={pendingId === data.submissionId}
                  >
                    {pendingId === data.submissionId ? "Updating..." : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleStatusChange(data.submissionId, "rejected")}
                    disabled={pendingId === data.submissionId}
                  >
                    {pendingId === data.submissionId ? "Updating..." : "Reject"}
                  </button>
                </div>

                {messages[data.submissionId] && (
                  <p
                    className={`text-sm ${
                      messages[data.submissionId]?.type === "success" ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {messages[data.submissionId]?.text}
                  </p>
                )}
              </div>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
