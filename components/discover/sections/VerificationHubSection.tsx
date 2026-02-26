'use client';

import { useState } from 'react';
import { SectionShell } from './shared';

const verificationItems = [
  {
    key: 'owner',
    title: 'Owner Verified',
    summary: 'Confirmed directly by the business owner.',
    details: 'Owner submissions include direct confirmation flows and represent the strongest verification signal on the map.',
  },
  {
    key: 'community',
    title: 'Community Verified',
    summary: 'Validated by trusted community reporting.',
    details: 'Community verification indicates a reviewed submission from contributors with current on-the-ground context.',
  },
  {
    key: 'directory',
    title: 'Directory',
    summary: 'Imported from partner/public sources.',
    details: 'Directory entries help map coverage and may be refreshed into stronger verification states over time.',
  },
  {
    key: 'unverified',
    title: 'Unverified',
    summary: 'Present but not fully confirmed yet.',
    details: 'Unverified does not mean incorrect; it means confirmation signals are still limited or in progress.',
  },
] as const;

export default function VerificationHubSection() {
  const [expandedDesktop, setExpandedDesktop] = useState<string | null>(null);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);

  return (
    <SectionShell title="Verification Hub" description="How verification labels are used across map listings.">
      <div className="hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        {verificationItems.map((item) => (
          <article key={item.key} className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
            <button
              type="button"
              className="mt-2 min-h-[36px] text-xs font-semibold text-gray-700 underline"
              onClick={() => setExpandedDesktop((prev) => (prev === item.key ? null : item.key))}
            >
              {expandedDesktop === item.key ? 'Less' : 'More'}
            </button>
            {expandedDesktop === item.key ? <p className="mt-2 text-xs text-gray-600">{item.details}</p> : null}
          </article>
        ))}
      </div>

      <div className="space-y-2 md:hidden" data-testid="verification-accordion">
        {verificationItems.map((item) => (
          <article key={item.key} className="rounded-lg border border-gray-200 bg-white p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 py-1 text-left text-base font-semibold text-gray-900"
              onClick={() => setExpandedMobile((prev) => (prev === item.key ? null : item.key))}
              aria-expanded={expandedMobile === item.key}
              aria-controls={`verification-content-${item.key}`}
              data-testid={`verification-trigger-${item.key}`}
            >
              <span>{item.title}</span>
              <span className="text-xs font-semibold text-gray-600">{expandedMobile === item.key ? 'Hide' : 'More'}</span>
            </button>
            <div id={`verification-content-${item.key}`} className="mt-2" hidden={expandedMobile !== item.key}>
              <p className="text-sm text-gray-600">{item.summary}</p>
              <p className="mt-2 text-xs text-gray-600">{item.details}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
