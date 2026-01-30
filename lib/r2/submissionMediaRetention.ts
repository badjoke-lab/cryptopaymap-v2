import type { SubmissionMediaKind } from "@/lib/storage/r2";
import { buildSubmissionMediaKey } from "@/lib/storage/r2";

type SubmissionMediaIdentifier = {
  submissionId: string;
  kind: SubmissionMediaKind;
  mediaId?: string | null;
  r2Key?: string | null;
  url?: string | null;
};

const extractMediaIdFromKey = (key?: string | null) => {
  if (!key) return null;
  const match = key.match(/\/([^/]+)\.webp$/);
  return match ? match[1] : key;
};

const extractMediaIdFromUrl = (url?: string | null) => {
  if (!url) return null;
  const match = url.match(/\/([^/]+)$/);
  return match ? match[1] : url;
};

export const resolveSubmissionMediaId = (item: SubmissionMediaIdentifier) =>
  item.mediaId ?? extractMediaIdFromKey(item.r2Key) ?? extractMediaIdFromUrl(item.url);

export const resolveSubmissionMediaKey = (item: SubmissionMediaIdentifier) => {
  if (item.r2Key) return item.r2Key;

  const mediaId = resolveSubmissionMediaId(item);
  if (!mediaId) return null;

  return buildSubmissionMediaKey(item.submissionId, item.kind, mediaId);
};

