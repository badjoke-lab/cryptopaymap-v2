import type { SubmissionKind } from "@/lib/submissions";

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const FILE_LIMITS: Record<SubmissionKind, Record<"gallery" | "proof" | "evidence", number>> = {
  owner: { gallery: 8, proof: 1, evidence: 0 },
  community: { gallery: 4, proof: 0, evidence: 0 },
  report: { gallery: 0, proof: 0, evidence: 4 },
};

export const MAX_LENGTHS = {
  businessName: 80,
  address: 200,
  aboutOwner: 600,
  aboutCommunity: 300,
  paymentNote: 150,
  reportPlaceName: 80,
  reportReason: 120,
  reportDetails: 2000,
  submitterNameMin: 2,
  submitterNameMax: 80,
};
