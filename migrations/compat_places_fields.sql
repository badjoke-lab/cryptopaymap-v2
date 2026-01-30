-- Ensure places can store promoted submission metadata
ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS payment_note TEXT;

ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS amenities TEXT[];

ALTER TABLE IF EXISTS public.places
  ADD COLUMN IF NOT EXISTS submitter_name TEXT;
