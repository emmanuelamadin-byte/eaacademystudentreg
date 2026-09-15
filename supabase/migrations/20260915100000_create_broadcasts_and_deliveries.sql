-- Migration: 20260915100000_create_broadcasts_and_deliveries.sql
-- Description: Creates the broadcasts and message_deliveries tables in the public schema with RLS for admin-only access.

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title text NOT NULL,
  message text NOT NULL,
  audience text NOT NULL,
  track_id text,
  channels text[] NOT NULL,
  action_path text,
  whatsapp_template text,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  in_app_sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON public.broadcasts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON public.broadcasts (status);

CREATE TABLE IF NOT EXISTS public.message_deliveries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  broadcast_id text REFERENCES public.broadcasts(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  kind text NOT NULL DEFAULT 'broadcast',
  channel text NOT NULL,
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  template_name text,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  last_error text,
  provider_message_id text,
  idempotency_key text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_deliveries_queue ON public.message_deliveries (status, scheduled_for, attempts);
CREATE INDEX IF NOT EXISTS idx_message_deliveries_broadcast_id ON public.message_deliveries (broadcast_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_deliveries ENABLE ROW LEVEL SECURITY;

-- Admins can view and manage broadcasts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'broadcasts' AND policyname = 'Admins can manage broadcasts'
  ) THEN
    CREATE POLICY "Admins can manage broadcasts" ON public.broadcasts
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'message_deliveries' AND policyname = 'Admins can manage message_deliveries'
  ) THEN
    CREATE POLICY "Admins can manage message_deliveries" ON public.message_deliveries
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid() AND profiles.role = 'Admin'
        )
      );
  END IF;
END $$;
