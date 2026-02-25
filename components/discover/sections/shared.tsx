'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';

export function SectionShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 space-y-1">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
        active ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export function SectionError({ summary, details, onRetry }: { summary: string; details: string; onRetry: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{summary}</p>
      <button className="mt-2 text-xs font-semibold underline" type="button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      {expanded ? <p className="mt-2 text-xs text-red-700">{details}</p> : null}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700"
      >
        Retry
      </button>
    </div>
  );
}

export function SectionEmpty({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">{message}</div>;
}

export function SimpleSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
      ))}
    </div>
  );
}

export function renderAssetList(assets: string[], maxVisible: number) {
  const shown = assets.slice(0, maxVisible);
  const hiddenCount = Math.max(assets.length - maxVisible, 0);
  return (
    <>
      {shown.join(' • ')}
      {hiddenCount ? ` +${hiddenCount}` : ''}
    </>
  );
}

export function MapLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={className ?? 'text-left'}>
      {children}
    </Link>
  );
}
