'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DiscoverMonthlyStory, DiscoverStoryCard } from '@/lib/discover/types';
import { LimitedDataNote, SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, TabButton, fetchDiscover, formatTimeLabel, formatTimeTitle, useBreakpoint } from './shared';

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
  const [autoRetrying, setAutoRetrying] = useState(false);

  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [monthlyItems, setMonthlyItems] = useState<DiscoverMonthlyStory[]>([]);
  const [monthlyLimited, setMonthlyLimited] = useState(false);
  const [monthlyLimitedReason, setMonthlyLimitedReason] = useState<string | undefined>();
  const [monthlyRetrying, setMonthlyRetrying] = useState(false);

  const autoAbortRef = useRef<AbortController | null>(null);
  const monthlyAbortRef = useRef<AbortController | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!modal) return;
    const focusable = modalRef.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])');
    const first = focusable?.[0];
    const last = focusable?.[focusable.length - 1];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const loadAuto = useCallback(async (force = false) => {
    autoAbortRef.current?.abort();
    const controller = new AbortController();
    autoAbortRef.current = controller;
    setAutoLoading(true);
    setAutoError(null);
    try {
      const payload = await fetchDiscover<DiscoverStoryCard[]>('/api/discover/stories/auto', {
        cacheKey: 'stories:auto',
        signal: controller.signal,
        force,
      });
      if (controller.signal.aborted) return;
      setAutoItems(payload.data);
      setAutoLimited(payload.limited);
      setAutoLimitedReason(payload.reason);
    } catch (err) {
      if (controller.signal.aborted) return;
      setAutoError(err instanceof Error ? err.message : 'Unable to load stories');
    } finally {
      if (!controller.signal.aborted) {
        setAutoLoading(false);
        setAutoRetrying(false);
      }
    }
  }, []);

  const loadMonthly = useCallback(async (force = false) => {
    monthlyAbortRef.current?.abort();
    const controller = new AbortController();
    monthlyAbortRef.current = controller;
    setMonthlyLoading(true);
    setMonthlyError(null);
    try {
      const payload = await fetchDiscover<{ hasContent: boolean; items: DiscoverMonthlyStory[] }>('/api/discover/stories/monthly', {
        cacheKey: 'stories:monthly',
        signal: controller.signal,
        force,
      });
      if (controller.signal.aborted) return;
      setMonthlyItems(payload.data.items);
      setMonthlyLimited(payload.limited);
      setMonthlyLimitedReason(payload.reason);
    } catch (err) {
      if (controller.signal.aborted) return;
      setMonthlyError(err instanceof Error ? err.message : 'Unable to load monthly reports');
    } finally {
      if (!controller.signal.aborted) {
        setMonthlyLoading(false);
        setMonthlyRetrying(false);
      }
    }
  }, []);

  useEffect(() => {
    loadAuto();
    loadMonthly();
    return () => {
      autoAbortRef.current?.abort();
      monthlyAbortRef.current?.abort();
    };
  }, [loadAuto, loadMonthly]);

  useEffect(() => () => {
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
  }, []);

  const visibleAutoItems = useMemo(() => autoItems.slice(0, autoLimit), [autoItems, autoLimit]);
  const visibleMonthlyItems = useMemo(() => monthlyItems.slice(0, monthlyLimit), [monthlyItems, monthlyLimit]);

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const order: StoryTab[] = ['auto', 'monthly'];
    const current = order.indexOf(activeTab);
    if (event.key === 'Home') return setActiveTab(order[0]);
    if (event.key === 'End') return setActiveTab(order[order.length - 1]);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (current + delta + order.length) % order.length;
    setActiveTab(order[next]);
  };

  const retryAuto = () => {
    if (autoRetrying) return;
    setAutoRetrying(true);
    retryTimeoutRef.current = setTimeout(() => loadAuto(true), 300);
  };

  const retryMonthly = () => {
    if (monthlyRetrying) return;
    setMonthlyRetrying(true);
    retryTimeoutRef.current = setTimeout(() => loadMonthly(true), 300);
  };

  return (
    <>
      <SectionShell title="Stories" description="Snapshot narratives and monthly highlights from the map ecosystem.">
        <div className="mb-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Stories tabs" onKeyDown={onTabKeyDown}>
          <TabButton active={activeTab === 'auto'} onClick={() => setActiveTab('auto')} id="stories-tab-auto" controls="stories-panel-auto">Auto Stories</TabButton>
          <TabButton active={activeTab === 'monthly'} onClick={() => setActiveTab('monthly')} id="stories-tab-monthly" controls="stories-panel-monthly">Monthly Report</TabButton>
        </div>

        {activeTab === 'auto' ? (
          <div id="stories-panel-auto" role="tabpanel" aria-labelledby="stories-tab-auto">
            {autoLoading ? <SimpleSkeletonRows rows={3} rowClassName="h-[128px]" /> : null}
            {autoError ? <SectionError summary="Stories are currently unavailable." details={autoError} onRetry={retryAuto} retrying={autoRetrying} /> : null}
            {!autoLoading && !autoError && visibleAutoItems.length === 0 ? <SectionEmpty message="Stories will appear as data grows." /> : null}
            {!autoLoading && !autoError && visibleAutoItems.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
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
                    aria-label={`Open story details: ${item.title}`}
                  >
                    <p className="line-clamp-2 font-semibold text-gray-900">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-gray-600">{item.summary}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.badges.slice(0, 2).map((badge) => (
                        <span key={badge} className="max-w-full truncate rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{badge}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500" title={formatTimeTitle(item.dateISO)}>{formatTimeLabel(item.dateISO)}</p>
                  </button>
                ))}
              </div>
            ) : null}
            {!autoLoading && !autoError && autoLimited ? <LimitedDataNote reason={autoLimitedReason} /> : null}
          </div>
        ) : (
          <div id="stories-panel-monthly" role="tabpanel" aria-labelledby="stories-tab-monthly">
            {monthlyLoading ? <SimpleSkeletonRows rows={2} rowClassName="h-[128px]" /> : null}
            {monthlyError ? <SectionError summary="Monthly reports are currently unavailable." details={monthlyError} onRetry={retryMonthly} retrying={monthlyRetrying} /> : null}
            {!monthlyLoading && !monthlyError && visibleMonthlyItems.length === 0 ? <SectionEmpty message="Monthly reports will be published here." /> : null}
            {!monthlyLoading && !monthlyError && visibleMonthlyItems.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {visibleMonthlyItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setModal({ kind: 'monthly', title: item.title, month: item.month, highlights: item.highlights })}
                    className="rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50"
                    aria-label={`Open monthly story details: ${item.title}`}
                  >
                    <p className="line-clamp-2 font-semibold text-gray-900">{item.title}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">
                      {item.highlights.slice(0, 3).map((highlight) => (
                        <li key={highlight} className="line-clamp-1">{highlight}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-gray-500" title={formatTimeTitle(item.dateISO)}>{formatTimeLabel(item.dateISO)}</p>
                  </button>
                ))}
              </div>
            ) : null}
            {!monthlyLoading && !monthlyError && monthlyLimited ? <LimitedDataNote reason={monthlyLimitedReason} /> : null}
          </div>
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
          <div ref={modalRef} className="w-full max-w-lg rounded-xl bg-white p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">{modal.title}</h3>
              <button type="button" onClick={() => setModal(null)} aria-label="Close story modal" className="rounded-full border border-gray-300 px-2 py-0.5 text-sm">×</button>
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
