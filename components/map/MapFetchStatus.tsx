"use client";

type MapFetchStatusProps = {
  error: string | null;
  onRetry: () => void;
};

export default function MapFetchStatus({
  error,
  onRetry,
}: MapFetchStatusProps) {
  if (!error) return null;

  return (
    <div className="cpm-map-fetch-status" role="status" aria-live="polite">
      <span className="cpm-map-fetch-status__dot" aria-hidden />
      <span>Failed to load markers.</span>
      <button type="button" onClick={onRetry} className="cpm-map-fetch-status__retry">
        Retry
      </button>
    </div>
  );
}
