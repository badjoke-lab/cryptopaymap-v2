"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { SubmitResponse } from "@/lib/submissions/client";

export default function SubmitDonePage() {
  const searchParams = useSearchParams();
  const [response, setResponse] = useState<SubmitResponse | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem("submit-response");
    if (!stored) return;
    try {
      setResponse(JSON.parse(stored) as SubmitResponse);
    } catch {
      setResponse(null);
    }
  }, []);

  const submissionId = searchParams.get("submissionId") || response?.submissionId;
  const degraded = searchParams.get("degraded") === "1";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">Submission received</h1>
          <p className="text-gray-600">
            {degraded
              ? "We received your submission, but it has been queued while we recover services."
              : "Thanks! We’ll review your submission before publishing it."}
          </p>
        </div>

        {submissionId ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Submission ID</p>
            <p className="text-lg font-semibold text-gray-900">{submissionId}</p>
          </div>
        ) : (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
            Submission ID not available. Please keep a copy of your confirmation email if provided.
          </div>
        )}

        {degraded ? (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-800">
            We’ll process pending submissions once the database is available again.
          </div>
        ) : null}

        {response?.acceptedMediaSummary ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm space-y-2">
            <h2 className="text-lg font-semibold text-gray-900">Media summary</h2>
            <ul className="text-sm text-gray-700">
              {Object.entries(response.acceptedMediaSummary).map(([key, value]) => (
                <li key={key}>
                  {key}: {value}
                </li>
              ))}
            </ul>
            {response.mediaSaved ? <p className="text-sm text-gray-600">Media saved successfully.</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
