import type { SubmissionMediaKind } from "@/lib/storage/r2";

export const buildSubmissionMediaUrl = (
  submissionId: string,
  kind: SubmissionMediaKind,
  mediaId: string,
) => {
  const sid = encodeURIComponent(String(submissionId));
  const mid = encodeURIComponent(String(mediaId));

  // gallery は公開（Map/Detailで参照される想定）
  if (kind === "gallery") {
    return `/api/media/submissions/${sid}/gallery/${mid}`;
  }

  // proof/evidence は内部（審査UIで参照）
  return `/api/internal/media/submissions/${sid}/${kind}/${mid}`;
};
