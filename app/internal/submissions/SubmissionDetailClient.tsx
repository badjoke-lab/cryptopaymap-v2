'use client';

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { HistoryEntry } from "@/lib/history";
import type { InternalSubmission } from "@/lib/internal-submissions";

type SubmissionDetailResponse = {
  submission: InternalSubmission;
};

type SubmissionHistoryResponse = {
  entries: HistoryEntry[];
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
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

const formatValue = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

export default function SubmissionDetailClient({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const [submission, setSubmission] = useState<InternalSubmission | null>(null);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyStatus, setHistoryStatus] = useState<"loading" | "loaded" | "error">("loading");

  const loadSubmission = useCallback(async () => {
    try {
      setStatus("loading");
      const response = await fetch(`/api/internal/submissions/${submissionId}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to load submission");
      }
      const payload = (await response.json()) as SubmissionDetailResponse;
      setSubmission(payload.submission);
      setStatus("loaded");
    } catch (err) {
      console.error("Failed to load submission", err);
      setStatus("error");
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to load submission" });
    }
  }, [submissionId]);

  useEffect(() => {
    void loadSubmission();
  }, [loadSubmission]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryStatus("loading");
      const response = await fetch(`/api/internal/submissions/${submissionId}/history`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Failed to load history");
      }
      const payload = (await response.json()) as SubmissionHistoryResponse;
      setHistoryEntries(payload.entries);
      setHistoryStatus("loaded");
    } catch (err) {
      console.error("Failed to load history", err);
      setHistoryStatus("error");
    }
  }, [submissionId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleApprove = async () => {
    setMessage(null);
    try {
      const response = await fetch(`/api/internal/submissions/${submissionId}/approve`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; placeId?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to approve submission");
      }
      setMessage({ type: "success", text: `Approved. Place ID: ${payload.placeId ?? "created"}` });
      setSubmission((prev) =>
        prev
          ? {
              ...prev,
              status: "approved",
              publishedPlaceId: payload.placeId ?? prev.publishedPlaceId ?? null,
              approvedAt: new Date().toISOString(),
            }
          : prev,
      );
      await loadHistory();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to approve submission" });
    }
  };

  const handleReject = async () => {
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Reject reason is required." });
      return;
    }

    setMessage(null);
    try {
      const response = await fetch(`/api/internal/submissions/${submissionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmed }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to reject submission");
      }
      setMessage({ type: "success", text: "Rejected." });
      setSubmission((prev) =>
        prev
          ? {
              ...prev,
              status: "rejected",
              rejectedAt: new Date().toISOString(),
              rejectReason: trimmed,
            }
          : prev,
      );
      await loadHistory();
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to reject submission" });
    }
  };

  if (status === "loading") {
    return <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">Loading submission…</div>;
  }

  if (status === "error" || !submission) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {message?.text ?? "Failed to load submission."}
      </div>
    );
  }

  const isPending = submission.status === "pending";

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{submission.name}</h1>
            <p className="text-sm text-gray-500">Submission ID: {submission.id}</p>
          </div>
          <div className="text-sm font-semibold text-gray-700">Status: {submission.status}</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Submission info</h2>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <dt>Created</dt>
                <dd>{formatDate(submission.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Kind</dt>
                <dd>{submission.kind}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Approved at</dt>
                <dd>{formatDate(submission.approvedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Rejected at</dt>
                <dd>{formatDate(submission.rejectedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Published place</dt>
                <dd>{submission.publishedPlaceId ?? "—"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Location</h2>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <dt>Country</dt>
                <dd>{formatValue(submission.payload.country)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>City</dt>
                <dd>{formatValue(submission.payload.city)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Address</dt>
                <dd>{formatValue(submission.payload.address)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Lat</dt>
                <dd>{formatValue(submission.payload.lat)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Lng</dt>
                <dd>{formatValue(submission.payload.lng)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Business</h2>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <dt>Category</dt>
                <dd>{formatValue(submission.payload.category)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Accepted chains</dt>
                <dd>{formatValue(submission.payload.acceptedChains)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Amenities</dt>
                <dd>{formatValue(submission.payload.amenities)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>About</dt>
                <dd>{formatValue(submission.payload.about)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Payment note</dt>
                <dd>{formatValue(submission.payload.paymentNote)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-800">Contact & links</h2>
            <dl className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <dt>Contact email</dt>
                <dd>{formatValue(submission.payload.contactEmail)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Contact name</dt>
                <dd>{formatValue(submission.payload.contactName)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Role</dt>
                <dd>{formatValue(submission.payload.role)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Website</dt>
                <dd>{formatValue(submission.payload.website)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Twitter</dt>
                <dd>{formatValue(submission.payload.twitter)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Instagram</dt>
                <dd>{formatValue(submission.payload.instagram)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Facebook</dt>
                <dd>{formatValue(submission.payload.facebook)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Notes for admin</dt>
                <dd>{formatValue(submission.payload.notesForAdmin)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Audit history</h2>
        {historyStatus === "loading" && (
          <p className="mt-3 text-sm text-gray-500">Loading audit history…</p>
        )}
        {historyStatus === "error" && (
          <p className="mt-3 text-sm text-rose-700">Failed to load audit history.</p>
        )}
        {historyStatus === "loaded" && historyEntries.length === 0 && (
          <p className="mt-3 text-sm text-gray-500">No audit entries yet.</p>
        )}
        {historyStatus === "loaded" && historyEntries.length > 0 && (
          <div className="mt-4 space-y-3 text-sm text-gray-700">
            {historyEntries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-gray-800">{entry.action}</span>
                  <span className="text-xs text-gray-500">{formatDate(entry.createdAt)}</span>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase text-gray-400">Actor</p>
                    <p>{entry.actor}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-gray-400">Place</p>
                    <p>{entry.placeId ?? "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">Review actions</h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="text-sm font-medium text-gray-700" htmlFor="reject-reason">
            Reject reason
          </label>
          <textarea
            id="reject-reason"
            className="min-h-[96px] w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Provide a clear reason for rejection."
            disabled={!isPending}
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleApprove}
              disabled={!isPending}
            >
              Approve
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleReject}
              disabled={!isPending}
            >
              Reject
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => router.push("/internal/submissions")}
            >
              Back to list
            </button>
          </div>

          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-green-700" : "text-rose-700"}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
