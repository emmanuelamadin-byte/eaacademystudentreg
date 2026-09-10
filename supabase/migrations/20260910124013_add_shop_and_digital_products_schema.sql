-- Supabase Migration: Add Shop and Digital Products Schema
-- Project: ea academy student reg website (cyzpgofxanjfxmdqvned)

-- 1. Update constraints on billing_intents and payments to allow 'shop_item'
ALTER TABLE public.billing_intents
  DROP CONSTRAINT IF EXISTS billing_intents_kind_check;

ALTER TABLE public.billing_intents
  ADD CONSTRAINT billing_intents_kind_check
  CHECK (kind = ANY (ARRAY['premium'::text, 'donation'::text, 'shop_item'::text]));

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_kind_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind = ANY (ARRAY['premium'::text, 'donation'::text, 'shop_item'::text]));

-- 2. Add shop metadata columns to billing_intents
ALTER TABLE public.billing_intents
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS item_title text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS item_slug text;

-- 3. Create shop_items table
CREATE TABLE IF NOT EXISTS public.shop_items (
  id text PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  type text NOT NULL CHECK (type IN ('course', 'digital_product')),
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  price numeric NOT NULL CHECK (price >= 0),
  compare_at_price numeric,
  category text NOT NULL DEFAULT 'General',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  badge text,
  thumbnail_url text NOT NULL DEFAULT '',
  preview_video_url text DEFAULT '',
  what_you_will_learn text[] NOT NULL DEFAULT '{}'::text[],
  requirements text[] NOT NULL DEFAULT '{}'::text[],
  target_audience text[] NOT NULL DEFAULT '{}'::text[],
  published boolean NOT NULL DEFAULT false,
  featured boolean NOT NULL DEFAULT false,
  sales_count integer NOT NULL DEFAULT 0,
  level text DEFAULT 'All Levels',
  total_duration text DEFAULT '',
  certificate_enabled boolean NOT NULL DEFAULT true,
  curriculum jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_url text DEFAULT '',
  file_size text DEFAULT '',
  file_format text DEFAULT '',
  version text DEFAULT '',
  includes text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_items_slug_idx ON public.shop_items(slug);
CREATE INDEX IF NOT EXISTS shop_items_published_idx ON public.shop_items(published);
CREATE INDEX IF NOT EXISTS shop_items_type_idx ON public.shop_items(type);
CREATE INDEX IF NOT EXISTS shop_items_category_idx ON public.shop_items(category);

-- 4. Create shop_purchases table
CREATE TABLE IF NOT EXISTS public.shop_purchases (
  id text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_email text NOT NULL,
  student_name text NOT NULL,
  item_id text NOT NULL REFERENCES public.shop_items(id) ON DELETE RESTRICT,
  item_slug text NOT NULL DEFAULT '',
  item_title text NOT NULL DEFAULT '',
  item_type text NOT NULL CHECK (item_type IN ('course', 'digital_product')),
  amount numeric NOT NULL CHECK (amount >= 0),
  payment_reference text NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_purchases_student_item_key UNIQUE (student_id, item_id)
);

CREATE INDEX IF NOT EXISTS shop_purchases_student_id_idx ON public.shop_purchases(student_id);
CREATE INDEX IF NOT EXISTS shop_purchases_item_id_idx ON public.shop_purchases(item_id);
CREATE INDEX IF NOT EXISTS shop_purchases_payment_ref_idx ON public.shop_purchases(payment_reference);

-- 5. Create shop_course_progress table
CREATE TABLE IF NOT EXISTS public.shop_course_progress (
  id text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id text NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  completed_lesson_ids text[] NOT NULL DEFAULT '{}'::text[],
  last_lesson_id text,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  certificate_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shop_course_progress_student_course_key UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS shop_course_progress_student_id_idx ON public.shop_course_progress(student_id);
CREATE INDEX IF NOT EXISTS shop_course_progress_course_id_idx ON public.shop_course_progress(course_id);

-- 6. Create shop_certificates table
CREATE TABLE IF NOT EXISTS public.shop_certificates (
  id text PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  course_id text NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  course_title text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  verification_code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shop_certificates_student_id_idx ON public.shop_certificates(student_id);
CREATE INDEX IF NOT EXISTS shop_certificates_course_id_idx ON public.shop_certificates(course_id);
CREATE INDEX IF NOT EXISTS shop_certificates_verification_code_idx ON public.shop_certificates(verification_code);

-- 7. Enable RLS
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_certificates ENABLE ROW LEVEL SECURITY;

-- 8. Policies
-- shop_items
DROP POLICY IF EXISTS shop_items_public_read ON public.shop_items;
CREATE POLICY shop_items_public_read ON public.shop_items
  FOR SELECT TO anon, authenticated
  USING (published = true OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS shop_items_admin_insert ON public.shop_items;
CREATE POLICY shop_items_admin_insert ON public.shop_items
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS shop_items_admin_update ON public.shop_items;
CREATE POLICY shop_items_admin_update ON public.shop_items
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_admin()))
  WITH CHECK ((SELECT private.is_admin()));

DROP POLICY IF EXISTS shop_items_admin_delete ON public.shop_items;
CREATE POLICY shop_items_admin_delete ON public.shop_items
  FOR DELETE TO authenticated
  USING ((SELECT private.is_admin()));

-- shop_purchases
DROP POLICY IF EXISTS shop_purchases_student_read ON public.shop_purchases;
CREATE POLICY shop_purchases_student_read ON public.shop_purchases
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- shop_course_progress
DROP POLICY IF EXISTS shop_course_progress_student_read ON public.shop_course_progress;
CREATE POLICY shop_course_progress_student_read ON public.shop_course_progress
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS shop_course_progress_student_insert ON public.shop_course_progress;
CREATE POLICY shop_course_progress_student_insert ON public.shop_course_progress
  FOR INSERT TO authenticated
  WITH CHECK (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

DROP POLICY IF EXISTS shop_course_progress_student_update ON public.shop_course_progress;
CREATE POLICY shop_course_progress_student_update ON public.shop_course_progress
  FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()))
  WITH CHECK (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));

-- shop_certificates
DROP POLICY IF EXISTS shop_certificates_read ON public.shop_certificates;
CREATE POLICY shop_certificates_read ON public.shop_certificates
  FOR SELECT TO anon, authenticated
  USING (true);

-- 9. Grants
GRANT SELECT ON TABLE public.shop_items TO anon, authenticated;
GRANT ALL ON TABLE public.shop_items TO service_role;

GRANT SELECT ON TABLE public.shop_purchases TO authenticated;
GRANT ALL ON TABLE public.shop_purchases TO service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.shop_course_progress TO authenticated;
GRANT ALL ON TABLE public.shop_course_progress TO service_role;

GRANT SELECT ON TABLE public.shop_certificates TO anon, authenticated;
GRANT ALL ON TABLE public.shop_certificates TO service_role;
