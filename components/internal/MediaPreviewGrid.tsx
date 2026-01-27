import { buildSubmissionMediaUrl } from "@/lib/internal/submissions";
import type { SubmissionMedia } from "@/lib/internal/submissions";

const KIND_LABELS: Record<string, string> = {
  gallery: "Gallery",
  proof: "Proof",
  evidence: "Evidence",
};

const groupByKind = (media: SubmissionMedia[]) => {
  return media.reduce<Record<string, SubmissionMedia[]>>((acc, item) => {
    if (!acc[item.kind]) {
      acc[item.kind] = [];
    }
    acc[item.kind].push(item);
    return acc;
  }, {});
};

export default function MediaPreviewGrid({
  submissionId,
  media,
}: {
  submissionId: string;
  media: SubmissionMedia[];
}) {
  if (!media.length) {
    return <p className="text-sm text-gray-500">No media uploaded.</p>;
  }

  const groups = groupByKind(media);

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([kind, items]) => (
        <div key={kind}>
          <h3 className="text-sm font-semibold text-gray-800">{KIND_LABELS[kind] ?? kind}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const src = buildSubmissionMediaUrl(submissionId, item.kind, item.mediaId);
              return (
                <a
                  key={`${item.kind}-${item.mediaId}`}
                  className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="aspect-video w-full overflow-hidden bg-gray-50">
                    <img
                      src={src}
                      alt={`${item.kind} ${item.mediaId}`}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  </div>
                  <div className="space-y-1 p-3 text-xs text-gray-600">
                    <p className="font-semibold text-gray-700">{KIND_LABELS[item.kind] ?? item.kind}</p>
                    <p className="break-all">{item.mediaId}</p>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
