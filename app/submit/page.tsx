"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import type { SubmissionKind } from "@/lib/submissions";
import type { FilterMeta } from "@/lib/filters";

type FormState = {
  name: string;
  country: string;
  city: string;
  address: string;
  category: string;
  accepted: string[];
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
};

type SubmissionResponse = {
  id?: string;
  status?: string;
  suggestedPlaceId?: string;
  errors?: Record<string, string>;
  error?: string;
};

const initialFormState: FormState = {
  name: "",
  country: "",
  city: "",
  address: "",
  category: "",
  accepted: [],
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
  role: "owner",
  notesForAdmin: "",
};

const emailRegex = /[^@]+@[^.]+\..+/;

const fieldLabel = (label: string) => <span className="text-sm font-medium text-gray-800">{label}</span>;

export default function SubmitPage() {
  const [mode, setMode] = useState<SubmissionKind>("owner");
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [meta, setMeta] = useState<FilterMeta | null>(null);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const res = await fetch("/api/filters/meta");
        if (!res.ok) throw new Error("Failed to load meta");
        const data = (await res.json()) as FilterMeta;
        setMeta(data);
      } catch (error) {
        console.error(error);
      }
    };
    loadMeta();
  }, []);

  const citiesForCountry = useMemo(() => {
    if (!meta) return [];
    return meta.citiesByCountry[formState.country] ?? [];
  }, [meta, formState.country]);

  const handleInputChange = (
    field: keyof FormState,
    value: string | string[] | ((prev: FormState) => FormState),
  ) => {
    setFormState((prev) => {
      if (typeof value === "function") {
        return (value as (p: FormState) => FormState)(prev);
      }
      return { ...prev, [field]: value } as FormState;
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formState.name.trim()) newErrors.name = "Required / 必須";
    if (!formState.country.trim()) newErrors.country = "Required / 必須";
    if (!formState.city.trim()) newErrors.city = "Required / 必須";
    if (!formState.address.trim()) newErrors.address = "Required / 必須";
    if (!formState.category.trim()) newErrors.category = "Required / 必須";
    if (!formState.accepted.length) newErrors.accepted = "Select at least one / 1つ以上選択";
    if (!formState.submitterName.trim()) newErrors.submitterName = "Required / 必須";
    if (!formState.submitterEmail.trim()) {
      newErrors.submitterEmail = "Required / 必須";
    } else if (!emailRegex.test(formState.submitterEmail)) {
      newErrors.submitterEmail = "Invalid email";
    }
    if (formState.lat && Number.isNaN(Number(formState.lat))) newErrors.lat = "Invalid number";
    if (formState.lng && Number.isNaN(Number(formState.lng))) newErrors.lng = "Invalid number";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    if (!validate()) return;

    setIsSubmitting(true);

    const payload = {
      name: formState.name,
      country: formState.country,
      city: formState.city,
      address: formState.address,
      category: formState.category,
      acceptedChains: formState.accepted,
      verificationRequest: mode,
      about: formState.about || undefined,
      paymentNote: formState.paymentNote || undefined,
      website: formState.website || undefined,
      twitter: formState.twitter || undefined,
      instagram: formState.instagram || undefined,
      facebook: formState.facebook || undefined,
      lat: formState.lat ? Number(formState.lat) : undefined,
      lng: formState.lng ? Number(formState.lng) : undefined,
      contactName: formState.submitterName,
      contactEmail: formState.submitterEmail,
      role: formState.role,
      notesForAdmin: formState.notesForAdmin || undefined,
    };

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({}))) as SubmissionResponse;
        throw new Error(error?.error || "Submission failed");
      }

      const data = (await res.json()) as SubmissionResponse;
      const suggestion = data.suggestedPlaceId ? ` Suggested ID: ${data.suggestedPlaceId}` : "";
      setSuccessMessage(
        `Thanks for your submission! / ご登録ありがとうございます。 We’ll review your place before publishing it on the map.${suggestion}`,
      );
    } catch (error) {
      console.error(error);
      setServerError((error as Error)?.message || "Submission failed. Please try again / 送信に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setSuccessMessage(null);
    setServerError(null);
    setErrors({});
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Submit a crypto-friendly place</h1>
          <p className="text-gray-600">店舗情報の登録 / 更新リクエスト</p>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-2">
          <p className="text-gray-800 font-semibold">Choose submitter type / 投稿者を選択</p>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setMode("owner")}
              className={`px-4 py-2 rounded-md border ${
                mode === "owner" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800"
              }`}
            >
              Owner / 店舗オーナー
            </button>
            <button
              type="button"
              onClick={() => setMode("community")}
              className={`px-4 py-2 rounded-md border ${
                mode === "community" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-800"
              }`}
            >
              Community / コミュニティ
            </button>
          </div>
          <p className="text-sm text-gray-700">
            {mode === "owner"
              ? "For store owners / staff to request verification or updates. 店舗オーナー・スタッフ向けの申請フォーム"
              : "For customers and fans to recommend a place. 常連客・ファン向けの推薦フォーム"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <div className="space-y-1">
              {fieldLabel("Store name / 店舗名 (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={formState.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
              />
              {errors.name && <p className="text-red-600 text-sm">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Country / 国 (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.country}
                  onChange={(e) => handleInputChange("country", e.target.value)}
                >
                  <option value="">Select / 選択</option>
                  {meta?.countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
                {errors.country && <p className="text-red-600 text-sm">{errors.country}</p>}
              </div>

              <div className="space-y-1">
                {fieldLabel("City / 市区町村 (required)")}
                {citiesForCountry.length ? (
                  <select
                    className="w-full rounded-md border px-3 py-2"
                    value={formState.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                  >
                    <option value="">Select / 選択</option>
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
                    value={formState.city}
                    onChange={(e) => handleInputChange("city", e.target.value)}
                  />
                )}
                {errors.city && <p className="text-red-600 text-sm">{errors.city}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel("Address / 住所 (required)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={formState.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
              />
              {errors.address && <p className="text-red-600 text-sm">{errors.address}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Category / カテゴリー (required)")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.category}
                  onChange={(e) => handleInputChange("category", e.target.value)}
                >
                  <option value="">Select / 選択</option>
                  {meta?.categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="text-red-600 text-sm">{errors.category}</p>}
              </div>

              <div className="space-y-1">
                {fieldLabel("Accepted crypto / 受け入れ (required)")}
                <div className="flex flex-wrap gap-2">
                  {meta?.chains.map((chain) => (
                    <label key={chain} className="flex items-center space-x-2 border rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={formState.accepted.includes(chain)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          handleInputChange("accepted", (prev) => ({
                            ...prev,
                            accepted: checked
                              ? [...prev.accepted, chain]
                              : prev.accepted.filter((c) => c !== chain),
                          }));
                        }}
                      />
                      <span>{chain}</span>
                    </label>
                  ))}
                </div>
                {errors.accepted && <p className="text-red-600 text-sm">{errors.accepted}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Latitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.lat}
                  onChange={(e) => handleInputChange("lat", e.target.value)}
                  placeholder="35.680"
                />
                {errors.lat && <p className="text-red-600 text-sm">{errors.lat}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("Longitude (optional)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.lng}
                  onChange={(e) => handleInputChange("lng", e.target.value)}
                  placeholder="139.760"
                />
                {errors.lng && <p className="text-red-600 text-sm">{errors.lng}</p>}
              </div>
            </div>

            <div className="space-y-1">
              {fieldLabel("About / 店舗紹介 (optional)")}
              <textarea
                className="w-full rounded-md border px-3 py-2"
                rows={3}
                value={formState.about}
                onChange={(e) => handleInputChange("about", e.target.value)}
                maxLength={600}
              />
            </div>

            <div className="space-y-1">
              {fieldLabel("Payment note / 支払いメモ (optional)")}
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                value={formState.paymentNote}
                onChange={(e) => handleInputChange("paymentNote", e.target.value)}
                maxLength={150}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Website")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.website}
                  onChange={(e) => handleInputChange("website", e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Twitter / X")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.twitter}
                  onChange={(e) => handleInputChange("twitter", e.target.value)}
                  placeholder="@handle"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Instagram")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.instagram}
                  onChange={(e) => handleInputChange("instagram", e.target.value)}
                  placeholder="@handle"
                />
              </div>
              <div className="space-y-1">
                {fieldLabel("Facebook")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.facebook}
                  onChange={(e) => handleInputChange("facebook", e.target.value)}
                  placeholder="https://facebook.com/..."
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Submitter info / 申請者情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Name / お名前 (required)")}
                <input
                  type="text"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.submitterName}
                  onChange={(e) => handleInputChange("submitterName", e.target.value)}
                />
                {errors.submitterName && <p className="text-red-600 text-sm">{errors.submitterName}</p>}
              </div>
              <div className="space-y-1">
                {fieldLabel("Email (required)")}
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.submitterEmail}
                  onChange={(e) => handleInputChange("submitterEmail", e.target.value)}
                />
                {errors.submitterEmail && <p className="text-red-600 text-sm">{errors.submitterEmail}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                {fieldLabel("Role / 役割")}
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={formState.role}
                  onChange={(e) => handleInputChange("role", e.target.value)}
                >
                  <option value="owner">Owner / オーナー</option>
                  <option value="staff">Staff / スタッフ</option>
                  <option value="customer">Customer / 常連</option>
                  <option value="other">Other / その他</option>
                </select>
              </div>
              <div className="space-y-1">
                {fieldLabel("Notes for admin / 補足")}
                <textarea
                  className="w-full rounded-md border px-3 py-2"
                  rows={2}
                  maxLength={300}
                  value={formState.notesForAdmin}
                  onChange={(e) => handleInputChange("notesForAdmin", e.target.value)}
                />
              </div>
            </div>
          </div>

          {serverError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              {serverError}
            </div>
          )}
          {successMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-green-800">
              {successMessage}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-blue-600 text-white px-4 py-2 font-semibold disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit / 送信"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-gray-600 underline">
              Send another / もう一度入力
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
