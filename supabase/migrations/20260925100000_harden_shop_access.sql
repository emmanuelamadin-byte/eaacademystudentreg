-- Keep paid course contents and download locations behind the academy API.
-- Row-level security cannot hide individual columns from a SELECT * request.
REVOKE SELECT ON TABLE public.shop_items FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, slug, type, title, subtitle, description, price, compare_at_price,
  category, tags, badge, thumbnail_url, preview_video_url,
  what_you_will_learn, requirements, target_audience, published, featured,
  sales_count, level, total_duration, certificate_enabled,
  included_in_premium, file_size, file_format, version, includes,
  created_at, updated_at
) ON TABLE public.shop_items TO anon, authenticated;

-- Certificate records contain student identity and should only be read by
-- their owner or an administrator. Any future public verification should use
-- a narrowly scoped server route rather than exposing this table.
REVOKE SELECT ON TABLE public.shop_certificates FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS shop_certificates_read ON public.shop_certificates;
CREATE POLICY shop_certificates_read ON public.shop_certificates
  FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT private.is_admin()));
GRANT SELECT ON TABLE public.shop_certificates TO authenticated;

-- Progress (including serialized quiz scores) is authoritative server state.
-- The service role used by the academy API retains its existing ALL grant.
REVOKE INSERT, UPDATE ON TABLE public.shop_course_progress FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS shop_course_progress_student_insert ON public.shop_course_progress;
DROP POLICY IF EXISTS shop_course_progress_student_update ON public.shop_course_progress;
