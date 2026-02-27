-- Stats v4.1: pre-aggregated timeseries cube storage (PR-01: table only)

CREATE TABLE IF NOT EXISTS public.stats_timeseries (
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  grain TEXT NOT NULL CHECK (grain IN ('1h', '1d', '1w')),
  dim_type TEXT NOT NULL,
  dim_key TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  verified_count INTEGER NOT NULL,
  accepting_any_count INTEGER NOT NULL,
  breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_start, grain, dim_type, dim_key)
);

CREATE INDEX IF NOT EXISTS stats_timeseries_dim_period_idx
  ON public.stats_timeseries (grain, dim_type, dim_key, period_start DESC);

CREATE INDEX IF NOT EXISTS stats_timeseries_period_idx
  ON public.stats_timeseries (period_start DESC);
