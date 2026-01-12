"use client";

type MapFetchStatusProps = {
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
};

export default function MapFetchStatus({
  isLoading,
  error,
  onRetry,
}: MapFetchStatusProps) {
  if (!isLoading && !error) return null;

  return (
    <div className="cpm-map-fetch-status" role="status" aria-live="polite">
      {isLoading ? (
        <>
          <span className="cpm-map-fetch-status__spinner" aria-hidden />
          <span>Loading markers…</span>
        </>
      ) : (
        <>
          <span className="cpm-map-fetch-status__dot" aria-hidden />
          <span>Failed to load markers.</span>
          <button type="button" onClick={onRetry} className="cpm-map-fetch-status__retry">
            Retry
          </button>
        </>
      )}
    </div>
  );
}
