-- Internal review metadata for submissions
ALTER TABLE IF EXISTS public.submissions
  ADD COLUMN IF NOT EXISTS published_place_id TEXT;

ALTER TABLE IF EXISTS public.submissions
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.submissions
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.submissions
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;
