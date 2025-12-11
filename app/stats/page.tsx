'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import type { CategoryTrendPoint } from '@/lib/stats/dashboard';
import type { CategoryStats, ChainStats, CountryStats, StatsKPI } from '@/lib/stats/aggregate';
import type { MonthlyTrendPoint, WeeklyTrendPoint } from '@/lib/stats/trends';
import type { VerificationKey } from '@/lib/types/stats';
import { filterCategoryTrends, formatPeriodLabel, getCategoryNames } from '@/lib/stats/utils';
import { safeFetch } from '@/lib/safeFetch';

type StatsResponse = {
  verificationTrends: {
    weekly: WeeklyTrendPoint[];
    monthly: MonthlyTrendPoint[];
  };
  countries: CountryStats[];
  categoryTrends: {
    weekly: CategoryTrendPoint[];
    monthly: CategoryTrendPoint[];
  };
  byCountry: CountryStats[];
  byCategory: CategoryStats[];
  byChain: ChainStats[];
  kpi: StatsKPI;
};

type FetchState = {
  loading: boolean;
  error?: string;
  data?: StatsResponse;
};

type ChartSeries = {
  label: string;
  color: string;
  values: number[];
};

const STATS_COLORS: Record<VerificationKey, string> = {
  total: '#6B7280',
  owner: '#F59E0B',
  community: '#3B82F6',
  directory: '#14B8A6',
  unverified: '#9CA3AF',
};

const VERIFICATION_SERIES: { key: VerificationKey; label: string }[] = [
  { key: 'total', label: 'Total places' },
  { key: 'owner', label: 'Owner verified' },
  { key: 'community', label: 'Community verified' },
  { key: 'directory', label: 'Directory verified' },
  { key: 'unverified', label: 'Unverified listings' },
];

const MAX_AXIS_LABELS = 8;

function getLabelStep(labels: string[]) {
  return Math.max(1, Math.ceil(labels.length / MAX_AXIS_LABELS));
}

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="stats-legend mt-4 flex w-full flex-wrap gap-x-4 gap-y-2 text-sm leading-snug text-gray-700">
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
    <div className="stats-chart-shell rounded-md bg-gray-50 p-4 sm:p-5">
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

function BarChart({ labels, series }: { labels: string[]; series: ChartSeries[] }) {
  const width = 520;
  const height = 260;
  const padding = 32;
  const groupWidth = (width - padding * 2) / Math.max(labels.length, 1);
  const barWidth = groupWidth / (series.length + 1);
  const labelStep = getLabelStep(labels);

  const maxValue = Math.max(...series.flatMap((item) => item.values), 1);
  const yScale = (value: number) => (value / maxValue) * (height - padding * 2);

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => Math.round((maxValue / tickCount) * index));

  return (
    <div className="stats-chart-shell rounded-md bg-gray-50 p-4 sm:p-5">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 min-h-[16rem] w-full sm:h-72 lg:h-80">
        {tickValues.map((tick) => {
          const y = height - padding - yScale(tick);
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

        {labels.map((label, labelIndex) => {
          const baseX = padding + labelIndex * groupWidth;
          const labelY = height - padding + 16;
          return (
            <g key={label + labelIndex}>
              {series.map((item, seriesIndex) => {
                const value = item.values[labelIndex] ?? 0;
                const barHeight = yScale(value);
                const x = baseX + seriesIndex * barWidth + barWidth * 0.3;
                const y = height - padding - barHeight;
                return (
                  <rect
                    key={`${label}-${item.label}`}
                    x={x}
                    y={y}
                    width={barWidth * 0.7}
                    height={barHeight}
                    rx={3}
                    fill={item.color}
                  />
                );
              })}
              {labelIndex % labelStep === 0 ? (
                <text
                  x={baseX + groupWidth / 2}
                  y={labelY}
                  className="fill-gray-500 text-[9px] sm:text-[10px]"
                  textAnchor="middle"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      <Legend series={series} />
    </div>
  );
}

function Card({
  title,
  eyebrow,
  description,
  children,
  className,
}: {
  title: string;
  eyebrow: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`stats-card rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200 sm:p-6 ${className ?? ''}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-sky-700">{eyebrow}</p>
          <h2 className="text-xl font-semibold leading-snug sm:text-[22px]">{title}</h2>
          <p className="text-sm leading-relaxed text-gray-600 sm:max-w-2xl">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function KPICard({
  title,
  value,
  color,
  helper,
}: {
  title: string;
  value: string;
  color: string;
  helper?: string;
}) {
  return (
    <div className="flex flex-col rounded-md bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 sm:px-5 sm:py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 sm:text-[26px]">{value}</div>
      {helper ? <div className="text-xs text-gray-500">{helper}</div> : null}
    </div>
  );
}

function StackedBar({
  owner,
  community,
  directory,
  unverified,
  total,
}: {
  owner: number;
  community: number;
  directory: number;
  unverified: number;
  total: number;
}) {
  const safeTotal = total || 1;
  const segments = [
    { color: STATS_COLORS.owner, value: owner },
    { color: STATS_COLORS.community, value: community },
    { color: STATS_COLORS.directory, value: directory },
    { color: STATS_COLORS.unverified, value: unverified },
  ];

  return (
    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
      {segments.map((segment) => {
        const width = (segment.value / safeTotal) * 100;
        if (!width) return null;
        return <span key={segment.color} className="block h-full" style={{ width: `${width}%`, backgroundColor: segment.color }} />;
      })}
    </div>
  );
}

export default function StatsPage() {
  const [state, setState] = useState<FetchState>({ loading: true });
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const fetchStats = useCallback(async () => {
    setState({ loading: true });
    try {
      const data = await safeFetch<StatsResponse>('/api/stats');
      setState({ loading: false, data });
      const categories = getCategoryNames(data.categoryTrends.weekly);
      setSelectedCategory(categories[0] ?? '');
    } catch (error) {
      setState({ loading: false, error: (error as Error).message });
      setSelectedCategory('');
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const data = state.data;

  const weeklySeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];

    return VERIFICATION_SERIES.map((series) => ({
      label: series.label,
      color: STATS_COLORS[series.key],
      values: data.verificationTrends.weekly.map((entry) => entry[series.key]),
    }));
  }, [data]);

  const monthlySeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];

    return VERIFICATION_SERIES.map((series) => ({
      label: series.label,
      color: STATS_COLORS[series.key],
      values: data.verificationTrends.monthly.map((entry) => entry[series.key]),
    }));
  }, [data]);

  const categoryNames = useMemo(() => (data ? getCategoryNames(data.categoryTrends.weekly) : []), [data]);

  const weeklyCategory = useMemo(() => {
    if (!data || !selectedCategory) return [] as CategoryTrendPoint[];
    return filterCategoryTrends(data.categoryTrends.weekly, selectedCategory);
  }, [selectedCategory, data]);

  const monthlyCategory = useMemo(() => {
    if (!data || !selectedCategory) return [] as CategoryTrendPoint[];
    return filterCategoryTrends(data.categoryTrends.monthly, selectedCategory);
  }, [selectedCategory, data]);

  const weeklyCategorySeries = useMemo(() => {
    if (!weeklyCategory.length) return [] as ChartSeries[];

    return VERIFICATION_SERIES.map((series) => ({
      label: series.label,
      color: STATS_COLORS[series.key],
      values: weeklyCategory.map((entry) => entry[series.key]),
    }));
  }, [weeklyCategory]);

  const monthlyCategorySeries = useMemo(() => {
    if (!monthlyCategory.length) return [] as ChartSeries[];

    return VERIFICATION_SERIES.map((series) => ({
      label: series.label,
      color: STATS_COLORS[series.key],
      values: monthlyCategory.map((entry) => entry[series.key]),
    }));
  }, [monthlyCategory]);

  if (state.loading) {
    return (
      <main className="stats-page flex min-h-screen flex-col gap-8 bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 animate-pulse">
          <header className="max-w-4xl space-y-3">
            <div className="h-4 w-16 rounded bg-sky-100" />
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-full max-w-2xl rounded bg-gray-200" />
            <div className="h-4 w-full max-w-xl rounded bg-gray-200" />
          </header>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="rounded-lg bg-white p-4 shadow-sm">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-3 h-7 w-32 rounded bg-gray-300" />
                <div className="mt-2 h-3 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            {[...Array(2)].map((_, index) => (
              <div key={index} className="rounded-md bg-gray-100 p-4 sm:p-5">
                <div className="h-5 w-24 rounded bg-gray-200" />
                <div className="mt-2 h-6 w-48 rounded bg-gray-200" />
                <div className="mt-4 h-40 rounded bg-white" />
              </div>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-md bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-28 rounded bg-gray-200" />
                <div className="h-5 w-56 rounded bg-gray-200" />
              </div>
              <div className="mt-4 h-48 rounded bg-gray-100" />
            </div>
            <div className="rounded-md bg-white p-4 shadow-sm">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="mt-2 h-5 w-40 rounded bg-gray-200" />
              <div className="mt-4 space-y-3">
                {[...Array(4)].map((_, idx) => (
                  <div key={idx} className="h-10 rounded bg-gray-100" />
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="stats-page flex min-h-screen flex-col gap-8 bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="max-w-4xl space-y-2">
            <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
            <h1 className="text-3xl font-semibold leading-tight">Marketplace dashboard</h1>
            <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
              Country rankings and category momentum for the CryptoPayMap community. Data below is seeded for development and visualization purposes.
            </p>
          </header>
          <div className="flex flex-col gap-3 rounded-md bg-red-50 px-4 py-3 text-red-700">
            <p className="font-medium">Failed to load stats. Please try again later.</p>
            <p className="text-sm">統計データの取得に失敗しました。時間をおいて再度お試しください。</p>
            <button
              type="button"
              onClick={fetchStats}
              disabled={state.loading}
              className="inline-flex max-w-fit items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-400"
            >
              {state.loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-white" aria-hidden />
              )}
              <span>Retry</span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const verifiedTotal = data.kpi.ownerCount + data.kpi.communityCount;
  const verifiedRatio = data.kpi.totalPlaces ? Math.round((verifiedTotal / data.kpi.totalPlaces) * 100) : 0;
  const maxChainTotal = Math.max(...data.byChain.map((entry) => entry.total), 1);

  return (
    <main className="stats-page flex min-h-screen flex-col bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="max-w-4xl space-y-2">
          <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
          <h1 className="text-3xl font-semibold leading-tight">Marketplace dashboard</h1>
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            Country rankings, category momentum, and crypto support for the CryptoPayMap community. Data below is seeded for development and visualization purposes.
          </p>
        </header>

        {weeklySeries && monthlySeries && (
          <section className="grid gap-6 md:grid-cols-2">
            <Card eyebrow="Weekly" title="Verification trend" description="Owner, community, directory, and unverified places by week.">
              <LineChart labels={data.verificationTrends.weekly.map((entry) => formatPeriodLabel(entry.label))} series={weeklySeries} />
            </Card>

            <Card eyebrow="Monthly" title="Verification trend" description="Aggregated monthly progress across all verification types.">
              <BarChart labels={data.verificationTrends.monthly.map((entry) => formatPeriodLabel(entry.label))} series={monthlySeries} />
            </Card>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard title="Total places" value={data.kpi.totalPlaces.toLocaleString()} color={STATS_COLORS.total} />
          <KPICard
            title="Owner places"
            value={data.kpi.ownerCount.toLocaleString()}
            color={STATS_COLORS.owner}
            helper={`${Math.round(data.kpi.ownerRatio * 100)}% of all listings`}
          />
          <KPICard
            title="Community places"
            value={data.kpi.communityCount.toLocaleString()}
            color={STATS_COLORS.community}
            helper={`${Math.round(data.kpi.communityRatio * 100)}% of all listings`}
          />
          <KPICard title="Verified ratio" value={`${verifiedRatio}%`} color={STATS_COLORS.total} helper="Owner + community" />
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card
            eyebrow="Top countries"
            title="Country ranking"
            description="Top countries by verification mix across owner, community, directory, and unverified listings."
            className="lg:col-span-2"
          >
            <div className="overflow-hidden rounded-md border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Country</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Owner</th>
                      <th className="px-4 py-2 text-right">Community</th>
                      <th className="px-4 py-2 text-right">Directory</th>
                      <th className="px-4 py-2 text-right">Unverified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.byCountry.slice(0, 10).map((entry) => (
                      <tr key={entry.country} className="bg-white">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{entry.country}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.total}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.owner}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.community}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.directory}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{entry.unverified}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>

          <Card
            eyebrow="Chains"
            title="Supported crypto"
            description="How many places accept each chain or asset."
            className="h-full"
          >
            <ul className="mt-2 space-y-3 text-sm text-gray-800">
              {data.byChain.map((entry) => (
                <li key={entry.chain} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium uppercase tracking-wide text-gray-900">{entry.chain}</span>
                    <span className="text-gray-700">{entry.total} places</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(entry.total / maxChainTotal) * 100}%`, backgroundColor: STATS_COLORS.total }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card
            eyebrow="Categories"
            title="Category distribution"
            description="Verification mix per category. The bars stack owner, community, directory, and unverified counts."
          >
            <div className="space-y-3 text-sm text-gray-800">
              {data.byCategory.map((entry) => (
                <div key={entry.category} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 font-medium text-gray-900">
                      <span className="uppercase tracking-wide">{entry.category}</span>
                    </div>
                    <div className="text-gray-700">{entry.total} places</div>
                  </div>
                  <StackedBar
                    owner={entry.owner}
                    community={entry.community}
                    directory={entry.directory}
                    unverified={entry.unverified}
                    total={entry.total}
                  />
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATS_COLORS.owner }} /> Owner {entry.owner}</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATS_COLORS.community }} /> Community {entry.community}</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATS_COLORS.directory }} /> Directory {entry.directory}</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATS_COLORS.unverified }} /> Unverified {entry.unverified}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {weeklyCategorySeries && monthlyCategorySeries && (
            <Card
              eyebrow="Category focus"
              title="Weekly category trend"
              description="Compare how each category is growing week over week."
            >
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Select category
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={selectedCategory}
                    onChange={(event) => setSelectedCategory(event.target.value)}
                  >
                    {categoryNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <LineChart labels={weeklyCategory.map((entry) => formatPeriodLabel(entry.period))} series={weeklyCategorySeries} />
            </Card>
          )}
        </section>

        {weeklyCategorySeries && monthlyCategorySeries && (
          <Card
            eyebrow="Category focus"
            title="Monthly category trend"
            description="Verification mix across total, owner, community, directory, and unverified listings for the chosen category."
          >
            <BarChart labels={monthlyCategory.map((entry) => formatPeriodLabel(entry.period))} series={monthlyCategorySeries} />
          </Card>
        )}
      </div>
    </main>
  );
}
