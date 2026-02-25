'use client';

import { useState } from 'react';
import { discoverMockData, type SectionStatus } from '@/components/discover/mock';
import { SectionError, SectionShell, SimpleSkeletonRows } from './shared';

export default function VerificationHubSection({ status, onRetry }: { status: SectionStatus; onRetry: () => void }) {
  const [expandedDesktop, setExpandedDesktop] = useState<string | null>(null);

  return (
    <SectionShell title="Verification Hub" description="How verification labels are used across map listings.">
      {status === 'loading' ? <SimpleSkeletonRows rows={2} /> : null}
      {status === 'error' ? (
        <SectionError
          summary="Verification hub could not be loaded."
          details="Mock verification module failed to initialize. Retry to restore local section state."
          onRetry={onRetry}
        />
      ) : null}

      {status === 'success' ? (
        <>
          <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
            {discoverMockData.verificationHub.map((item) => (
              <article key={item.key} className="rounded-lg border border-gray-200 p-4">
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-gray-700 underline"
                  onClick={() => setExpandedDesktop((prev) => (prev === item.key ? null : item.key))}
                >
                  {expandedDesktop === item.key ? 'Less' : 'More'}
                </button>
                {expandedDesktop === item.key ? <p className="mt-2 text-xs text-gray-600">{item.details}</p> : null}
              </article>
            ))}
          </div>

          <div className="space-y-2 sm:hidden">
            {discoverMockData.verificationHub.map((item) => (
              <details key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
                <summary className="cursor-pointer list-none font-semibold text-gray-900">{item.title}</summary>
                <p className="mt-2 text-sm text-gray-600">{item.summary}</p>
                <p className="mt-2 text-xs text-gray-600">{item.details}</p>
              </details>
            ))}
          </div>
        </>
      ) : null}
    </SectionShell>
  );
}
