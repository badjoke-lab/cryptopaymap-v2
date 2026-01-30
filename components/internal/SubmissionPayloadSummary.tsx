'use client';

type PayloadValue = string | number | boolean | null | undefined | PayloadValue[] | Record<string, unknown>;

const LABELS: Record<string, string> = {
  verificationRequest: "Verification request",
  kind: "Kind",
  name: "Business name",
  placeName: "Place name",
  placeId: "Place ID",
  country: "Country",
  city: "City",
  address: "Address",
  category: "Category",
  acceptedChains: "Accepted chains",
  ownerVerification: "Owner verification",
  ownerVerificationDomain: "Owner verification domain",
  ownerVerificationWorkEmail: "Owner verification work email",
  paymentUrl: "Payment URL",
  paymentNote: "Payment note",
  reportAction: "Report action",
  reportReason: "Report reason",
  reportDetails: "Report details",
  desiredStatus: "Desired status",
  communityEvidenceUrls: "Community evidence URLs",
  notes: "Notes",
  notesForAdmin: "Notes for admin",
  amenities: "Amenities",
  amenitiesNotes: "Amenities notes",
  website: "Website",
  twitter: "Twitter / X",
  instagram: "Instagram",
  facebook: "Facebook",
  role: "Role",
  submitterName: "Submitter name",
  contactName: "Contact name",
  contactEmail: "Contact email",
  lat: "Latitude",
  lng: "Longitude",
};

const ORDER = [
  "verificationRequest",
  "kind",
  "name",
  "placeName",
  "placeId",
  "country",
  "city",
  "address",
  "category",
  "acceptedChains",
  "ownerVerification",
  "ownerVerificationDomain",
  "ownerVerificationWorkEmail",
  "paymentUrl",
  "paymentNote",
  "reportAction",
  "reportReason",
  "reportDetails",
  "desiredStatus",
  "amenities",
  "amenitiesNotes",
  "website",
  "twitter",
  "instagram",
  "facebook",
  "role",
  "submitterName",
  "contactName",
  "contactEmail",
  "notes",
  "notesForAdmin",
  "lat",
  "lng",
  "communityEvidenceUrls",
];

const isUrl = (value: string) => value.startsWith("http://") || value.startsWith("https://");

const formatValue = (value: PayloadValue): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map((entry) => formatValue(entry)).join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

const getEvidenceUrls = (payload: Record<string, unknown>) => {
  const candidates = [
    payload.communityEvidenceUrls,
    payload.reportEvidenceUrls,
    payload.evidenceUrls,
  ];
  const urls = candidates.flatMap((value) =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [],
  );
  return [...new Set(urls.map((entry) => entry.trim()).filter(Boolean))];
};

const buildEntries = (payload: Record<string, unknown>) => {
  const entries: Array<[string, PayloadValue]> = [];
  const seen = new Set<string>();

  ORDER.forEach((key) => {
    if (key in payload) {
      entries.push([key, payload[key] as PayloadValue]);
      seen.add(key);
    }
  });

  Object.keys(payload)
    .filter((key) => !seen.has(key))
    .sort()
    .forEach((key) => {
      entries.push([key, payload[key] as PayloadValue]);
    });

  return entries;
};

export default function SubmissionPayloadSummary({ payload }: { payload?: Record<string, unknown> }) {
  if (!payload || Object.keys(payload).length === 0) {
    return <p className="text-sm text-gray-500">No payload data available.</p>;
  }

  const entries = buildEntries(payload);
  const evidenceUrls = getEvidenceUrls(payload);

  return (
    <div className="space-y-6">
      <dl className="grid gap-3 text-sm text-gray-700 sm:grid-cols-2">
        {entries.map(([key, value]) => {
          const label = LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
          if (typeof value === "string" && isUrl(value)) {
            return (
              <div key={key} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                <dt className="text-xs font-semibold uppercase text-gray-500">{label}</dt>
                <dd className="mt-1 break-all">
                  <a className="text-blue-600 hover:text-blue-700" href={value} target="_blank" rel="noreferrer">
                    {value}
                  </a>
                </dd>
              </div>
            );
          }
          return (
            <div key={key} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
              <dt className="text-xs font-semibold uppercase text-gray-500">{label}</dt>
              <dd className="mt-1 break-words">{formatValue(value)}</dd>
            </div>
          );
        })}
      </dl>

      <div>
        <h3 className="text-sm font-semibold text-gray-800">Evidence URLs</h3>
        {evidenceUrls.length ? (
          <ul className="mt-2 space-y-1 text-sm text-blue-700">
            {evidenceUrls.map((url) => (
              <li key={url} className="break-all">
                <a href={url} target="_blank" rel="noreferrer" className="hover:text-blue-800">
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">No evidence URLs provided.</p>
        )}
      </div>
    </div>
  );
}
