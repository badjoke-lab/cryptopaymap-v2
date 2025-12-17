import { promises as fs } from "fs";
import path from "path";
import type { ReactNode } from "react";

import { StoredSubmission } from "@/lib/submissions";

export const runtime = "nodejs";

type LoadedSubmission = {
  data: StoredSubmission;
  fileName: string;
};

const submissionsDir = path.join(process.cwd(), "data", "submissions");

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(/\//g, "-");
};

const formatArray = (value?: string[]) => {
  if (!value || value.length === 0) return "—";
  return value.join(", ");
};

const formatPrimitive = (value: unknown) => {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const loadSubmissions = async (): Promise<{ submissions: LoadedSubmission[]; warnings: string[] }> => {
  const warnings: string[] = [];

  let files: string[] = [];
  try {
    files = await fs.readdir(submissionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { submissions: [], warnings: [] };
    }
    warnings.push("Failed to access submissions directory.");
    return { submissions: [], warnings };
  }

  const submissions: LoadedSubmission[] = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const fullPath = path.join(submissionsDir, file);

    try {
      const raw = await fs.readFile(fullPath, "utf8");
      const parsed = JSON.parse(raw) as StoredSubmission;

      if (!parsed.submissionId || !parsed.createdAt || !parsed.payload) {
        warnings.push(`File ${file} is missing required fields and was skipped.`);
        continue;
      }

      submissions.push({ data: parsed, fileName: file });
    } catch (error) {
      warnings.push(`Failed to read ${file}: ${(error as Error).message}`);
    }
  }

  submissions.sort(
    (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime(),
  );

  return { submissions, warnings };
};

const DetailRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 border-b border-gray-100 pb-3 last:border-none last:pb-0">
    <div className="text-sm font-medium text-gray-600">{label}</div>
    <div className="col-span-2 text-sm text-gray-900">{value}</div>
  </div>
);

export default async function SubmissionsPage() {
  const { submissions, warnings } = await loadSubmissions();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        <p className="text-sm font-semibold">Internal only / 暫定レビュー画面</p>
        <p className="text-sm">直リンクのみ。外部には公開しないでください。</p>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-900">
          <p className="font-medium">Some submissions could not be loaded:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
          No submissions yet.
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map(({ data }) => (
            <details key={data.submissionId} className="overflow-hidden rounded-lg border bg-white shadow-sm">
              <summary className="flex cursor-pointer flex-col gap-3 bg-gray-50 px-4 py-3 hover:bg-gray-100 md:flex-row md:items-center md:justify-between">
                <div className="text-sm font-semibold text-gray-900">{data.payload.name}</div>
                <div className="grid flex-1 grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-3">
                  <div>
                    <span className="font-medium text-gray-600">Submission ID:</span>
                    <span className="ml-1 text-gray-900">{data.submissionId}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Status:</span>
                    <span className="ml-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                      {data.status}
                    </span>
                  </div>
                  <div className="text-gray-600">
                    <span className="font-medium">Created:</span>
                    <span className="ml-1 text-gray-900">{formatDate(data.createdAt)}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Location:</span>
                    <span className="ml-1 text-gray-900">
                      {data.payload.city}, {data.payload.country}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Category:</span>
                    <span className="ml-1 text-gray-900">{data.payload.category}</span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-600">Accepted chains:</span>
                    <span className="ml-1 text-gray-900">{formatArray(data.payload.acceptedChains)}</span>
                  </div>
                </div>
              </summary>

              <div className="space-y-4 px-4 py-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Submission info</h3>
                    <div className="space-y-3">
                      <DetailRow label="Submission ID" value={data.submissionId} />
                      <DetailRow label="Status" value={data.status} />
                      <DetailRow label="Created" value={formatDate(data.createdAt)} />
                      <DetailRow label="Suggested place ID" value={data.suggestedPlaceId} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Place overview</h3>
                    <div className="space-y-3">
                      <DetailRow label="Name" value={data.payload.name} />
                      <DetailRow label="Country" value={data.payload.country} />
                      <DetailRow label="City" value={data.payload.city} />
                      <DetailRow label="Address" value={data.payload.address} />
                      <DetailRow label="Category" value={data.payload.category} />
                      <DetailRow label="Verification request" value={data.payload.verificationRequest} />
                      <DetailRow label="Accepted chains" value={formatArray(data.payload.acceptedChains)} />
                      <DetailRow
                        label="Amenities"
                        value={Array.isArray(data.payload.amenities) ? formatArray(data.payload.amenities) : "—"}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Contact</h3>
                    <div className="space-y-3">
                      <DetailRow label="Contact email" value={formatPrimitive(data.payload.contactEmail)} />
                      <DetailRow label="Contact name" value={formatPrimitive(data.payload.contactName)} />
                      <DetailRow label="Role" value={formatPrimitive(data.payload.role)} />
                      <DetailRow label="About" value={formatPrimitive(data.payload.about)} />
                      <DetailRow label="Payment note" value={formatPrimitive(data.payload.paymentNote)} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Links</h3>
                    <div className="space-y-3">
                      <DetailRow label="Website" value={formatPrimitive(data.payload.website)} />
                      <DetailRow label="Twitter" value={formatPrimitive(data.payload.twitter)} />
                      <DetailRow label="Instagram" value={formatPrimitive(data.payload.instagram)} />
                      <DetailRow label="Facebook" value={formatPrimitive(data.payload.facebook)} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Coordinates</h3>
                    <div className="space-y-3">
                      <DetailRow label="Latitude" value={formatPrimitive(data.payload.lat)} />
                      <DetailRow label="Longitude" value={formatPrimitive(data.payload.lng)} />
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">Notes</h3>
                    <div className="space-y-3">
                      <DetailRow label="Notes for admin" value={formatPrimitive(data.payload.notesForAdmin)} />
                      <DetailRow label="Terms accepted" value={formatPrimitive(data.payload.termsAccepted)} />
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </main>
  );
}

