import type { SubmissionMediaKind } from "@/lib/storage/r2";

export const buildSubmissionMediaUrl = (
  submissionId: string,
  kind: SubmissionMediaKind,
  mediaId: string,
) => {
  if (kind === "gallery") {
    return `/api/media/submissions/${submissionId}/gallery/${mediaId}`;
  }
  return `/api/internal/media/submissions/${submissionId}/${kind}/${mediaId}`;
};
