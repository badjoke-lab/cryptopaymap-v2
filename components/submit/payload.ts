import type { SubmissionKind } from "@/lib/submissions";

import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft } from "./types";

const parseNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const normalizeList = (value?: string[]) => (value ?? []).map((entry) => entry.trim()).filter(Boolean);

const buildPaymentAcceptRows = (value: OwnerCommunityDraft["paymentAccepts"]) =>
  value.flatMap((entry) => {
    const assetKey = entry.assetKey.trim().replace(/\s+/g, "").toUpperCase();
    if (!assetKey) return [];

    const knownRows = normalizeList(entry.rails).map((rail) => ({ asset_key: assetKey, rail_key: rail.toLowerCase() }));
    const customRows = normalizeList(entry.customRails).map((rail) => ({
      asset_key: assetKey,
      rail_key: "custom",
      rail_raw: rail,
    }));
    const rows = [...knownRows, ...customRows];
    return rows.length ? rows : [{ asset_key: assetKey, rail_key: "unknown" }];
  });

const deriveAcceptedChainsFromPaymentAccepts = (rows: Array<{ asset_key: string }>) =>
  Array.from(new Set(rows.map((row) => row.asset_key).filter(Boolean)));

export const buildSubmissionPayload = (draft: SubmissionDraft) => {
  const communityEvidenceUrls = normalizeList(draft.communityEvidenceUrls);
  if (draft.kind === "report") {
    const payload: Record<string, unknown> = {
      verificationRequest: "report" satisfies SubmissionKind,
      kind: "report",
      placeId: draft.placeId || undefined,
      placeName: draft.placeName || undefined,
      name: draft.placeName || undefined,
      reportReason: draft.reportReason,
      reportDetails: draft.reportDetails,
      reportAction: draft.reportAction,
      communityEvidenceUrls,
      submitterName: draft.submitterName || undefined,
      contactName: draft.submitterName,
      contactEmail: draft.submitterEmail || undefined,
    };
    return payload;
  }

  const draftPayload = draft as OwnerCommunityDraft;
  const paymentAcceptRows = buildPaymentAcceptRows(draftPayload.paymentAccepts);
  return {
    verificationRequest: draftPayload.kind,
    kind: draftPayload.kind,
    name: draftPayload.name,
    country: draftPayload.country,
    city: draftPayload.city,
    address: draftPayload.address,
    category: draftPayload.category,
    acceptedChains: deriveAcceptedChainsFromPaymentAccepts(paymentAcceptRows),
    payment_accepts: paymentAcceptRows,
    about: draftPayload.about || undefined,
    paymentNote: draftPayload.paymentNote || undefined,
    paymentUrl: draftPayload.paymentUrl || undefined,
    desiredStatus: draftPayload.desiredStatus || undefined,
    ownerVerification: draftPayload.ownerVerification || undefined,
    ownerVerificationDomain: draftPayload.ownerVerificationDomain || undefined,
    ownerVerificationWorkEmail: draftPayload.ownerVerificationWorkEmail || undefined,
    communityEvidenceUrls,
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
