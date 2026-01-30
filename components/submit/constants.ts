import type { SubmissionKind } from "@/lib/submissions";

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export const FILE_LIMITS: Record<SubmissionKind, Record<"gallery" | "proof" | "evidence", number>> = {
  owner: { gallery: 8, proof: 1, evidence: 0 },
  community: { gallery: 4, proof: 0, evidence: 0 },
  report: { gallery: 0, proof: 0, evidence: 4 },
};

export const MAX_LENGTHS = {
  businessName: 160,
  country: 3,
  city: 120,
  address: 200,
  category: 60,
  about: 600,
  paymentNote: 150,
  website: 200,
  twitter: 200,
  instagram: 200,
  facebook: 200,
  notesForAdmin: 300,
  reportPlaceName: 80,
  reportReason: 120,
  reportDetails: 2000,
  submitterNameMax: 120,
  contactEmail: 200,
  role: 40,
  placeName: 80,
  chain: 40,
  acceptedChainsMax: 12,
  amenity: 40,
  amenitiesMax: 20,
  amenitiesNotes: 300,
  communityEvidenceUrl: 500,
  communityEvidenceUrlsMax: 10,
  desiredStatus: 80,
  ownerVerificationDomain: 200,
  ownerVerificationWorkEmail: 200,
};
