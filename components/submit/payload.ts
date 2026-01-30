import type { SubmissionKind } from "@/lib/submissions";

import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft } from "./types";

const parseNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export const buildSubmissionPayload = (draft: SubmissionDraft) => {
  if (draft.kind === "report") {
    const payload: Record<string, unknown> = {
      verificationRequest: "report" satisfies SubmissionKind,
      kind: "report",
      placeId: draft.placeId || undefined,
      placeName: draft.placeName || undefined,
      name: draft.placeName || undefined,
      reportReason: draft.reportReason,
      reportDetails: draft.reportDetails || undefined,
      reportAction: draft.reportAction || undefined,
      communityEvidenceUrls: draft.communityEvidenceUrls ?? [],
      submitterName: draft.submitterName || undefined,
      contactName: draft.submitterName,
      contactEmail: draft.submitterEmail || undefined,
    };
    return payload;
  }

  const draftPayload = draft as OwnerCommunityDraft;
  return {
    verificationRequest: draftPayload.kind,
    kind: draftPayload.kind,
    name: draftPayload.name,
    country: draftPayload.country,
    city: draftPayload.city,
    address: draftPayload.address,
    category: draftPayload.category,
    acceptedChains: draftPayload.acceptedChains,
    about: draftPayload.about || undefined,
    paymentNote: draftPayload.paymentNote || undefined,
    paymentUrl: draftPayload.paymentUrl || undefined,
    desiredStatus: draftPayload.desiredStatus || undefined,
    ownerVerification: draftPayload.ownerVerification || undefined,
    ownerVerificationDomain: draftPayload.ownerVerificationDomain || undefined,
    ownerVerificationWorkEmail: draftPayload.ownerVerificationWorkEmail || undefined,
    communityEvidenceUrls: draftPayload.communityEvidenceUrls ?? [],
    amenities: draftPayload.amenities ?? [],
    amenitiesNotes: draftPayload.amenitiesNotes || undefined,
    website: draftPayload.website || undefined,
    twitter: draftPayload.twitter || undefined,
    instagram: draftPayload.instagram || undefined,
    facebook: draftPayload.facebook || undefined,
    lat: parseNumber(draftPayload.lat),
    lng: parseNumber(draftPayload.lng),
    submitterName: draftPayload.submitterName || undefined,
    contactName: draftPayload.submitterName,
    contactEmail: draftPayload.submitterEmail,
    role: draftPayload.role || undefined,
    notesForAdmin: draftPayload.notesForAdmin || undefined,
    placeId: draftPayload.placeId || undefined,
    placeName: draftPayload.placeName || undefined,
  } as Record<string, unknown>;
};
