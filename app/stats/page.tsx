'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';

import type { CategoryTrendPoint, CountryRanking } from '@/lib/stats/dashboard';
import type { MonthlyTrendPoint, WeeklyTrendPoint } from '@/lib/stats/trends';
import { CountrySortKey, filterCategoryTrends, formatPeriodLabel, getCategoryNames, sortCountries } from '@/lib/stats/utils';

type StatsResponse = {
  verificationTrends: {
    weekly: WeeklyTrendPoint[];
    monthly: MonthlyTrendPoint[];
  };
  countries: CountryRanking[];
  categoryTrends: {
    weekly: CategoryTrendPoint[];
    monthly: CategoryTrendPoint[];
  };
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

const chartColors = {
  owner: '#0ea5e9',
  community: '#f97316',
  total: '#22c55e',
};

function Legend({ series }: { series: ChartSeries[] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-700">
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

  const maxValue = Math.max(...series.flatMap((item) => item.values), 1);
  const yScale = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);
  const xScale = (index: number) => padding + (index / Math.max(labels.length - 1, 1)) * (width - padding * 2);

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => Math.round((maxValue / tickCount) * index));

  return (
    <div className="rounded-md bg-gray-50 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full">
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
          const x = xScale(index);
          const y = height - padding + 16;
          return (
            <text key={label + index} x={x} y={y} className="fill-gray-500 text-[10px]" textAnchor="middle">
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

  const maxValue = Math.max(...series.flatMap((item) => item.values), 1);
  const yScale = (value: number) => (value / maxValue) * (height - padding * 2);

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => Math.round((maxValue / tickCount) * index));

  return (
    <div className="rounded-md bg-gray-50 p-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-80 w-full">
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
              <text x={baseX + groupWidth / 2} y={labelY} className="fill-gray-500 text-[10px]" textAnchor="middle">
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <Legend series={series} />
    </div>
  );
}

function Card({ title, eyebrow, description, children }: { title: string; eyebrow: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sky-700">{eyebrow}</p>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function StatsPage() {
  const [state, setState] = useState<FetchState>({ loading: true });
  const [countrySort, setCountrySort] = useState<CountrySortKey>('total');
  const [countryLimit, setCountryLimit] = useState(6);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        if (!response.ok) {
          throw new Error('Unable to load stats');
        }
        const data = (await response.json()) as StatsResponse;
        setState({ loading: false, data });
        const categories = getCategoryNames(data.categoryTrends.weekly);
        setSelectedCategory(categories[0] ?? '');
      } catch (error) {
        setState({ loading: false, error: (error as Error).message });
      }
    };

    fetchStats();
  }, []);

  const weeklySeries = useMemo(() => {
    if (!state.data) return null;

    return [
      {
        label: 'Owner verified',
        color: chartColors.owner,
        values: state.data.verificationTrends.weekly.map((entry) => entry.owner),
      },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: state.data.verificationTrends.weekly.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: state.data.verificationTrends.weekly.map((entry) => entry.total) },
    ];
  }, [state.data]);

  const monthlySeries = useMemo(() => {
    if (!state.data) return null;

    return [
      {
        label: 'Owner verified',
        color: chartColors.owner,
        values: state.data.verificationTrends.monthly.map((entry) => entry.owner),
      },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: state.data.verificationTrends.monthly.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: state.data.verificationTrends.monthly.map((entry) => entry.total) },
    ];
  }, [state.data]);

  const sortedCountries = useMemo(
    () => sortCountries(state.data?.countries ?? [], countrySort, countryLimit),
    [state.data?.countries, countrySort, countryLimit],
  );

  const countrySeries = useMemo<ChartSeries[]>(
    () => [
      { label: 'Owner verified', color: chartColors.owner, values: sortedCountries.map((country) => country.owner) },
      { label: 'Community verified', color: chartColors.community, values: sortedCountries.map((country) => country.community) },
    ],
    [sortedCountries],
  );

  const categoryNames = useMemo(() => (state.data ? getCategoryNames(state.data.categoryTrends.weekly) : []), [state.data]);

  const weeklyCategory = useMemo(() => {
    if (!state.data || !selectedCategory) return [] as CategoryTrendPoint[];
    return filterCategoryTrends(state.data.categoryTrends.weekly, selectedCategory);
  }, [selectedCategory, state.data]);

  const monthlyCategory = useMemo(() => {
    if (!state.data || !selectedCategory) return [] as CategoryTrendPoint[];
    return filterCategoryTrends(state.data.categoryTrends.monthly, selectedCategory);
  }, [selectedCategory, state.data]);

  const weeklyCategorySeries = useMemo(() => {
    if (!weeklyCategory.length) return null;

    return [
      { label: 'Owner verified', color: chartColors.owner, values: weeklyCategory.map((entry) => entry.owner) },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: weeklyCategory.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: weeklyCategory.map((entry) => entry.total) },
    ];
  }, [weeklyCategory]);

  const monthlyCategorySeries = useMemo(() => {
    if (!monthlyCategory.length) return null;

    return [
      { label: 'Owner verified', color: chartColors.owner, values: monthlyCategory.map((entry) => entry.owner) },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: monthlyCategory.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: monthlyCategory.map((entry) => entry.total) },
    ];
  }, [monthlyCategory]);

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-gray-50 px-6 py-8 text-gray-900">
      <header className="max-w-5xl">
        <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
        <h1 className="mt-2 text-3xl font-semibold">Marketplace dashboard</h1>
        <p className="mt-2 text-gray-600">
          Country rankings and category momentum for the CryptoPayMap community. Data below is seeded for
          development and visualization purposes.
        </p>
      </header>

      {state.loading && <p className="text-gray-700">Loading stats…</p>}
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-red-700">Failed to load data: {state.error}</p>
      )}

      {state.data && weeklySeries && monthlySeries && (
        <section className="grid gap-6 md:grid-cols-2">
          <Card
            eyebrow="Weekly"
            title="Verification trend"
            description="Owner and community verified places by week."
          >
            <LineChart
              labels={state.data.verificationTrends.weekly.map((entry) => formatPeriodLabel(entry.date))}
              series={weeklySeries}
            />
          </Card>

          <Card
            eyebrow="Monthly"
            title="Verification trend"
            description="Aggregated monthly progress for owners and community."
          >
            <BarChart
              labels={state.data.verificationTrends.monthly.map((entry) => formatPeriodLabel(entry.month))}
              series={monthlySeries}
            />
          </Card>
        </section>
      )}

      {state.data && (
        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card
              eyebrow="Leaderboard"
              title="Country rankings"
              description="Top countries by number of owner and community verified listings."
            >
              <div className="mb-4 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Sort by
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={countrySort}
                    onChange={(event) => setCountrySort(event.target.value as CountrySortKey)}
                  >
                    <option value="total">Total</option>
                    <option value="owner">Owner</option>
                    <option value="community">Community</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  Show top
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    value={countryLimit}
                    onChange={(event) => setCountryLimit(Number(event.target.value))}
                  >
                    <option value={4}>4</option>
                    <option value={6}>6</option>
                    <option value={8}>8</option>
                  </select>
                </label>
              </div>

              <BarChart labels={sortedCountries.map((item) => item.country)} series={countrySeries} />
            </Card>
          </div>

          <div className="lg:col-span-1">
            <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <p className="text-sm font-medium text-sky-700">Highlights</p>
              <h2 className="text-xl font-semibold">Current leaderboard</h2>
              <p className="text-sm text-gray-600">Sorted by total verified listings.</p>
              <ol className="mt-4 space-y-3 text-sm text-gray-800">
                {sortCountries(state.data.countries).map((entry, index) => (
                  <li key={entry.country} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                      <span className="font-medium">{entry.country}</span>
                    </div>
                    <span className="text-gray-600">{entry.total} places</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>
      )}

      {state.data && weeklyCategorySeries && monthlyCategorySeries && (
        <section className="grid gap-6 md:grid-cols-2">
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

            <LineChart
              labels={weeklyCategory.map((entry) => formatPeriodLabel(entry.period))}
              series={weeklyCategorySeries}
            />
          </Card>

          <Card
            eyebrow="Category focus"
            title="Monthly category trend"
            description="Owner and community verified totals for the chosen category."
          >
            <BarChart
              labels={monthlyCategory.map((entry) => formatPeriodLabel(entry.period))}
              series={monthlyCategorySeries}
            />
          </Card>
        </section>
      )}
    </main>
  );
}
