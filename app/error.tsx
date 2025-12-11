'use client';

import Link from 'next/link';
import { useEffect } from 'react';

const primaryButtonClasses =
  'inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16 text-gray-900">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-base text-gray-600">An unexpected error occurred. Please try again.</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={reset} className={primaryButtonClasses}>
            Try again
          </button>
          <Link href="/map" className={secondaryButtonClasses}>
            Go to Map
          </Link>
          <Link href="/stats" className={secondaryButtonClasses}>
            Go to Stats
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-6 text-xs text-gray-500">Error digest: {error.digest}</p>
        ) : null}
      </div>
    </main>
  );
}
