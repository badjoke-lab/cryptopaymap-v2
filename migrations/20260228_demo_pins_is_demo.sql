-- PR-XX: flag Antarctica demo pins so they can remain on map while excluded from Stats/Discover aggregates.

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

UPDATE public.places
SET is_demo = true
WHERE id IN (
  'antarctica-community-1',
  'antarctica-directory-1',
  'antarctica-owner-1',
  'antarctica-unverified-1'
);
