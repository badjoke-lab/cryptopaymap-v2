'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DiscoverMonthlyStory, DiscoverStoryCard } from '@/lib/discover/types';
import { LimitedDataNote, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, TabButton, fetchDiscover, useBreakpoint } from './shared';

type StoryTab = 'auto' | 'monthly';

type AutoModal = {
  kind: 'auto';
  title: string;
  summary: string;
  badges: string[];
  metrics: Array<{ label: string; value: string }>;
  mapHref: string;
};

type MonthlyModal = {
  kind: 'monthly';
  title: string;
  month: string;
  highlights: string[];
};

type ModalData = AutoModal | MonthlyModal | null;

export default function StoriesSection() {
  const [activeTab, setActiveTab] = useState<StoryTab>('auto');
  const [modal, setModal] = useState<ModalData>(null);

  const [autoLoading, setAutoLoading] = useState(true);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoItems, setAutoItems] = useState<DiscoverStoryCard[]>([]);
  const [autoLimited, setAutoLimited] = useState(false);
  const [autoLimitedReason, setAutoLimitedReason] = useState<string | undefined>();

  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthlyItems, setMonthlyItems] = useState<DiscoverMonthlyStory[]>([]);
  const [monthlyLimited, setMonthlyLimited] = useState(false);
  const [monthlyLimitedReason, setMonthlyLimitedReason] = useState<string | undefined>();

  const breakpoint = useBreakpoint();
  const autoLimit = breakpoint === 'mobile' ? 3 : breakpoint === 'tablet' ? 4 : 6;
  const monthlyLimit = breakpoint === 'mobile' ? 1 : 2;

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const loadAuto = useCallback(async () => {
    setAutoLoading(true);
    setAutoError(null);
    try {
      const payload = await fetchDiscover<DiscoverStoryCard[]>('/api/discover/stories/auto');
      setAutoItems(payload.data);
      setAutoLimited(payload.limited);
      setAutoLimitedReason(payload.reason);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : 'Unable to load stories');
    } finally {
      setAutoLoading(false);
    }
  }, []);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      const payload = await fetchDiscover<{ hasContent: boolean; items: DiscoverMonthlyStory[] }>('/api/discover/stories/monthly');
      setMonthlyItems(payload.data.items);
      setMonthlyLimited(payload.limited);
      setMonthlyLimitedReason(payload.reason);
    } catch (err) {
      setMonthlyError(err instanceof Error ? err.message : 'Unable to load monthly reports');
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAuto();
    loadMonthly();
  }, [loadAuto, loadMonthly]);

  const visibleAutoItems = useMemo(() => autoItems.slice(0, autoLimit), [autoItems, autoLimit]);
  const visibleMonthlyItems = useMemo(() => monthlyItems.slice(0, monthlyLimit), [monthlyItems, monthlyLimit]);

  return (
    <>
      <SectionShell title="Stories" description="Snapshot narratives and monthly highlights from the map ecosystem.">
        <div className="mb-4 flex gap-2">
          <TabButton active={activeTab === 'auto'} onClick={() => setActiveTab('auto')}>Auto Stories</TabButton>
          <TabButton active={activeTab === 'monthly'} onClick={() => setActiveTab('monthly')}>Monthly Report</TabButton>
        </div>

        {activeTab === 'auto' ? (
          <>
            {autoLoading ? <SimpleSkeletonRows rows={3} /> : null}
            {autoError ? <SectionError summary="Stories are currently unavailable." details={autoError} onRetry={loadAuto} /> : null}
            {!autoLoading && !autoError && visibleAutoItems.length === 0 ? <SectionEmpty message="Stories will appear as data grows." /> : null}
            {!autoLoading && !autoError && visibleAutoItems.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
                {visibleAutoItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModal({
                      kind: 'auto',
                      title: item.title,
                      summary: item.summary,
                      badges: item.badges,
                      metrics: item.metricsPreview,
                      mapHref: item.cta.kind === 'map' ? item.cta.href : '/map',
                    })}
                    className="rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50"
                  >
                    <p className="font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.badges.slice(0, 2).map((badge) => (
                        <span key={badge} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{badge}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">{item.dateISO}</p>
                  </button>
                ))}
              </div>
            ) : null}
            {autoLimited ? <LimitedDataNote reason={autoLimitedReason} /> : null}
          </>
        ) : (
          <>
            {monthlyLoading ? <SimpleSkeletonRows rows={2} /> : null}
            {monthlyError ? <SectionError summary="Monthly reports are currently unavailable." details={monthlyError} onRetry={loadMonthly} /> : null}
            {!monthlyLoading && !monthlyError && visibleMonthlyItems.length === 0 ? <SectionEmpty message="Monthly reports will be published here." /> : null}
            {!monthlyLoading && !monthlyError && visibleMonthlyItems.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
                {visibleMonthlyItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModal({ kind: 'monthly', title: item.title, month: item.month, highlights: item.highlights })}
                    className="rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50"
                  >
                    <p className="font-semibold text-gray-900">{item.title}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">
                      {item.highlights.slice(0, 3).map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-gray-500">{item.dateISO}</p>
                  </button>
                ))}
              </div>
            ) : null}
            {monthlyLimited ? <LimitedDataNote reason={monthlyLimitedReason} /> : null}
          </>
        )}
      </SectionShell>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={modal.title}
          onClick={() => setModal(null)}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{modal.title}</h3>
              <button type="button" onClick={() => setModal(null)} className="rounded-full border border-gray-300 px-2 py-0.5 text-sm">×</button>
            </div>

            {modal.kind === 'auto' ? (
              <>
                <p className="mt-3 text-sm text-gray-700">{modal.summary}</p>
                <ul className="mt-3 space-y-1 text-sm text-gray-600">
                  {modal.metrics.map((metric) => (
                    <li key={metric.label} className="flex justify-between gap-4">
                      <span>{metric.label}</span>
                      <span className="font-semibold text-gray-800">{metric.value}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={modal.mapHref || '/map'} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Open Map</Link>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-600">{modal.month}</p>
                <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-gray-700">
                  {modal.highlights.map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href="/stats" className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">View Stats</Link>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
