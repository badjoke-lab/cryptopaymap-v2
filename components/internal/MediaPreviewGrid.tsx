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

type MediaPreviewGridProps = {
  submissionId: string;
  media: SubmissionMedia[];
  selectableKind?: string;
  selectedMediaIds?: string[];
  onToggleSelection?: (mediaId: string) => void;
};

export default function MediaPreviewGrid({
  submissionId,
  media,
  selectableKind,
  selectedMediaIds = [],
  onToggleSelection,
}: MediaPreviewGridProps) {
  if (!media.length) {
    return <p className="text-sm text-gray-500">No media uploaded.</p>;
  }

  const selectedSet = new Set(selectedMediaIds);
  const groups = groupByKind(media);

  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([kind, items]) => (
        <div key={kind}>
          <h3 className="text-sm font-semibold text-gray-800">{KIND_LABELS[kind] ?? kind}</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const src = buildSubmissionMediaUrl(submissionId, item.kind, item.mediaId);
              const isSelectable = selectableKind === item.kind && onToggleSelection;
              const isSelected = selectedSet.has(item.mediaId);
              return (
                <div
                  key={`${item.kind}-${item.mediaId}`}
                  className={`group overflow-hidden rounded-lg border bg-white shadow-sm ${
                    isSelectable && isSelected ? "border-emerald-300 ring-1 ring-emerald-200" : "border-gray-200"
                  }`}
                >
                  <a href={src} target="_blank" rel="noreferrer">
                    <div className="aspect-video w-full overflow-hidden bg-gray-50">
                      <img
                        src={src}
                        alt={`${item.kind} ${item.mediaId}`}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                    </div>
                  </a>
                  <div className="space-y-2 p-3 text-xs text-gray-600">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-gray-700">{KIND_LABELS[item.kind] ?? item.kind}</p>
                      {isSelectable ? (
                        <label className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            checked={isSelected}
                            onChange={() => onToggleSelection(item.mediaId)}
                          />
                          Promote
                        </label>
                      ) : null}
                    </div>
                    <p className="break-all">{item.mediaId}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
