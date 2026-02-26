'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { DiscoverEnvelope } from '@/lib/discover/types';

const DISCOVER_CACHE_TTL_MS = 60_000;
const discoverCache = new Map<string, { expiresAt: number; payload: DiscoverEnvelope<unknown> }>();

export type SectionState<T> = {
  loading: boolean;
  error: string | null;
  data: T;
  limited: boolean;
  limitedReason?: string;
};

export function SectionShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 space-y-1">
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {description ? <p className="text-sm text-gray-600">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TabButton({
  active,
  children,
  onClick,
  id,
  controls,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  id?: string;
  controls?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
        active ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

export function SectionError({
  summary,
  details,
  onRetry,
  retrying,
}: {
  summary: string;
  details: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{summary}</p>
      <button className="mt-2 text-xs font-semibold underline" type="button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      {expanded ? <p className="mt-2 text-xs break-words text-red-700">{details}</p> : null}
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-3 rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}

export function LimitedDataNote({ reason }: { reason?: string }) {
  return (
    <div className="mt-3 text-xs text-gray-500">
      <p>Limited data available right now.</p>
      {reason ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-gray-500 underline">Details</summary>
          <p className="mt-1 text-gray-500">{reason}</p>
        </details>
      ) : null}
    </div>
  );
}

export function SectionEmpty({ message }: { message: string }) {
  return <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">{message}</div>;
}

export function SimpleSkeletonRows({ rows = 4, rowClassName = 'h-16' }: { rows?: number; rowClassName?: string }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`${rowClassName} animate-pulse rounded-lg bg-gray-100`} />
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

export async function fetchDiscover<T>(
  url: string,
  options?: { cacheKey?: string; ttlMs?: number; signal?: AbortSignal; force?: boolean },
): Promise<DiscoverEnvelope<T>> {
  const cacheKey = options?.cacheKey;
  const now = Date.now();

  if (cacheKey && !options?.force) {
    const cached = discoverCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.payload as DiscoverEnvelope<T>;
    }
  }

  const response = await fetch(url, { cache: 'no-store', signal: options?.signal });
  const payload = (await response.json()) as DiscoverEnvelope<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.reason || 'Request failed');
  }

  if (cacheKey) {
    discoverCache.set(cacheKey, {
      expiresAt: now + (options?.ttlMs ?? DISCOVER_CACHE_TTL_MS),
      payload: payload as DiscoverEnvelope<unknown>,
    });
  }

  return payload;
}

export function formatTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'recently';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${Math.max(diffHours, 1)}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
}

export function formatTimeTitle(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function useBreakpoint(): 'mobile' | 'tablet' | 'pc' {
  const [breakpoint, setBreakpoint] = useState<'mobile' | 'tablet' | 'pc'>('pc');

  useEffect(() => {
    const calculate = () => {
      const width = window.innerWidth;
      if (width <= 767) return 'mobile';
      if (width <= 1023) return 'tablet';
      return 'pc';
    };

    const update = () => setBreakpoint(calculate());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return breakpoint;
}
