-- Migration: 20260923180000_create_video_ads_schema.sql
-- Description: Creates the video_ads table for skippable video ads and sponsorships in EA Academy.

CREATE TABLE IF NOT EXISTS public.video_ads (
  id text PRIMARY KEY,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  media_type text NOT NULL CHECK (media_type IN ('video', 'banner')),
  media_url text NOT NULL,
  cta_text text NOT NULL DEFAULT 'Learn More',
  destination_url text NOT NULL DEFAULT '/app/billing',
  active boolean NOT NULL DEFAULT true,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  target_tracks text[] NOT NULL DEFAULT '{}'::text[],
  skip_duration_seconds integer NOT NULL DEFAULT 5,
  impressions_count integer NOT NULL DEFAULT 0,
  clicks_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_ads_active ON public.video_ads(active);

-- Enable Row Level Security (RLS)
ALTER TABLE public.video_ads ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Allow anyone (anon + authenticated) to view active ads for playback
DROP POLICY IF EXISTS video_ads_public_read ON public.video_ads;
CREATE POLICY video_ads_public_read ON public.video_ads
  FOR SELECT TO anon, authenticated
  USING (active = true OR (SELECT private.is_admin()));

-- 2. Admin Write Policies
DROP POLICY IF EXISTS video_ads_admin_insert ON public.video_ads;
CREATE POLICY video_ads_admin_insert ON public.video_ads
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS video_ads_admin_update ON public.video_ads;
CREATE POLICY video_ads_admin_update ON public.video_ads
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS video_ads_admin_delete ON public.video_ads;
CREATE POLICY video_ads_admin_delete ON public.video_ads
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

-- 3. Grants
GRANT SELECT ON TABLE public.video_ads TO anon, authenticated;
GRANT ALL ON TABLE public.video_ads TO service_role;
