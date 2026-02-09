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

-- =========================================================
-- compat_v4_patch: promote/schema drift hotfix (2026-02-09)
-- =========================================================

-- 1) submissions: promote が参照する列（無ければ追加）
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS about TEXT;

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS accepted_chains JSONB;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS owner_verification TEXT;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS community_evidence_urls JSONB;

ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- 2) submissions backfill（NULL/空だけ埋める）
UPDATE public.submissions
SET
  name     = COALESCE(NULLIF(name,''),     payload->>'name'),
  country  = COALESCE(NULLIF(country,''),  payload->>'country'),
  city     = COALESCE(NULLIF(city,''),     payload->>'city'),
  address  = COALESCE(NULLIF(address,''),  payload->>'address'),
  category = COALESCE(NULLIF(category,''), payload->>'category'),
  about    = COALESCE(NULLIF(about,''),    payload->>'about'),
  accepted_chains = COALESCE(
    accepted_chains,
    payload->'acceptedChains',
    payload->'accepted_chains'
  ),
  payment_url = COALESCE(NULLIF(payment_url,''), payload->>'paymentUrl', payload->>'payment_url'),
  contact_email = COALESCE(NULLIF(contact_email,''), payload->>'contactEmail', payload->>'contact_email'),
  contact_name  = COALESCE(NULLIF(contact_name,''),  payload->>'contactName',  payload->>'contact_name'),
  owner_verification = COALESCE(NULLIF(owner_verification,''), payload->>'ownerVerification', payload->>'owner_verification'),
  community_evidence_urls = COALESCE(
    community_evidence_urls,
    payload->'communityEvidenceUrls',
    payload->'community_evidence_urls'
  ),
  lat = COALESCE(
    lat,
    CASE
      WHEN (payload->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (payload->>'lat')::double precision
      WHEN (payload->>'latitude') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (payload->>'latitude')::double precision
      ELSE NULL
    END
  ),
  lng = COALESCE(
    lng,
    CASE
      WHEN (payload->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (payload->>'lng')::double precision
      WHEN (payload->>'lon') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (payload->>'lon')::double precision
      WHEN (payload->>'longitude') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (payload->>'longitude')::double precision
      ELSE NULL
    END
  );

-- 3) verifications: ON CONFLICT(place_id) を成立させる UNIQUE（存在すれば作る）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='verifications'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='verifications' AND column_name='place_id'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS verifications_place_id_uq ON public.verifications(place_id)';
    END IF;
  END IF;
END$$;

-- 4) payment_accepts: promote の ON CONFLICT(place_id,asset,chain) を成立させる UNIQUE（念のため）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='payment_accepts'
  ) THEN
    -- method列は現DBに無いが、将来増えても壊れないよう分岐
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='payment_accepts' AND column_name='method'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS payment_accepts_uq_v4 ON public.payment_accepts(place_id, asset, chain, method)';
    ELSE
      EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS payment_accepts_uq_v4 ON public.payment_accepts(place_id, asset, chain)';
    END IF;
  END IF;
END$$;

