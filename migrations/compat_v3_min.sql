-- Minimal compatibility migration for v3 schema expectations

CREATE TABLE IF NOT EXISTS public.categories (
  id TEXT PRIMARY KEY,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure places.lat/lng exist
ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;

ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Backfill lat/lng from geom when missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'places'
  ) THEN
    UPDATE public.places
    SET lat = ST_Y(geom::geometry)
    WHERE lat IS NULL AND geom IS NOT NULL;

    UPDATE public.places
    SET lng = ST_X(geom::geometry)
    WHERE lng IS NULL AND geom IS NOT NULL;
  END IF;
END$$;

-- Indexes for bbox queries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'places'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS places_lat_lng_idx ON public.places (lat, lng)';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'places'
      AND column_name = 'geom'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS places_geom_gix ON public.places USING GIST (geom)';
  END IF;
END$$;

-- Ensure verification timestamps exist
ALTER TABLE IF EXISTS public.verifications
  ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.verifications
  ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ;

-- Optionally backfill last_checked/last_verified using updated_at when present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'verifications'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verifications'
      AND column_name = 'updated_at'
  ) THEN
    UPDATE public.verifications
    SET last_checked = updated_at
    WHERE last_checked IS NULL;

    UPDATE public.verifications
    SET last_verified = updated_at
    WHERE last_verified IS NULL;
  END IF;
END$$;
