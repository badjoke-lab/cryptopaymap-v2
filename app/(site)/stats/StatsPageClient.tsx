'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import VerificationDonut from '@/components/stats/VerificationDonut';
import LimitedModeNotice from '@/components/status/LimitedModeNotice';
import { safeFetch } from '@/lib/safeFetch';

type StatsResponse = {
  ok: true;
  total_places: number;
  total_count: number;
  countries: number;
  cities: number;
  categories: number;
  chains: Record<string, number>;
  breakdown: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
  };
  verification_breakdown: {
    owner: number;
    community: number;
    directory: number;
    unverified: number;
    verified: number;
  };
  top_chains: Array<{ key: string; count: number }>;
  top_assets: Array<{ key: string; count: number }>;
  category_ranking: Array<{ key: string; count: number }>;
  country_ranking: Array<{ key: string; count: number }>;
  city_ranking: Array<{ key: string; count: number }>;
  asset_acceptance_matrix: {
    assets: string[];
    chains: string[];
    rows: Array<{ asset: string; total: number; counts: Record<string, number> }>;
  };
  accepting_any_count: number;
  meta?: {
    source: 'db_live';
    population_id: 'places:map_population:v2';
    as_of: string;
    acceptance_chain_missing_places: number;
    acceptance_unknown_chain_included: boolean;
    accepts_with_chain_count: number;
    accepts_missing_chain_count: number;
    network_coverage: number;
  };
  generated_at?: string;
  limited?: boolean;
};

type TrendPoint = {
  date: string;
  total: number;
  delta: number;
  verified_total: number;
  verified_delta: number;
  accepting_any_total: number;
  accepting_any_delta: number;
};

type VerificationStackedPoint = {
  date: string;
  owner: number;
  community: number;
  directory: number;
  unverified: number;
};

type TrendRange = '24h' | '7d' | '30d' | 'all';

type TrendsResponse = {
  ok: true;
  range: TrendRange;
  grain: '1h' | '1d' | '1w';
  last_updated: string;
  points: TrendPoint[];
  stack: VerificationStackedPoint[];
  top5?: {
    kind: 'category' | 'asset' | 'country';
    keys: string[];
    points: Array<{ date: string; values: Record<string, number> }>;
  };
  meta?: {
    reason?: 'no_history_data' | 'db_unavailable' | 'internal_error';
    has_data?: boolean;
    grain?: '1h' | '1d' | '1w';
    last_updated?: string | null;
    requested?: {
      dim_type: string;
      dim_key: string;
      filters_summary: Record<string, string>;
    };
    used?: {
      dim_type: string;
      dim_key: string;
    };
    fallback?: {
      applied: boolean;
      reason: string;
      dropped_filters: string[];
      warnings?: string[];
    };
    legend?: {
      kind: 'category' | 'asset' | 'country';
      keys: string[];
      fallback_kind?: boolean;
    };
    fallback_kind?: boolean;
  };
};

type FetchStatus = 'idle' | 'loading' | 'success';


type StatsUnavailableResponse = {
  ok: false;
  error: 'stats_unavailable';
  reason: 'db_error';
  code?: 'db_connect_failed' | 'sql_error' | 'timeout' | 'unknown';
  message?: string;
  request_id?: string;
};

type StatsFilters = {
  country: string;
  city: string;
  category: string;
  accepted: string;
  verification: string;
  promoted: string;
  source: string;
};

type FilterMetaResponse = {
  countries: string[];
  categories: string[];
  cities: Record<string, string[]>;
  chains: string[];
};

type StatsState = {
  status: FetchStatus;
  notice?: string;
  snapshotErrorCode?: string;
  stats?: StatsResponse;
  trends?: TrendsResponse;
  statsUnavailable?: boolean;
  trendsUnavailable?: boolean;
  snapshotLoading?: boolean;
  trendsLoading?: boolean;
  trendsSource?: 'live' | 'zero-baseline' | 'cache';
  trendsCachedAt?: string;
  trendsMessage?: string;
};

type ChartSeries = {
  label: string;
  color: string;
  values: number[];
};

const MAX_AXIS_LABELS = 8;
const TOP5_SERIES_COLORS = ['#2563EB', '#0EA5E9', '#14B8A6', '#8B5CF6', '#F59E0B'];
const TREND_RANGE_OPTIONS: Array<{ value: TrendRange; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

const formatUtcMetaTime = (value: string | null | undefined) => {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
};

const formatChainLabel = (value: string) => value.trim().toLowerCase() === 'unknown' ? 'Unknown' : value;
const FILTER_KEYS: Array<keyof StatsFilters> = ['country', 'city', 'category', 'accepted', 'verification', 'promoted', 'source'];

const DEFAULT_FILTERS: StatsFilters = {
  country: '',
  city: '',
  category: '',
  accepted: '',
  verification: '',
  promoted: '',
  source: '',
};

const EMPTY_STATS: StatsResponse = {
  ok: true,
  total_places: 0,
  total_count: 0,
  countries: 0,
  cities: 0,
  categories: 0,
  chains: {},
  breakdown: {
    owner: 0,
    community: 0,
    directory: 0,
    unverified: 0,
  },
  verification_breakdown: {
    owner: 0,
    community: 0,
    directory: 0,
    unverified: 0,
    verified: 0,
  },
  top_chains: [],
  top_assets: [],
  category_ranking: [],
  country_ranking: [],
  city_ranking: [],
  asset_acceptance_matrix: {
    assets: [],
    chains: [],
    rows: [],
  },
  accepting_any_count: 0,
  limited: true,
};

const TRENDS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const getRangeConfig = (range: TrendRange) => {
  if (range === '24h') return { points: 24, grain: '1h' as const };
  if (range === '7d') return { points: 7, grain: '1d' as const };
  if (range === '30d') return { points: 30, grain: '1d' as const };
  return { points: 26, grain: '1w' as const };
};

const formatTrendLabel = (timestamp: number, grain: '1h' | '1d' | '1w') => {
  const date = new Date(timestamp);
  if (grain === '1h') {
    return `${String(date.getUTCHours()).padStart(2, '0')}:00`;
  }
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
};

const createZeroBaselineTrends = (range: TrendRange, overrides?: Partial<TrendsResponse>): TrendsResponse => {
  const config = getRangeConfig(range);
  const now = Date.now();
  const stepMs = config.grain === '1h' ? 60 * 60 * 1000 : config.grain === '1d' ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  const start = now - stepMs * (config.points - 1);

  const points: TrendPoint[] = Array.from({ length: config.points }, (_, index) => {
    const timestamp = start + index * stepMs;
    return {
      date: formatTrendLabel(timestamp, config.grain),
      total: 0,
      delta: 0,
      verified_total: 0,
      verified_delta: 0,
      accepting_any_total: 0,
      accepting_any_delta: 0,
    };
  });

  const stack: VerificationStackedPoint[] = points.map((point) => ({
    date: point.date,
    owner: 0,
    community: 0,
    directory: 0,
    unverified: 0,
  }));

  return {
    ok: true,
    range,
    grain: config.grain,
    last_updated: new Date().toISOString(),
    points,
    stack,
    meta: { reason: 'no_history_data', ...overrides?.meta },
    ...overrides,
  };
};

function HorizontalBarList({ title, rows, formatKey = (key: string) => key }: { title: string; rows: Array<{ key: string; count: number }>; formatKey?: (key: string) => string }) {
  const max = Math.max(...rows.map((row) => row.count), 1);

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">{title}</h3>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-700">
                <span className="font-medium">{formatKey(row.key)}</span>
                <span>{row.count.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded bg-gray-100">
                <div className="h-2 rounded bg-sky-500" style={{ width: `${(row.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-sm text-gray-600">
          No results. Try removing filters.
        </div>
      )}
    </div>
  );
}

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
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

        {activeIndex !== null ? (
          <line
            x1={xScale(activeIndex)}
            x2={xScale(activeIndex)}
            y1={padding}
            y2={height - padding}
            stroke="#94a3b8"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ) : null}

        {activeIndex !== null ? (
          <g>
            <rect x={padding + 6} y={padding + 4} width={width - padding * 2 - 12} height={48} rx={4} fill="#ffffff" stroke="#cbd5e1" />
            <text x={padding + 12} y={padding + 20} className="fill-gray-700 text-[10px] sm:text-xs">{labels[activeIndex]}</text>
            {series.map((item, idx) => (
              <text key={`${item.label}-${idx}`} x={padding + 12} y={padding + 32 + idx * 12} className="text-[10px] sm:text-xs" fill={item.color}>
                {item.label}: {(item.values[activeIndex] ?? 0).toLocaleString()}
              </text>
            ))}
          </g>
        ) : null}

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

        {labels.map((label, index) => {
          const x = xScale(index);
          const start = index === 0 ? padding : (xScale(index - 1) + x) / 2;
          const end = index === labels.length - 1 ? width - padding : (x + xScale(index + 1)) / 2;
          return (
            <rect
              key={`${label}-${index}-hit`}
              x={start}
              y={padding}
              width={Math.max(2, end - start)}
              height={height - padding * 2}
              fill="transparent"
              onMouseEnter={() => setActiveIndex(index)}
              onMouseMove={() => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}
              onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
              onTouchStart={() => setActiveIndex(index)}
            />
          );
        })}
      </svg>

      <Legend series={series} />
    </div>
  );
}

function StackedBarChart({ labels, points }: { labels: string[]; points: VerificationStackedPoint[] }) {
  const width = 520;
  const height = 260;
  const padding = 32;
  const labelStep = getLabelStep(labels);
  const maxValue = Math.max(...points.map((point) => point.owner + point.community + point.directory + point.unverified), 1);
  const yScale = (value: number) => height - padding - (value / maxValue) * (height - padding * 2);
  const xScale = (index: number) => padding + (index / Math.max(labels.length - 1, 1)) * (width - padding * 2);
  const barWidth = Math.max(4, (width - padding * 2) / Math.max(labels.length * 2.2, 3));

  const tickCount = 4;
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) => Math.round((maxValue / tickCount) * index));

  const colorMap = {
    owner: '#2563EB',
    community: '#0EA5E9',
    directory: '#14B8A6',
    unverified: '#94A3B8',
  } as const;

  const stackedLegend: ChartSeries[] = [
    { label: 'Owner verified', color: colorMap.owner, values: [] },
    { label: 'Community verified', color: colorMap.community, values: [] },
    { label: 'Directory listed', color: colorMap.directory, values: [] },
    { label: 'Unverified', color: colorMap.unverified, values: [] },
  ];

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

        {points.map((point, index) => {
          const x = xScale(index) - barWidth / 2;
          const slices: Array<{ key: keyof typeof colorMap; value: number }> = [
            { key: 'owner', value: point.owner },
            { key: 'community', value: point.community },
            { key: 'directory', value: point.directory },
            { key: 'unverified', value: point.unverified },
          ];

          let previousHeight = 0;
          return (
            <g key={point.date}>
              {slices.map((slice) => {
                const nextHeight = previousHeight + slice.value;
                const y = yScale(nextHeight);
                const sliceHeight = yScale(previousHeight) - y;
                previousHeight = nextHeight;
                if (sliceHeight <= 0) return null;
                return <rect key={slice.key} x={x} y={y} width={barWidth} height={sliceHeight} fill={colorMap[slice.key]} rx={1} />;
              })}
            </g>
          );
        })}

        {labels.map((label, index) => {
          if (index % labelStep !== 0) return null;
          const x = xScale(index);
          const y = height - padding + 16;
          return (
            <text key={label + index} x={x} y={y} className="fill-gray-500 text-[9px] sm:text-[10px]" textAnchor="middle">
              {label}
            </text>
          );
        })}
      </svg>

      <Legend series={stackedLegend} />
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

export default function StatsPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtersFromUrl = useMemo(() => {
    const fromUrl = { ...DEFAULT_FILTERS };
    for (const key of FILTER_KEYS) {
      fromUrl[key] = searchParams.get(key) ?? '';
    }
    return fromUrl;
  }, [searchParams]);

  const [filters, setFilters] = useState<StatsFilters>(filtersFromUrl);
  const [filterMeta, setFilterMeta] = useState<FilterMetaResponse | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRange>('7d');
  const [state, setState] = useState<StatsState>({ status: 'loading', snapshotLoading: true, trendsLoading: true });
  const stats = state.stats ?? EMPTY_STATS;
  const trends = state.trends ?? createZeroBaselineTrends(trendRange);

  const buildSnapshotQuery = useCallback((input: StatsFilters) => {
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = input[key].trim();
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }, []);

  const fetchSnapshot = useCallback(async (activeFilters: StatsFilters) => {
    setState((previous) => ({ ...previous, status: previous.stats ? 'success' : 'loading', snapshotLoading: true }));

    try {
      const response = await fetch(`/api/stats/snapshot${buildSnapshotQuery(activeFilters)}`);
      const payload = await response.json() as StatsResponse | StatsUnavailableResponse;

      if (!response.ok || payload.ok === false) {
        const snapshotErrorCode = payload.ok === false ? payload.code ?? 'unknown' : 'unknown';
        setState((previous) => ({
          ...previous,
          status: 'success',
          stats: previous.stats,
          statsUnavailable: true,
          snapshotLoading: false,
          snapshotErrorCode,
          notice: `Error loading snapshot (${snapshotErrorCode}). Showing last known values when available.`,
        }));
        return;
      }

      setState((previous) => ({
        ...previous,
        status: 'success',
        stats: payload,
        statsUnavailable: false,
        snapshotLoading: false,
        snapshotErrorCode: undefined,
        notice: undefined,
      }));
    } catch {
      setState((previous) => ({
        ...previous,
        status: 'success',
        stats: previous.stats,
        statsUnavailable: true,
        snapshotLoading: false,
        snapshotErrorCode: 'unknown',
        notice: 'Error loading snapshot (unknown). Showing last known values when available.',
      }));
    }
  }, [buildSnapshotQuery]);


  const getTrendsCacheKey = useCallback((range: TrendRange, input: StatsFilters) => {
    const normalized = FILTER_KEYS
      .map((key) => `${key}=${input[key].trim().toLowerCase()}`)
      .join('&');
    return `stats_trends::${range}::${normalized}`;
  }, []);

  const buildTrendsQuery = useCallback((range: TrendRange, input: StatsFilters) => {
    const params = new URLSearchParams();
    params.set('range', range);

    const normalized: Partial<Record<keyof StatsFilters, string>> = {};
    for (const key of FILTER_KEYS) {
      const value = input[key].trim();
      if (!value) continue;
      normalized[key] = value;
      params.set(key, value);
    }

    const asset = normalized.accepted;
    if (asset) {
      params.set('asset', asset);
    }

    return `?${params.toString()}`;
  }, []);

  const fetchTrends = useCallback(async (range: TrendRange, activeFilters: StatsFilters) => {
    setState((previous) => ({ ...previous, trendsLoading: true }));
    const cacheKey = getTrendsCacheKey(range, activeFilters);
    try {
      const response = await fetch(`/api/stats/trends${buildTrendsQuery(range, activeFilters)}`);
      const payload = await response.json() as TrendsResponse | StatsUnavailableResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error('trends_unavailable');
      }

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(cacheKey, JSON.stringify({ payload, savedAt: new Date().toISOString() }));
      }

      const hasData = payload.meta?.has_data !== false;
      setState((previous) => ({
        ...previous,
        status: previous.stats ? 'success' : previous.status,
        trends: hasData ? payload : createZeroBaselineTrends(range, { meta: payload.meta }),
        trendsUnavailable: false,
        trendsLoading: false,
        trendsSource: hasData ? 'live' : 'zero-baseline',
        trendsCachedAt: undefined,
        trendsMessage: hasData ? undefined : 'No saved trend data for this filter yet. Showing zero baseline.',
      }));
    } catch {
      const fallback = createZeroBaselineTrends(range);
      let cachedPayload: TrendsResponse | null = null;
      let cachedAt: string | undefined;
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(cacheKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { payload?: TrendsResponse; savedAt?: string };
            if (parsed.payload && parsed.savedAt) {
              const age = Date.now() - new Date(parsed.savedAt).getTime();
              if (Number.isFinite(age) && age >= 0 && age <= TRENDS_CACHE_TTL_MS) {
                cachedPayload = parsed.payload;
                cachedAt = parsed.savedAt;
              }
            }
          } catch {
            cachedPayload = null;
          }
        }
      }

      setState((previous) => ({
        ...previous,
        trends: cachedPayload ?? fallback,
        trendsUnavailable: true,
        trendsLoading: false,
        trendsSource: cachedPayload ? 'cache' : 'zero-baseline',
        trendsCachedAt: cachedAt,
        trendsMessage: cachedPayload
          ? 'Trends API temporarily unavailable. Showing cached trends.'
          : 'Trends data temporarily unavailable. Showing zero baseline.',
      }));
    }
  }, [buildTrendsQuery, getTrendsCacheKey]);

  const syncUrl = useCallback((next: StatsFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of FILTER_KEYS) {
      const value = next[key].trim();
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleFilterChange = useCallback((key: keyof StatsFilters, value: string) => {
    setFilters((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'country' && !value) {
        next.city = '';
      }
      syncUrl(next);
      return next;
    });
  }, [syncUrl]);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS);
  }, [syncUrl]);

  const fetchFilterMeta = useCallback(async () => {
    try {
      const meta = await safeFetch<FilterMetaResponse>('/api/filters/meta');
      setFilterMeta(meta);
    } catch {
      setFilterMeta(null);
    }
  }, []);

  useEffect(() => {
    setFilters(filtersFromUrl);
  }, [filtersFromUrl]);

  useEffect(() => {
    fetchFilterMeta();
  }, [fetchFilterMeta]);

  useEffect(() => {
    fetchTrends(trendRange, filters);
  }, [fetchTrends, filters, trendRange]);

  useEffect(() => {
    fetchSnapshot(filters);
  }, [fetchSnapshot, filters]);

  const fallbackTrends = useMemo(() => createZeroBaselineTrends(trendRange), [trendRange]);
  const trendPoints = Array.isArray(trends.points) && trends.points.length ? trends.points : fallbackTrends.points;
  const trendStackedPoints = Array.isArray(trends.stack) && trends.stack.length ? trends.stack : fallbackTrends.stack;
  const trendLabels = trendPoints.map((point) => point.date);
  const trendSeries: ChartSeries[] = [
    {
      label: 'Total published places',
      color: '#2563EB',
      values: trendPoints.map((point) => point.total),
    },
    {
      label: 'Verified places',
      color: '#0EA5E9',
      values: trendPoints.map((point) => point.verified_total),
    },
    {
      label: 'Accepting any crypto',
      color: '#14B8A6',
      values: trendPoints.map((point) => point.accepting_any_total),
    },
  ];
  const trendTop5Legend = trends.meta?.legend;
  const top5Points = Array.isArray(trends.top5?.points) ? trends.top5?.points : [];
  const top5Keys = trendTop5Legend?.keys?.length
    ? trendTop5Legend.keys
    : (Array.isArray(trends.top5?.keys) ? trends.top5.keys : []);
  const top5Kind = trendTop5Legend?.kind ?? trends.top5?.kind;
  const top5Title = top5Kind === 'asset'
    ? 'Top 5 Assets'
    : top5Kind === 'country'
      ? 'Top 5 Countries'
      : 'Top 5 Categories';
  const trendTop5Series: ChartSeries[] = top5Keys.map((key, index) => ({
    label: key,
    color: TOP5_SERIES_COLORS[index % TOP5_SERIES_COLORS.length],
    values: trendLabels.map((_, pointIndex) => {
      const point = top5Points[pointIndex];
      return Number(point?.values?.[key] ?? 0);
    }),
  }));

  const summaryCards = useMemo(
    () => [
      { label: 'Total places', value: stats.total_places, description: 'All published listings' },
      { label: 'Countries', value: stats.countries, description: 'Countries represented' },
      { label: 'Cities', value: stats.cities, description: 'Cities represented' },
      { label: 'Categories', value: stats.categories, description: 'Unique listing categories' },
    ],
    [stats],
  );

  const verificationEntries = useMemo(
    () => {
      const breakdown = stats.breakdown ?? stats.verification_breakdown;
      return [
        { label: 'Owner verified', value: Number(breakdown.owner ?? 0), color: '#2563EB' },
        { label: 'Community verified', value: Number(breakdown.community ?? 0), color: '#0EA5E9' },
        { label: 'Directory listed', value: Number(breakdown.directory ?? 0), color: '#14B8A6' },
        { label: 'Unverified', value: Number(breakdown.unverified ?? 0), color: '#94A3B8' },
      ];
    },
    [stats.breakdown, stats.verification_breakdown],
  );

  const chainEntries = useMemo(() => {
    const fromTopChains = stats.top_chains
      .map((entry) => ({ key: entry.key, count: Number(entry.count ?? 0) }))
      .filter((entry) => entry.key && entry.count >= 0);

    if (fromTopChains.length) {
      return fromTopChains.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    }

    return Object.entries(stats.chains)
      .map(([key, count]) => ({ key, count: Number(count ?? 0) }))
      .filter((entry) => entry.key && entry.count >= 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }, [stats.chains, stats.top_chains]);

  const assetEntries = useMemo(
    () => stats.top_assets
      .map((entry) => ({ key: entry.key, count: Number(entry.count ?? 0) }))
      .filter((entry) => entry.key && entry.count >= 0)
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    [stats.top_assets],
  );

  const rankingSections = useMemo(
    () => [
      { title: 'Category ranking table', rows: stats.category_ranking },
      { title: 'Countries ranking table', rows: stats.country_ranking },
      { title: 'Cities ranking table', rows: stats.city_ranking },
    ],
    [stats.category_ranking, stats.country_ranking, stats.city_ranking],
  );

  const matrixRows = useMemo(() => {
    const rows = stats.asset_acceptance_matrix.rows
      .map((row) => ({
        asset: row.asset,
        total: Number(row.total ?? 0),
        counts: Object.entries(row.counts ?? {}).reduce<Record<string, number>>((acc, [chain, count]) => {
          acc[chain] = Number(count ?? 0);
          return acc;
        }, {}),
      }))
      .filter((row) => row.asset && row.total >= 0);

    return rows.sort((a, b) => b.total - a.total || a.asset.localeCompare(b.asset));
  }, [stats.asset_acceptance_matrix.rows]);

  const matrixChains = useMemo(() => {
    if (stats.asset_acceptance_matrix.chains.length) {
      return [...stats.asset_acceptance_matrix.chains].sort((a, b) => a.localeCompare(b));
    }
    const chainSet = new Set<string>();
    for (const row of matrixRows) {
      for (const chain of Object.keys(row.counts)) {
        chainSet.add(chain);
      }
    }
    return Array.from(chainSet).sort((a, b) => a.localeCompare(b));
  }, [matrixRows, stats.asset_acceptance_matrix.chains]);

  const lastUpdated = stats.generated_at ? new Date(stats.generated_at).toLocaleString() : null;
  const acceptsWithChainCount = Number(stats.meta?.accepts_with_chain_count ?? 0);
  const acceptsMissingChainCount = Number(stats.meta?.accepts_missing_chain_count ?? 0);
  const networkCoverage = Number(stats.meta?.network_coverage ?? 0);
  const networkCoveragePercent = `${(Math.max(0, Math.min(1, networkCoverage)) * 100).toFixed(1)}%`;
  const showLimited = Boolean(stats.limited || state.notice);
  const cityOptions = filters.country ? filterMeta?.cities?.[filters.country] ?? [] : [];
  const isTrendDataUnavailableForFilters = trends.meta?.has_data === false;
  const trendFallback = trends.meta?.fallback;
  const trendUsed = trends.meta?.used;
  const trendCubeLabel = trendUsed ? `${trendUsed.dim_type}=${trendUsed.dim_key}` : 'all=all';
  const trendWarningMessage = state.trendsMessage
    ?? (isTrendDataUnavailableForFilters ? 'No saved trend data for this filter yet. Showing zero baseline.' : undefined);
  const top5FallbackKindMessage = trends.meta?.fallback_kind
    ? 'Showing category trends (requested breakdown not available yet).'
    : undefined;
  const snapshotNoResults = stats.total_places === 0;

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

  return (
    <main className="flex min-h-screen flex-col bg-gray-50 px-4 py-8 text-gray-900 sm:px-6 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-wide text-sky-700">Stats</p>
          <h1 className="text-3xl font-semibold leading-tight">Marketplace snapshot</h1>
          <p className="text-sm leading-relaxed text-gray-600 sm:text-base">
            Live counts for places, coverage, and growth momentum from moderation history.
          </p>
          {lastUpdated ? <p className="text-xs text-gray-500">Last updated {lastUpdated}</p> : null}
        </header>

        {showLimited ? (
          <LimitedModeNotice
            className="px-4 py-3 text-sm"
            actions={
              state.notice ? (
                <button
                  type="button"
                  onClick={() => {
                    fetchSnapshot(filters);
                    fetchTrends(trendRange, filters);
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Retry
                </button>
              ) : null
            }
          />
        ) : null}

        <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Filters</p>
            <button
              type="button"
              onClick={() => setFiltersOpen((previous) => !previous)}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 sm:hidden"
            >
              ⚙ {filtersOpen ? 'Close' : 'Open'}
            </button>
          </div>

          <div className={`${filtersOpen ? 'mt-4 grid' : 'hidden'} gap-3 sm:mt-4 sm:grid sm:grid-cols-2 lg:grid-cols-4`}>
            <select value={filters.country} onChange={(event) => handleFilterChange('country', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All countries</option>
              {(filterMeta?.countries ?? []).map((country) => <option key={country} value={country}>{country}</option>)}
            </select>
            <select value={filters.city} onChange={(event) => handleFilterChange('city', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" disabled={!filters.country}>
              <option value="">All cities</option>
              {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
            <select value={filters.category} onChange={(event) => handleFilterChange('category', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All categories</option>
              {(filterMeta?.categories ?? []).map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select value={filters.accepted} onChange={(event) => handleFilterChange('accepted', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All assets/chains</option>
              {(filterMeta?.chains ?? []).map((chain) => <option key={chain} value={chain}>{formatChainLabel(chain)}</option>)}
            </select>
            <select value={filters.verification} onChange={(event) => handleFilterChange('verification', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All verification</option>
              <option value="owner">Owner Verified</option>
              <option value="community">Community Verified</option>
              <option value="directory">Directory Listed</option>
              <option value="unverified">Unverified</option>
            </select>
            <select value={filters.promoted} onChange={(event) => handleFilterChange('promoted', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Promoted + not promoted</option>
              <option value="true">Promoted only</option>
              <option value="false">Not promoted</option>
            </select>
            <select value={filters.source} onChange={(event) => handleFilterChange('source', event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">All sources</option>
              <option value="owner">Owner submission</option>
              <option value="community">Community submission</option>
              <option value="directory">Directory import</option>
            </select>
            <button type="button" onClick={resetFilters} className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Reset</button>
          </div>
        </section>

        {state.statsUnavailable ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">
            Error loading snapshot{state.snapshotErrorCode ? ` (${state.snapshotErrorCode})` : ""}. Showing last known values when available.
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="flex flex-col rounded-md bg-white px-4 py-3 shadow-sm ring-1 ring-gray-200 sm:px-5 sm:py-4"
            >
              <span className="text-sm font-medium text-gray-600">{card.label}</span>
              <span className="mt-1 text-2xl font-semibold text-gray-900 sm:text-[26px]">
                {card.value.toLocaleString()}
              </span>
              <span className="text-xs text-gray-500">{card.description}</span>
            </div>
          ))}
        </section>

        <SectionCard
          eyebrow="Trends"
          title="Growth trends"
          description="Cumulative totals based on moderation history (approve/promote actions)."
        >
          <div className="mb-4 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600">
            Last updated: {formatUtcMetaTime(trends.meta?.last_updated ?? trends.last_updated)} · Range: {trends.range} · Grain: {trends.meta?.grain ?? trends.grain} · Cube: {trendCubeLabel}
          </div>
          {trendFallback?.applied ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Requested filters not available in saved cube yet. Showing nearest trend: {trendCubeLabel}.
              {trendFallback.dropped_filters.length ? ` Dropped filters: ${trendFallback.dropped_filters.join(', ')}.` : ''}
            </div>
          ) : null}
          {state.trendsLoading ? (
            <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
              Loading trends…
            </div>
          ) : null}
          {trendWarningMessage ? (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {trendWarningMessage}
              {trends.meta?.last_updated ? ` Last successful cube update: ${formatUtcMetaTime(trends.meta?.last_updated)}.` : ''}
            </div>
          ) : null}
          {state.trendsSource === 'cache' && state.trendsCachedAt ? (
            <div className="mb-4 text-xs text-gray-600">
              Showing cached trends from {formatUtcMetaTime(state.trendsCachedAt)}.
            </div>
          ) : null}
          {top5FallbackKindMessage ? (
            <div className="mb-4 text-xs text-amber-800">
              {top5FallbackKindMessage}
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TREND_RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTrendRange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${trendRange === option.value
                    ? 'bg-sky-600 text-white'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <LineChart labels={trendLabels} series={trendSeries} />
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs font-medium text-gray-600">
              Verification stack (owner/community/directory/unverified)
            </div>
            <StackedBarChart labels={trendLabels} points={trendStackedPoints} />
            <div className="rounded-md border border-gray-200 bg-white p-3 text-xs font-medium text-gray-600">
              {top5Title} trends (legend fixed by range-total ranking)
            </div>
            <LineChart labels={trendLabels} series={trendTop5Series} />
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Snapshot"
          title="Verification Breakdown"
          description="Donut view of owner/community/directory/unverified counts for the current filter set."
        >
          {state.snapshotLoading ? (
            <div className="mb-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">Loading snapshot…</div>
          ) : null}
          {snapshotNoResults ? (
            <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">No results for this filter set. Try removing filters.</div>
          ) : null}
          <VerificationDonut items={verificationEntries} />
        </SectionCard>

        <SectionCard
          eyebrow="Snapshot"
          title="Chains / Assets"
          description="Top accepted chains and assets from accepts rows with a specified network."
        >
          <div className="mb-3 grid gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>Accepting any (places): <span className="font-semibold text-gray-900">{stats.accepting_any_count.toLocaleString()}</span></div>
            <div>Network specified (accepts): <span className="font-semibold text-gray-900">{acceptsWithChainCount.toLocaleString()}</span></div>
            <div>Network missing (accepts): <span className="font-semibold text-gray-900">{acceptsMissingChainCount.toLocaleString()}</span></div>
            <div>Network coverage: <span className="font-semibold text-gray-900">{networkCoveragePercent}</span></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <HorizontalBarList
              title={`Top chains (Network-specified accepts only: ${acceptsWithChainCount.toLocaleString()})`}
              rows={chainEntries.slice(0, 10)}
              formatKey={formatChainLabel}
            />
            <HorizontalBarList title="Top assets" rows={assetEntries.slice(0, 10)} />
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Snapshot"
          title="Rankings"
          description="Category, country, and city rankings ordered by count (descending)."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {rankingSections.map((section) => {
              const rows = [...section.rows]
                .map((row) => ({ key: row.key, count: Number(row.count ?? 0) }))
                .filter((row) => row.key && row.count >= 0)
                .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

              return (
                <div key={section.title} className="overflow-hidden rounded-md border border-gray-200">
                  <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800">
                    {section.title}
                  </div>
                  {rows.length ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                          <tr>
                            <th className="px-4 py-2 text-left">Name</th>
                            <th className="px-4 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {rows.map((row) => (
                            <tr key={row.key} className="bg-white">
                              <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{row.key}</td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-gray-800">{row.count.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-600">No results. Try removing filters.</div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="Snapshot"
          title="Asset Acceptance Matrix"
          description={`Network-specified accepts: ${acceptsWithChainCount.toLocaleString()} (coverage ${networkCoveragePercent}; ${acceptsMissingChainCount.toLocaleString()} missing network)`}
        >
          {matrixRows.length && matrixChains.length ? (
            <div className="overflow-hidden rounded-md border border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                    <tr>
                      <th className="px-4 py-2 text-left">Asset</th>
                      {matrixChains.map((chain) => (
                        <th key={chain} className="px-4 py-2 text-right">{formatChainLabel(chain)}</th>
                      ))}
                      <th className="px-4 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {matrixRows.map((row) => (
                      <tr key={row.asset} className="bg-white">
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">{row.asset}</td>
                        {matrixChains.map((chain) => (
                          <td key={`${row.asset}-${chain}`} className="whitespace-nowrap px-4 py-2 text-right text-gray-800">
                            {(row.counts[chain] ?? 0).toLocaleString()}
                          </td>
                        ))}
                        <td className="whitespace-nowrap px-4 py-2 text-right font-semibold text-gray-900">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              No results. Try removing filters.
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
