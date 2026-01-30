'use client';

import { useState } from "react";

import type { SubmissionDetail } from "@/lib/internal/submissions";
import { approveSubmission, promoteSubmission, rejectSubmission } from "@/lib/internal/submissions";

type SubmissionActionsProps = {
  submission: SubmissionDetail;
  selectedGalleryMediaIds: string[];
  onActionComplete: (message: { type: "success" | "error"; text: string; placeId?: string | null }) => void;
  onRefresh: () => void;
};

export default function SubmissionActions({
  submission,
  selectedGalleryMediaIds,
  onActionComplete,
  onRefresh,
}: SubmissionActionsProps) {
  const [reviewNote, setReviewNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPending = submission.status === "pending";
  const isApproved = submission.status === "approved";
  const isPromotableKind = submission.kind === "owner" || submission.kind === "community";
  const canPromote = isPromotableKind && isApproved;
  const isAlreadyPromoted = Boolean(submission.publishedPlaceId);

  const handleApprove = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await approveSubmission(submission.id, reviewNote.trim() || undefined);
      if (result.ok) {
        onActionComplete({ type: "success", text: "Submission approved." });
        onRefresh();
      } else {
        onActionComplete({
          type: "error",
          text: `${result.error.code ?? "ERROR"}: ${result.error.message ?? "Failed to approve."}`,
        });
      }
    } catch (error) {
      onActionComplete({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to approve.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      onActionComplete({ type: "error", text: "Reject reason is required." });
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await rejectSubmission(submission.id, reason, reviewNote.trim() || undefined);
      if (result.ok) {
        onActionComplete({ type: "success", text: "Submission rejected." });
        onRefresh();
      } else {
        onActionComplete({
          type: "error",
          text: `${result.error.code ?? "ERROR"}: ${result.error.message ?? "Failed to reject."}`,
        });
      }
    } catch (error) {
      onActionComplete({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to reject.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePromote = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await promoteSubmission(submission.id, selectedGalleryMediaIds);
      if (result.ok) {
        onActionComplete({
          type: "success",
          text: "Submission promoted to a place.",
          placeId: result.data.placeId ?? null,
        });
        onRefresh();
      } else {
        onActionComplete({
          type: "error",
          text: `${result.error.code ?? "ERROR"}: ${result.error.message ?? "Failed to promote."}`,
        });
      }
    } catch (error) {
      onActionComplete({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to promote.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700" htmlFor="review-note">
            Reviewer note (optional)
          </label>
          <textarea
            id="review-note"
            className="min-h-[96px] w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            placeholder="Add context for approval/rejection."
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-gray-700" htmlFor="reject-reason">
            Reject reason (required)
          </label>
          <textarea
            id="reject-reason"
            className="min-h-[96px] w-full rounded-md border border-gray-300 p-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            placeholder="Provide a clear reason for rejection."
            disabled={!isPending || isSubmitting}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleApprove}
          disabled={!isPending || isSubmitting}
        >
          Approve
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleReject}
          disabled={!isPending || isSubmitting}
        >
          Reject
        </button>
        {canPromote && (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handlePromote}
            disabled={isSubmitting || isAlreadyPromoted}
          >
            {isAlreadyPromoted ? "Already promoted" : "Promote to place"}
          </button>
        )}
      </div>
    </div>
  );
}
