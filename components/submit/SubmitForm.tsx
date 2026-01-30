"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import LimitedModeNotice from "@/components/status/LimitedModeNotice";
import { isLimitedHeader } from "@/lib/clientDataSource";
import type { FilterMeta } from "@/lib/filters";
import type { SubmissionKind } from "@/lib/submissions";

import { FILE_LIMITS, MAX_LENGTHS } from "./constants";
import { loadDraftBundle, saveDraftBundle, serializeFiles } from "./draftStorage";
import type { OwnerCommunityDraft, ReportDraft, SubmissionDraft, SubmissionDraftFiles, StoredFile } from "./types";
import { validateDraft } from "./validation";

const emptyFiles: SubmissionDraftFiles = { gallery: [], proof: [], evidence: [] };

const buildDefaultDraft = (kind: SubmissionKind): SubmissionDraft => {
  if (kind === "report") {
    return {
      kind: "report",
      placeId: "",
      placeName: "",
      reportReason: "",
      reportDetails: "",
      reportAction: "",
      communityEvidenceUrls: [],
      submitterName: "",
      submitterEmail: "",
    } satisfies ReportDraft;
  }

  return {
    kind,
    name: "",
    country: "",
    city: "",
    address: "",
    category: "",
    acceptedChains: [],
    about: "",
    paymentNote: "",
    website: "",
    twitter: "",
    instagram: "",
    facebook: "",
    lat: "",
    lng: "",
    submitterName: "",
    submitterEmail: "",
    role: kind === "owner" ? "owner" : "customer",
    notesForAdmin: "",
    placeId: "",
    placeName: "",
    desiredStatus: kind === "owner" ? "Owner Verified" : "",
    ownerVerification: "",
    ownerVerificationDomain: "",
    ownerVerificationWorkEmail: "",
    communityEvidenceUrls: [],
    amenities: [],
    amenitiesNotes: "",
  } satisfies OwnerCommunityDraft;
};

const fieldLabel = (label: string) => <span className="text-sm font-medium text-gray-800">{label}</span>;
const parseListField = (value: string) =>
  value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
const formatListField = (entries: string[]) => entries.join("\n");

type SubmitFormProps = {
  kind: SubmissionKind;
};

const FileList = ({
  files,
  onRemove,
}: {
  files: StoredFile[];
  onRemove: (index: number) => void;
}) => {
  if (!files.length) return null;
  return (
    <ul className="space-y-1 text-sm text-gray-700">
      {files.map((file, index) => (
        <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2">
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            className="text-xs text-red-600 underline"
            onClick={() => onRemove(index)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
};

export default function SubmitForm({ kind }: SubmitFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<SubmissionDraft>(() => buildDefaultDraft(kind));
  const [files, setFiles] = useState<SubmissionDraftFiles>(emptyFiles);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<FilterMeta | null>(null);
  const [limitedMode, setLimitedMode] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const res = await fetch("/api/filters/meta");
        if (!res.ok) throw new Error("Failed to load meta");
        const data = (await res.json()) as FilterMeta;
        setMeta(data);
        setLimitedMode(isLimitedHeader(res.headers));
      } catch (error) {
        console.error(error);
      }
    };
    loadMeta();
  }, []);

  useEffect(() => {
    const saved = loadDraftBundle(kind);
    if (saved?.payload) {
      const defaults = buildDefaultDraft(kind);
      setDraft({ ...defaults, ...saved.payload });
      setFiles(saved.files ?? emptyFiles);
    }
    setInitialized(true);
  }, [kind]);

  useEffect(() => {
    if (!initialized) return;
    saveDraftBundle(kind, draft, files);
  }, [draft, files, initialized, kind]);

  const citiesForCountry = useMemo(() => {
    if (!meta || draft.kind === "report") return [];
    return meta.cities[draft.country] ?? [];
  }, [meta, draft]);

  const ownerDraft = draft.kind === "report" ? null : (draft as OwnerCommunityDraft);
  const reportDraft = draft.kind === "report" ? (draft as ReportDraft) : null;

  type DraftField = keyof OwnerCommunityDraft | keyof ReportDraft;
  type DraftValue<T extends DraftField> =
    | OwnerCommunityDraft[T & keyof OwnerCommunityDraft]
    | ReportDraft[T & keyof ReportDraft];

  const handleChange = <T extends DraftField>(field: T, value: DraftValue<T>) => {
    setDraft((prev) => ({ ...prev, [field]: value }) as SubmissionDraft);
  };

  const handleFileAdd = async (field: keyof SubmissionDraftFiles, fileList: FileList | null) => {
    if (!fileList) return;
    const nextFiles = [...files[field]];
    const limit = FILE_LIMITS[kind][field];
    const newErrors: Record<string, string> = {};

    for (const file of Array.from(fileList)) {
      if (nextFiles.length >= limit) {
        newErrors[field] = `Maximum ${limit} file(s)`;
        break;
      }
      if (file.size > 2 * 1024 * 1024) {
        newErrors[`${field}:${file.name}`] = "File exceeds 2MB limit";
        continue;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        newErrors[`${field}:${file.name}`] = "Unsupported file type";
        continue;
      }
      const [stored] = await serializeFiles([file]);
      nextFiles.push(stored);
    }

    setErrors((prev) => ({ ...prev, ...newErrors }));
    setFiles((prev) => ({ ...prev, [field]: nextFiles }));
  };

  const handleFileRemove = (field: keyof SubmissionDraftFiles, index: number) => {
    setFiles((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = () => {
    const validationErrors = validateDraft(kind, draft, files);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    saveDraftBundle(kind, draft, files);
    router.push(`/submit/${kind}/confirm`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-gray-500">Submit</p>
          <h1 className="text-3xl font-bold text-gray-900">
            {kind === "owner" && "Owner verification"}
            {kind === "community" && "Community suggestion"}
            {kind === "report" && "Report a listing"}
          </h1>
          <p className="text-gray-600">
            {kind === "report"
              ? "Flag incorrect or harmful information so we can review it."
              : "Share details so our team can review and verify the place."}
          </p>
        </div>

        {limitedMode ? <LimitedModeNotice className="w-full max-w-sm" /> : null}

        {kind !== "report" && ownerDraft ? (
          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Place details</h2>
            <div className="space-y-1">
              {fieldLabel("Business name (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.name}
                onChange={(e) => handleChange("name", e.target.value)}
                maxLength={MAX_LENGTHS.businessName}
              />
              {errors.name && <p className="text-red-600 text-sm">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Country (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.country}
                  onChange={(e) => handleChange("country", e.target.value)}
                >
                  <option value="">Select</option>
                  {meta?.countries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-red-600 text-sm">{errors.country}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("City (required)")}
                {citiesForCountry.length ? (
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={ownerDraft.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                  >
                    <option value="">Select</option>
                    {citiesForCountry.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="w-full rounded-md border px-3 py-2"
                    value={ownerDraft.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    maxLength={MAX_LENGTHS.city}
                  />
                )}
                {errors.city && <p className="text-red-600 text-sm">{errors.city}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel("Address (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.address}
                onChange={(e) => handleChange("address", e.target.value)}
                maxLength={MAX_LENGTHS.address}
              />
              {errors.address && <p className="text-red-600 text-sm">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Category (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.category}
                  onChange={(e) => handleChange("category", e.target.value)}
                >
                  <option value="">Select</option>
                  {meta?.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="text-red-600 text-sm">{errors.category}</p>}
              </div>

              <div className="space-y-1">
                {fieldLabel("Accepted crypto (required)")}
                <div className="flex flex-wrap gap-2">
                  {meta?.chains.map((chain) => (
                    <label key={chain} className="flex items-center space-x-2 border rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={ownerDraft.acceptedChains.includes(chain)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next = checked
                            ? [...ownerDraft.acceptedChains, chain]
                            : ownerDraft.acceptedChains.filter((c) => c !== chain);
                          handleChange("acceptedChains", next);
                        }}
                      />
                      <span>{chain}</span>
                    </label>
                  ))}
                </div>
                {errors.acceptedChains && <p className="text-red-600 text-sm">{errors.acceptedChains}</p>}
              </div>
            </div>

            {kind === "owner" ? (
              <div className="space-y-1">
                {fieldLabel("Desired status (required)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2 bg-gray-50"
                  value={ownerDraft.desiredStatus}
                  readOnly
                />
                {errors.desiredStatus && <p className="text-red-600 text-sm">{errors.desiredStatus}</p>}
              </div>
            ) : null}

            <div className="space-y-1">
              {fieldLabel("Verification method (required)")}
              <select
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.ownerVerification}
                onChange={(e) => handleChange("ownerVerification", e.target.value)}
              >
                <option value="">Select</option>
                <option value="domain">Domain verification</option>
                <option value="otp">Work email OTP</option>
                <option value="dashboard_ss">Dashboard screenshot</option>
              </select>
              {errors.ownerVerification && <p className="text-red-600 text-sm">{errors.ownerVerification}</p>}
            </div>

            {ownerDraft.ownerVerification === "domain" ? (
              <div className="space-y-1">
                {fieldLabel("Domain to verify (required)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.ownerVerificationDomain}
                  onChange={(e) => handleChange("ownerVerificationDomain", e.target.value)}
                  placeholder="example.com"
                  maxLength={MAX_LENGTHS.ownerVerificationDomain}
                />
                {errors.ownerVerificationDomain && (
                  <p className="text-red-600 text-sm">{errors.ownerVerificationDomain}</p>
                )}
              </div>
            ) : null}

            {ownerDraft.ownerVerification === "otp" ? (
              <div className="space-y-1">
                {fieldLabel("Work email for OTP (required)")}
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.ownerVerificationWorkEmail}
                  onChange={(e) => handleChange("ownerVerificationWorkEmail", e.target.value)}
                  placeholder="name@company.com"
                  maxLength={MAX_LENGTHS.ownerVerificationWorkEmail}
                />
                {errors.ownerVerificationWorkEmail && (
                  <p className="text-red-600 text-sm">{errors.ownerVerificationWorkEmail}</p>
                )}
              </div>
            ) : null}

            {ownerDraft.ownerVerification === "dashboard_ss" ? (
              <p className="text-sm text-gray-600">
                Upload a proof image of the dashboard in the attachments section.
              </p>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Latitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.lat}
                  onChange={(e) => handleChange("lat", e.target.value)}
                  placeholder="35.680"
                />
                {errors.lat && <p className="text-red-600 text-sm">{errors.lat}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("Longitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.lng}
                  onChange={(e) => handleChange("lng", e.target.value)}
                  placeholder="139.760"
                />
                {errors.lng && <p className="text-red-600 text-sm">{errors.lng}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel(`About (optional, ${MAX_LENGTHS.about} chars max)`)}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={ownerDraft.about}
                onChange={(e) => handleChange("about", e.target.value)}
                maxLength={MAX_LENGTHS.about}
              />
              {errors.about && <p className="text-red-600 text-sm">{errors.about}</p>}
            </div>

            <div className="space-y-1">
              {fieldLabel("Amenities (optional, one per line)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={formatListField(ownerDraft.amenities)}
                onChange={(e) => handleChange("amenities", parseListField(e.target.value))}
              />
              {errors.amenities && <p className="text-red-600 text-sm">{errors.amenities}</p>}
            </div>

            <div className="space-y-1">
              {fieldLabel("Amenities notes (optional)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={2}
                value={ownerDraft.amenitiesNotes}
                onChange={(e) => handleChange("amenitiesNotes", e.target.value)}
                maxLength={MAX_LENGTHS.amenitiesNotes}
              />
              {errors.amenitiesNotes && <p className="text-red-600 text-sm">{errors.amenitiesNotes}</p>}
            </div>

            <div className="space-y-1">
              {fieldLabel("Payment note (optional)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={ownerDraft.paymentNote}
                onChange={(e) => handleChange("paymentNote", e.target.value)}
                maxLength={MAX_LENGTHS.paymentNote}
              />
              {errors.paymentNote && <p className="text-red-600 text-sm">{errors.paymentNote}</p>}
            </div>

            {kind === "community" ? (
              <div className="space-y-1">
                {fieldLabel("Community evidence URLs (required, one per line)")}
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={3}
                  value={formatListField(ownerDraft.communityEvidenceUrls)}
                  onChange={(e) => handleChange("communityEvidenceUrls", parseListField(e.target.value))}
                />
                {errors.communityEvidenceUrls && (
                  <p className="text-red-600 text-sm">{errors.communityEvidenceUrls}</p>
                )}
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Website")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://..."
                  maxLength={MAX_LENGTHS.website}
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Twitter / X")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.twitter}
                  onChange={(e) => handleChange("twitter", e.target.value)}
                  placeholder="@handle"
                  maxLength={MAX_LENGTHS.twitter}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Instagram")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.instagram}
                  onChange={(e) => handleChange("instagram", e.target.value)}
                  placeholder="@handle"
                  maxLength={MAX_LENGTHS.instagram}
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Facebook")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.facebook}
                  onChange={(e) => handleChange("facebook", e.target.value)}
                  placeholder="https://facebook.com/..."
                  maxLength={MAX_LENGTHS.facebook}
                />
              </div>
            </div>
          </div>
        ) : null}

        {kind === "report" && reportDraft ? (
          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Report details</h2>
            <div className="space-y-1">
              {fieldLabel("Place name (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.placeName}
                onChange={(e) => handleChange("placeName", e.target.value)}
                maxLength={MAX_LENGTHS.reportPlaceName}
              />
              {errors.placeName && <p className="text-red-600 text-sm">{errors.placeName}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Reason (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.reportReason}
                onChange={(e) => handleChange("reportReason", e.target.value)}
                maxLength={MAX_LENGTHS.reportReason}
              />
              {errors.reportReason && <p className="text-red-600 text-sm">{errors.reportReason}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Requested action (required)")}
              <select
                className="w-full rounded-md border px-3 py-2"
                value={reportDraft.reportAction}
                onChange={(e) => handleChange("reportAction", e.target.value)}
              >
                <option value="">Select</option>
                <option value="hide">Hide listing</option>
                <option value="edit">Request correction</option>
              </select>
              {errors.reportAction && <p className="text-red-600 text-sm">{errors.reportAction}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Details (optional)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={reportDraft.reportDetails}
                onChange={(e) => handleChange("reportDetails", e.target.value)}
                maxLength={MAX_LENGTHS.reportDetails}
              />
              {errors.reportDetails && <p className="text-red-600 text-sm">{errors.reportDetails}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel("Evidence URLs (optional, one per line)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={formatListField(reportDraft.communityEvidenceUrls)}
                onChange={(e) => handleChange("communityEvidenceUrls", parseListField(e.target.value))}
              />
              {errors.communityEvidenceUrls && (
                <p className="text-red-600 text-sm">{errors.communityEvidenceUrls}</p>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
          <p className="text-sm text-gray-600">
            JPEG, PNG, or WebP only. Max file size 2MB.
          </p>
          {kind === "owner" && (
            <div className="space-y-2">
              {fieldLabel("Proof image (1 max)")}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleFileAdd("proof", e.target.files)} />
              {errors.proof && <p className="text-red-600 text-sm">{errors.proof}</p>}
              <FileList files={files.proof} onRemove={(index) => handleFileRemove("proof", index)} />
            </div>
          )}
          {kind !== "report" && (
            <div className="space-y-2">
              {fieldLabel(`Gallery images (${FILE_LIMITS[kind].gallery} max)`)}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileAdd("gallery", e.target.files)}
              />
              {errors.gallery && <p className="text-red-600 text-sm">{errors.gallery}</p>}
              <FileList files={files.gallery} onRemove={(index) => handleFileRemove("gallery", index)} />
            </div>
          )}
          {kind === "report" && (
            <div className="space-y-2">
              {fieldLabel("Evidence images (up to 4)")}
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileAdd("evidence", e.target.files)}
              />
              {errors.evidence && <p className="text-red-600 text-sm">{errors.evidence}</p>}
              <FileList files={files.evidence} onRemove={(index) => handleFileRemove("evidence", index)} />
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Your info</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              {fieldLabel(`Name ${kind === "report" ? "(optional)" : "(required)"}`)}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={draft.submitterName}
                onChange={(e) => handleChange("submitterName", e.target.value)}
                maxLength={MAX_LENGTHS.submitterNameMax}
              />
              {errors.submitterName && <p className="text-red-600 text-sm">{errors.submitterName}</p>}
            </div>
            <div className="space-y-1">
              {fieldLabel(`Email ${kind === "report" ? "(optional)" : "(required)"}`)}
              <input
                type="email"
                className="w-full rounded-md border px-3 py-2"
                value={draft.submitterEmail}
                onChange={(e) => handleChange("submitterEmail", e.target.value)}
                maxLength={MAX_LENGTHS.contactEmail}
              />
              {errors.submitterEmail && <p className="text-red-600 text-sm">{errors.submitterEmail}</p>}
            </div>
          </div>

          {kind !== "report" && ownerDraft ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Role")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={ownerDraft.role}
                  onChange={(e) => handleChange("role", e.target.value)}
                >
                  <option value="owner">Owner</option>
                  <option value="staff">Staff</option>
                  <option value="customer">Customer</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                {fieldLabel("Notes for admin")}
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={2}
                  maxLength={MAX_LENGTHS.notesForAdmin}
                  value={ownerDraft.notesForAdmin}
                  onChange={(e) => handleChange("notesForAdmin", e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-blue-600 text-white px-4 py-2 font-semibold"
          >
            Confirm details
          </button>
        </div>
      </div>
    </div>
  );
}
