import type { SubmissionKind } from "@/lib/submissions";

export type OwnerCommunityDraft = {
  kind: "owner" | "community";
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  acceptedChains: string[];
  about: string;
  paymentNote: string;
  website: string;
  twitter: string;
  instagram: string;
  facebook: string;
  lat: string;
  lng: string;
  submitterName: string;
  submitterEmail: string;
  role: string;
  notesForAdmin: string;
  placeId: string;
  placeName: string;
  desiredStatus: string;
  ownerVerification: string;
  ownerVerificationDomain: string;
  ownerVerificationWorkEmail: string;
  communityEvidenceUrls: string[];
  amenities: string[];
  amenitiesNotes: string;
};

export type ReportDraft = {
  kind: "report";
  placeId: string;
  placeName: string;
  reportReason: string;
  reportDetails: string;
  reportAction: string;
  communityEvidenceUrls: string[];
  submitterName: string;
  submitterEmail: string;
};

export type SubmissionDraft = OwnerCommunityDraft | ReportDraft;

export type StoredFile = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
  dataUrl: string;
};

export type SubmissionDraftFiles = {
  gallery: StoredFile[];
  proof: StoredFile[];
  evidence: StoredFile[];
};

export type DraftBundle = {
  kind: SubmissionKind;
  payload: SubmissionDraft;
  files: SubmissionDraftFiles;
  updatedAt: string;
};
