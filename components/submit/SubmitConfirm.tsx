"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { SubmissionKind } from "@/lib/submissions";
import { submitMultipartSubmission } from "@/lib/submissions/client";

import { buildSubmissionPayload } from "./payload";
import { clearDraftBundle, hydrateFiles, loadDraftBundle } from "./draftStorage";
import type { DraftBundle, SubmissionDraftFiles } from "./types";
import { validateDraft } from "./validation";

const emptyFileState = { gallery: [], proof: [], evidence: [] } as SubmissionDraftFiles;

const SummaryRow = ({ label, value }: { label: string; value?: ReactNode }) => (
  <div className="flex items-start gap-4">
    <dt className="w-40 text-sm text-gray-500">{label}</dt>
    <dd className="flex-1 text-sm text-gray-900">{value || "—"}</dd>
  </div>
);

const renderEvidenceList = (entries?: string[]) => {
  const normalized = (entries ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (!normalized.length) return "—";
  return (
    <ol className="list-decimal pl-4 space-y-1">
      {normalized.map((url, index) => (
        <li key={`${url}-${index}`} className="break-all">
          {url}
        </li>
      ))}
    </ol>
  );
};

const reportActionLabel = (value?: string) => {
  if (value === "hide") return "Hide listing";
  if (value === "edit") return "Request correction";
  return value || "—";
};

const renderPaymentAccepts = (rows?: Array<{ asset_key?: string; rail_key?: string; rail_raw?: string }>) => {
  if (!rows?.length) return "—";
  return rows
    .map((row) => {
      if (row.rail_key === "custom" && row.rail_raw) return `${row.asset_key} (${row.rail_raw})`;
      return `${row.asset_key} (${row.rail_key})`;
    })
    .join(", ");
};

const renderAcceptedAssets = (rows?: Array<{ asset_key?: string }>) => {
  const assets = Array.from(new Set((rows ?? []).map((row) => row.asset_key).filter(Boolean)));
  return assets.length ? assets.join(", ") : "—";
};

export default function SubmitConfirm({ kind }: { kind: SubmissionKind }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<DraftBundle | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionErrorCode, setSubmissionErrorCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loaded = loadDraftBundle(kind);
    if (loaded) {
      setBundle(loaded);
      const errors = validateDraft(kind, loaded.payload, loaded.files ?? emptyFileState);
      setClientErrors(errors);
    }
  }, [kind]);

  const fileCounts = useMemo(() => {
    if (!bundle?.files) return emptyFileState;
    return bundle.files;
  }, [bundle]);

  const submissionPayload = useMemo(() => {
    if (!bundle) return null;
    return buildSubmissionPayload(bundle.payload);
  }, [bundle]);

  const verificationSummary = useMemo(() => {
    if (!bundle || bundle.payload.kind === "report") return null;
    const method = bundle.payload.ownerVerification;
    const methodLabel =
      method === "domain"
        ? "Domain verification"
        : method === "otp"
          ? "Work email OTP"
          : method === "dashboard_ss"
            ? "Dashboard screenshot"
            : "—";
    const inputValue =
      method === "domain"
        ? bundle.payload.ownerVerificationDomain
        : method === "otp"
          ? bundle.payload.ownerVerificationWorkEmail
          : "—";
    return { methodLabel, inputValue };
  }, [bundle]);

  const paymentRequirementSummary = useMemo(() => {
    if (!bundle || bundle.payload.kind !== "owner") return null;
    const hasUrl = Boolean(bundle.payload.paymentUrl?.trim());
    const hasScreenshot = fileCounts.proof.length > 0;
    const status = hasUrl && hasScreenshot
      ? "URL・SSで満たした"
      : hasUrl
        ? "URLで満たした"
        : hasScreenshot
          ? "SSで満たした"
          : "未達";
    return { hasUrl, status };
  }, [bundle, fileCounts.proof.length]);

  const handleSubmit = async () => {
    if (!bundle) return;
    const errors = validateDraft(kind, bundle.payload, bundle.files ?? emptyFileState);
    setClientErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmissionError(null);
    setSubmissionErrorCode(null);
    setIsSubmitting(true);

    try {
      const payload = buildSubmissionPayload(bundle.payload);
      const hydratedFiles = {
        gallery: await hydrateFiles(bundle.files.gallery ?? []),
        proof: await hydrateFiles(bundle.files.proof ?? []),
        evidence: await hydrateFiles(bundle.files.evidence ?? []),
      };

      const result = await submitMultipartSubmission(payload, hydratedFiles);
      if (result.ok && result.data?.submissionId) {
        clearDraftBundle(kind);
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("submit-response", JSON.stringify(result.data));
        }
        const degraded = result.status === 202 ? "1" : "0";
        router.replace(`/submit/done?submissionId=${result.data.submissionId}&degraded=${degraded}`);
        return;
      }

      if (!result.ok) {
        setSubmissionErrorCode(result.error?.code ?? "UNKNOWN_ERROR");
        setSubmissionError(result.error?.message ?? "Submission failed.");
      } else {
        setSubmissionErrorCode("UNKNOWN_ERROR");
        setSubmissionError("Submission failed.");
      }
    } catch (error) {
      setSubmissionErrorCode("NETWORK_ERROR");
      setSubmissionError((error as Error)?.message ?? "Submission failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!bundle) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-12 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Review your submission</h1>
          <p className="text-gray-600">We couldn’t find your draft. Please return to the form.</p>
          <button
            type="button"
            className="rounded-md bg-blue-600 text-white px-4 py-2 font-semibold"
            onClick={() => router.push(`/submit/${kind}`)}
          >
            Back to form
          </button>
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(clientErrors).length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-gray-500">Submit</p>
          <h1 className="text-3xl font-bold text-gray-900">Review your details</h1>
          <p className="text-gray-600">Confirm everything looks right before sending.</p>
        </div>

        {hasErrors ? (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
            Please fix the highlighted issues before submitting.
          </div>
        ) : null}

        {submissionError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800 space-y-1">
            <p className="font-semibold">{submissionErrorCode}</p>
            <p>{submissionError}</p>
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Submission</h2>
          <dl className="space-y-2">
            {bundle.payload.kind === "report" ? (
              <>
                <SummaryRow label="Place ID" value={bundle.payload.placeId} />
                <SummaryRow label="Place name" value={bundle.payload.placeName} />
                <SummaryRow label="Reason" value={bundle.payload.reportReason} />
                <SummaryRow label="Requested action" value={reportActionLabel(bundle.payload.reportAction)} />
                <SummaryRow label="What is incorrect?" value={bundle.payload.reportDetails} />
                <SummaryRow label="Evidence URLs" value={renderEvidenceList(bundle.payload.communityEvidenceUrls)} />
              </>
            ) : (
              <>
                <SummaryRow label="Business name" value={bundle.payload.name} />
                <SummaryRow label="Country" value={bundle.payload.country} />
                <SummaryRow label="City" value={bundle.payload.city} />
                <SummaryRow label="Address" value={bundle.payload.address} />
                <SummaryRow label="Category" value={bundle.payload.category} />
                <SummaryRow
                  label="Accepted crypto"
                  value={renderAcceptedAssets((submissionPayload?.payment_accepts as Array<{ asset_key?: string }>) ?? [])}
                />
                <SummaryRow
                  label="Networks"
                  value={renderPaymentAccepts((submissionPayload?.payment_accepts as Array<{ asset_key?: string; rail_key?: string; rail_raw?: string }>) ?? [])}
                />
                {bundle.payload.kind === "owner" ? (
                  <SummaryRow label="Desired status" value={bundle.payload.desiredStatus} />
                ) : null}
                <SummaryRow label="Verification method" value={verificationSummary?.methodLabel} />
                <SummaryRow label="Verification input" value={verificationSummary?.inputValue} />
                {bundle.payload.kind === "owner" ? (
                  <>
                    <SummaryRow label="Payment URL" value={bundle.payload.paymentUrl} />
                    <SummaryRow label="Payment requirement" value={paymentRequirementSummary?.status} />
                  </>
                ) : null}
                <SummaryRow label="Proof attached" value={fileCounts.proof.length ? "Yes" : "No"} />
                <SummaryRow label="Latitude" value={bundle.payload.lat} />
                <SummaryRow label="Longitude" value={bundle.payload.lng} />
                <SummaryRow label="About" value={bundle.payload.about} />
                <SummaryRow
                  label="Amenities"
                  value={(bundle.payload.amenities ?? []).length ? (bundle.payload.amenities ?? []).join(", ") : "—"}
                />
                <SummaryRow label="Amenities notes" value={bundle.payload.amenitiesNotes} />
                <SummaryRow label="Payment note" value={bundle.payload.paymentNote} />
                <SummaryRow label="Evidence URLs" value={renderEvidenceList(bundle.payload.communityEvidenceUrls)} />
                <SummaryRow label="Website" value={bundle.payload.website} />
                <SummaryRow label="Twitter / X" value={bundle.payload.twitter} />
                <SummaryRow label="Instagram" value={bundle.payload.instagram} />
                <SummaryRow label="Facebook" value={bundle.payload.facebook} />
                <SummaryRow label="Role" value={bundle.payload.role} />
                <SummaryRow label="Notes for admin" value={bundle.payload.notesForAdmin} />
                <SummaryRow label="Related place ID" value={bundle.payload.placeId} />
                <SummaryRow label="Related place name" value={bundle.payload.placeName} />
              </>
            )}
          </dl>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Payload preview</h2>
          <p className="text-sm text-gray-600">This is the payload that will be sent to the API.</p>
          <pre className="whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {submissionPayload ? JSON.stringify(submissionPayload, null, 2) : "—"}
          </pre>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
          <ul className="text-sm text-gray-700 space-y-1">
            {fileCounts.proof.length ? (
              <li>Proof: {fileCounts.proof.map((file) => file.name).join(", ")}</li>
            ) : null}
            {fileCounts.gallery.length ? (
              <li>Gallery: {fileCounts.gallery.map((file) => file.name).join(", ")}</li>
            ) : null}
            {fileCounts.evidence.length ? (
              <li>Evidence: {fileCounts.evidence.map((file) => file.name).join(", ")}</li>
            ) : (
              !fileCounts.proof.length && !fileCounts.gallery.length && <li>No attachments</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Submitter</h2>
          <dl className="space-y-2">
            <SummaryRow label="Name" value={bundle.payload.submitterName} />
            <SummaryRow label="Email" value={bundle.payload.submitterEmail} />
          </dl>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/submit/${kind}`)}
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700"
          >
            Back to edit
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || hasErrors}
            className="rounded-md bg-blue-600 text-white px-4 py-2 font-semibold disabled:opacity-60"
          >
            {isSubmitting ? "Submitting..." : "Final submit"}
          </button>
        </div>
      </div>
    </div>
  );
}
