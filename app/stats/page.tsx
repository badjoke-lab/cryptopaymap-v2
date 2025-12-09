'use client';

import { useEffect, useMemo, useState } from 'react';

import type { MonthlyTrendPoint, WeeklyTrendPoint } from '@/lib/stats/trends';

type TrendResponse = {
  weekly: WeeklyTrendPoint[];
  monthly: MonthlyTrendPoint[];
};

type FetchState = {
  loading: boolean;
  error?: string;
  data?: TrendResponse;
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
            <text key={label} x={x} y={y} className="fill-gray-500 text-[10px]" textAnchor="middle">
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
            <g key={label}>
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

export default function StatsPage() {
  const [state, setState] = useState<FetchState>({ loading: true });

  useEffect(() => {
    const fetchTrends = async () => {
      try {
        const response = await fetch('/api/stats/trends');
        if (!response.ok) {
          throw new Error('Unable to load stats');
        }
        const data = (await response.json()) as TrendResponse;
        setState({ loading: false, data });
      } catch (error) {
        setState({ loading: false, error: (error as Error).message });
      }
    };

    fetchTrends();
  }, []);

  const weeklySeries = useMemo(() => {
    if (!state.data) return null;

    return [
      { label: 'Owner verified', color: chartColors.owner, values: state.data.weekly.map((entry) => entry.owner) },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: state.data.weekly.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: state.data.weekly.map((entry) => entry.total) },
    ];
  }, [state.data]);

  const monthlySeries = useMemo(() => {
    if (!state.data) return null;

    return [
      { label: 'Owner verified', color: chartColors.owner, values: state.data.monthly.map((entry) => entry.owner) },
      {
        label: 'Community verified',
        color: chartColors.community,
        values: state.data.monthly.map((entry) => entry.community),
      },
      { label: 'Total places', color: chartColors.total, values: state.data.monthly.map((entry) => entry.total) },
    ];
  }, [state.data]);

  return (
    <main className="flex min-h-screen flex-col gap-8 bg-gray-50 px-6 py-8 text-gray-900">
      <header className="max-w-5xl">
        <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
        <h1 className="mt-2 text-3xl font-semibold">Growth trends</h1>
        <p className="mt-2 text-gray-600">
          Weekly and monthly snapshots of places listed on CryptoPayMap, broken down by verification
          type. Data is currently seeded for development and visualization purposes.
        </p>
      </header>

      {state.loading && <p className="text-gray-700">Loading trends…</p>}
      {state.error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-red-700">Failed to load data: {state.error}</p>
      )}

      {state.data && weeklySeries && monthlySeries && (
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-sky-700">Weekly</p>
                <h2 className="text-xl font-semibold">Verification trend</h2>
                <p className="text-sm text-gray-600">Owner and community verified places, week by week.</p>
              </div>
            </div>
            <LineChart labels={state.data.weekly.map((entry) => entry.date)} series={weeklySeries} />
          </div>

          <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-sky-700">Monthly</p>
                <h2 className="text-xl font-semibold">Verification trend</h2>
                <p className="text-sm text-gray-600">Aggregated monthly progress for owners and community.</p>
              </div>
            </div>
            <BarChart labels={state.data.monthly.map((entry) => entry.month)} series={monthlySeries} />
          </div>
        </section>
      )}
    </main>
  );
}
