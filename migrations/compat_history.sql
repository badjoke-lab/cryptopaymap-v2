-- Audit/history log for moderation actions
CREATE TABLE IF NOT EXISTS public.history (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  submission_id TEXT NOT NULL,
  place_id TEXT,
  meta JSONB
);

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS meta JSONB,
  ADD COLUMN IF NOT EXISTS place_id TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'history'
      AND column_name = 'action_type'
  ) THEN
    UPDATE public.history
    SET action = COALESCE(action, action_type)
    WHERE action IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS history_submission_id_idx
  ON public.history (submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS history_place_id_idx
  ON public.history (place_id, created_at DESC);
