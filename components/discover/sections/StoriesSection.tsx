'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { discoverMockData, type MonthlyReportItem, type SectionStatus, type StoryItem, type StoryTabKey } from '@/components/discover/mock';
import { SectionEmpty, SectionError, SectionShell, SimpleSkeletonRows, TabButton } from './shared';

type ModalData =
  | { title: string; body: string; metrics: Array<{ label: string; value: string }>; mapHref: string; statsHref?: string }
  | null;

export default function StoriesSection({ status, onRetry }: { status: SectionStatus; onRetry: () => void }) {
  const [activeTab, setActiveTab] = useState<StoryTabKey>('auto');
  const [modal, setModal] = useState<ModalData>(null);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModal(null);
      }
    };

    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  const autoItems = useMemo(() => discoverMockData.autoStories, []);
  const monthlyItems = useMemo(() => discoverMockData.monthlyReports, []);

  const visibleAutoItems = useMemo(() => autoItems.slice(0, 6), [autoItems]);
  const visibleMonthlyItems = useMemo(() => monthlyItems.slice(0, 2), [monthlyItems]);

  const openStoryModal = (item: StoryItem) => {
    setModal({ title: item.title, body: item.body, metrics: item.metrics, mapHref: item.mapHref, statsHref: item.statsHref });
  };

  const openMonthlyModal = (item: MonthlyReportItem) => {
    setModal({
      title: `Monthly Report — ${item.month}`,
      body: item.body,
      metrics: item.metrics,
      mapHref: item.mapHref,
      statsHref: item.statsHref,
    });
  };

  return (
    <>
      <SectionShell title="Stories" description="Snapshot narratives and monthly highlights from the map ecosystem.">
        <div className="mb-4 flex gap-2">
          {discoverMockData.storiesTabs.map((tab) => (
            <TabButton key={tab.key} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </TabButton>
          ))}
        </div>

        {status === 'loading' ? <SimpleSkeletonRows rows={3} /> : null}
        {status === 'error' ? (
          <SectionError
            summary="Stories are currently unavailable."
            details="This Discover mock section failed to initialize and can be restored locally with retry."
            onRetry={onRetry}
          />
        ) : null}

        {status === 'success' && activeTab === 'auto' && visibleAutoItems.length === 0 ? (
          <SectionEmpty message="Stories will appear as data grows." />
        ) : null}

        {status === 'success' && activeTab === 'monthly' && visibleMonthlyItems.length === 0 ? (
          <SectionEmpty message="Monthly reports will be published here." />
        ) : null}

        {status === 'success' && activeTab === 'auto' && visibleAutoItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
            {visibleAutoItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openStoryModal(item)}
                className={`rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50 ${index >= 4 ? 'hidden lg:block' : ''} ${index >= 3 ? 'md:hidden lg:block' : ''}`}
              >
                <p className="font-semibold text-gray-900">{item.title}</p>
                <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.badges.slice(0, 2).map((badge) => (
                    <span key={badge} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">{badge}</span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-500">{item.date}</p>
              </button>
            ))}
          </div>
        ) : null}

        {status === 'success' && activeTab === 'monthly' && visibleMonthlyItems.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
            {visibleMonthlyItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openMonthlyModal(item)}
                className={`rounded-lg border border-gray-200 p-4 text-left transition hover:bg-gray-50 ${index >= 1 ? 'hidden sm:block' : ''}`}
              >
                <p className="font-semibold text-gray-900">Monthly Report — {item.month}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-gray-600">
                  {item.highlights.slice(0, 3).map((highlight) => (
                    <li key={highlight}>{highlight}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-gray-500">{item.date}</p>
              </button>
            ))}
          </div>
        ) : null}
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
            <p className="mt-3 text-sm text-gray-700">{modal.body}</p>
            <ul className="mt-3 space-y-1 text-sm text-gray-600">
              {modal.metrics.map((metric) => (
                <li key={metric.label} className="flex justify-between gap-4">
                  <span>{metric.label}</span>
                  <span className="font-semibold text-gray-800">{metric.value}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={modal.mapHref} className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white">Open Map</Link>
              {modal.statsHref ? (
                <Link href={modal.statsHref} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">View Stats</Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
