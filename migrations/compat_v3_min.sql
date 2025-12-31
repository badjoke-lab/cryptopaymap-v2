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

-- Submissions table for owner/community intake
CREATE TABLE IF NOT EXISTS public.submissions (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL,
  kind TEXT NOT NULL,
  suggested_place_id TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  category TEXT NOT NULL,
  accepted_chains TEXT[] NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  role TEXT,
  about TEXT,
  payment_note TEXT,
  website TEXT,
  twitter TEXT,
  instagram TEXT,
  facebook TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  amenities TEXT[],
  notes_for_admin TEXT,
  terms_accepted BOOLEAN,
  payload JSONB NOT NULL
);
