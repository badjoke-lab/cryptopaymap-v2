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
    website: draftPayload.website || undefined,
    twitter: draftPayload.twitter || undefined,
    instagram: draftPayload.instagram || undefined,
    facebook: draftPayload.facebook || undefined,
    lat: parseNumber(draftPayload.lat),
    lng: parseNumber(draftPayload.lng),
    contactName: draftPayload.submitterName,
    contactEmail: draftPayload.submitterEmail,
    role: draftPayload.role || undefined,
    notesForAdmin: draftPayload.notesForAdmin || undefined,
    placeId: draftPayload.placeId || undefined,
    placeName: draftPayload.placeName || undefined,
  } as Record<string, unknown>;
};
