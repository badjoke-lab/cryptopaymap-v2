'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';

import { safeFetch } from '@/lib/safeFetch';

type VerificationLevel = 'owner' | 'community' | 'directory' | 'unverified';

type StatsResponse = {
  meta: { source: 'db' | 'zero'; updatedAt: string };
  totals: { places: number };
  byCountry: Array<{ key: string; count: number }>;
  byCategory: Array<{ key: string; count: number }>;
  byVerification: Array<{ key: VerificationLevel; count: number }>;
  byChain: Array<{ key: string; count: number }>;
};

type TrendPoint = {
  date: string;
  delta: number;
  total: number;
};

type TrendsResponse = {
  points: TrendPoint[];
  meta?: { reason: 'no_history_data' };
};

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

type StatsState = {
  status: FetchStatus;
  error?: string;
  stats?: StatsResponse;
  trends?: TrendsResponse;
};

type ChartSeries = {
  label: string;
  color: string;
  values: number[];
};

const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  owner: 'Owner verified',
  community: 'Community verified',
  directory: 'Directory verified',
  unverified: 'Unverified',
};

const VERIFICATION_COLORS: Record<VerificationLevel, string> = {
  owner: '#F59E0B',
  community: '#3B82F6',
  directory: '#14B8A6',
  unverified: '#9CA3AF',
};

const MAX_AXIS_LABELS = 8;
const EMPTY_MESSAGE = 'No data (showing 0).';

function getLabelStep(labels: string[]) {
  return Math.max(1, Math.ceil(labels.length / MAX_AXIS_LABELS));
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mt-4 flex w-full flex-wrap gap-x-4 gap-y-2 text-sm leading-snug text-gray-700">
      {series.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ labels, series }: { labels: string[]; series: ChartSeries[] }) {
  const width = 520;
  const height = 260;
  const padding = 32;
  const labelStep = getLabelStep(labels);

  const maxValue = Math.max(...series.flatMap((item) => item.values), 1);
  const yScale = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);
  const xScale = (index: number) => padding + (index / Math.max(labels.length - 1, 1)) * (width - padding * 2);

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => Math.round((maxValue / tickCount) * index));

  return (
    <div className="rounded-md bg-gray-50 p-4 sm:p-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 min-h-[16rem] w-full sm:h-72 lg:h-80">
        {tickValues.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e5e7eb" strokeWidth={1} />
              <text x={8} y={y + 4} className="fill-gray-500 text-xs">
                {tick}
              </text>
            </g>
          );
        })}

        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="#9ca3af" strokeWidth={1.5} />
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#9ca3af" strokeWidth={1.5} />

        {series.map((item) => (
          <polyline
            key={item.label}
            fill="none"
            stroke={item.color}
            strokeWidth={3}
            points={item.values.map((value, index) => `${xScale(index)},${yScale(value)}`).join(' ')}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {labels.map((label, index) => {
          if (index % labelStep !== 0) return null;
          const x = xScale(index);
          const y = height - padding + 16;
          return (
            <text
              key={label + index}
              x={x}
              y={y}
              className="fill-gray-500 text-[9px] sm:text-[10px]"
              textAnchor="middle"
            >
              {label}
            </text>
          );
        })}
      </svg>

      <Legend series={series} />
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6">
      <div className="mb-4 space-y-1">
        <p className="text-sm font-medium text-sky-700">{eyebrow}</p>
        <h2 className="text-xl font-semibold leading-snug sm:text-[22px]">{title}</h2>
        <p className="text-sm leading-relaxed text-gray-600 sm:max-w-2xl">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function StatsPage() {
  const [state, setState] = useState<StatsState>({ status: 'loading' });
  const stats = state.stats;
  const trends = state.trends;
  const trendPoints = trends?.points ?? [];
  const trendLabels = trendPoints.map((point) => point.date);
  const trendSeries: ChartSeries[] = [
    {
      label: 'Total published places',
      color: '#2563EB',
      values: trendPoints.map((point) => point.total),
    },
  ];

  const fetchStats = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [statsResult, trendsResult] = await Promise.allSettled([
        safeFetch<StatsResponse>('/api/stats'),
        safeFetch<TrendsResponse>('/api/stats/trends'),
      ]);

      if (statsResult.status === 'rejected') {
        throw statsResult.reason;
      }

      const trendsFallback: TrendsResponse = { points: [], meta: { reason: 'no_history_data' } };
      const trendsValue = trendsResult.status === 'fulfilled' ? trendsResult.value : trendsFallback;

      setState({ status: 'success', stats: statsResult.value, trends: trendsValue });
    } catch (error) {
      setState({
        status: 'error',
        error: 'Failed to load stats. Please try again.',
      });
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen flex-col gap-8 bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 animate-pulse">
          <header className="space-y-3">
            <div className="h-4 w-16 rounded bg-sky-100" />
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-full max-w-2xl rounded bg-gray-200" />
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-7 w-32 rounded bg-gray-300" />
                <div className="mt-2 h-3 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="h-4 w-32 rounded bg-gray-200" />
            <div className="mt-4 h-48 rounded bg-gray-100" />
          </div>
        </div>
      </main>
    );
  }

  if (state.status === 'error' || !stats || !trends) {
    return (
      <main className="flex min-h-screen flex-col gap-6 bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <header className="space-y-2">
            <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
            <h1 className="text-3xl font-semibold leading-tight">Marketplace snapshot</h1>
            <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
              Live counts for places, verification levels, and trend activity.
            </p>
          </header>
          <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-red-700">
            <p className="font-medium">{state.error ?? 'Failed to load stats.'}</p>
            <p className="text-sm">統計データの取得に失敗しました。再度お試しください。</p>
            <button
              type="button"
              onClick={fetchStats}
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
          <h1 className="text-3xl font-semibold leading-tight">Marketplace snapshot</h1>
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            Live counts for places, verification levels, and growth momentum from moderation history.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col rounded-md bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 sm:px-5 sm:py-4">
            <span className="text-sm font-medium text-gray-600">Total places</span>
            <span className="mt-1 text-2xl font-semibold text-gray-900 sm:text-[26px]">
              {stats.totals.places.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">All published listings</span>
          </div>
          {stats.byVerification.map((entry) => (
            <div
              key={entry.key}
              className="flex flex-col rounded-md bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 sm:px-5 sm:py-4"
            >
              <span className="text-sm font-medium text-gray-600">{VERIFICATION_LABELS[entry.key]}</span>
              <span className="mt-1 text-2xl font-semibold text-gray-900 sm:text-[26px]">
                {entry.count.toLocaleString()}
              </span>
              <span className="mt-2 h-2 w-full rounded-full bg-gray-100">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: stats.totals.places
                      ? `${Math.round((entry.count / stats.totals.places) * 100)}%`
                      : '0%',
                    backgroundColor: VERIFICATION_COLORS[entry.key],
                  }}
                />
              </span>
            </div>
          ))}
        </section>

        <SectionCard
          eyebrow="Trends"
          title="Growth over the last 30 days"
          description="Daily cumulative totals based on moderation history (approve/promote actions)."
        >
          {trends.points.length ? (
            <LineChart labels={trendLabels} series={trendSeries} />
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
              Not enough trend data yet.
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Top countries"
          title="Where listings are growing"
          description="Top countries by total published places."
        >
          {stats.byCountry.length ? (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Country</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.byCountry.slice(0, 10).map((entry) => (
                      <tr key={entry.key} className="bg-white">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{entry.key}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              {EMPTY_MESSAGE}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Top categories"
          title="What listings are categorized as"
          description="Top categories by total published places."
        >
          {stats.byCategory.length ? (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Category</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.byCategory.slice(0, 10).map((entry) => (
                      <tr key={entry.key} className="bg-white">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{entry.key}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              {EMPTY_MESSAGE}
            </div>
          )}
        </SectionCard>

        <SectionCard
          eyebrow="Verification levels"
          title="How listings are verified"
          description="Breakdown of verification statuses across published places."
        >
          <div className="overflow-hidden rounded-md border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-4 py-2 text-left">Verification</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stats.byVerification.map((entry) => (
                    <tr key={entry.key} className="bg-white">
                      <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                        {VERIFICATION_LABELS[entry.key]}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Top chains"
          title="Which chains are accepted"
          description="Top chains or assets accepted in published listings."
        >
          {stats.byChain.length ? (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Chain</th>
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stats.byChain.slice(0, 10).map((entry) => (
                      <tr key={entry.key} className="bg-white">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{entry.key}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              {EMPTY_MESSAGE}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
