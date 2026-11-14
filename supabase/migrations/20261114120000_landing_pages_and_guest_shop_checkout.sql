-- Apply before enabling NEXT_PUBLIC_PURCHASE_FIRST_ENABLED / LANDING_PAGES_ENABLED.
BEGIN;

ALTER TABLE public.profiles ALTER COLUMN primary_track DROP NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS enrollment_status text NOT NULL DEFAULT 'enrolled'
  CHECK (enrollment_status IN ('enrolled', 'purchase_only'));
ALTER TABLE public.billing_intents ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE public.billing_intents ADD CONSTRAINT billing_intents_guest_shop_only
  CHECK (student_id IS NOT NULL OR kind = 'shop_item');
ALTER TABLE public.payments ADD CONSTRAINT payments_guest_shop_only
  CHECK (student_id IS NOT NULL OR kind = 'shop_item');

CREATE TABLE public.shop_landing_pages (
  id text PRIMARY KEY,
  item_id text NOT NULL REFERENCES public.shop_items(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  draft jsonb NOT NULL,
  published jsonb,
  published_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shop_landing_pages_item_idx ON public.shop_landing_pages(item_id);
ALTER TABLE public.shop_landing_pages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_landing_pages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_landing_pages TO service_role;

ALTER TABLE public.billing_intents
  ADD COLUMN IF NOT EXISTS guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS campaign_id text REFERENCES public.shop_landing_pages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visit_id uuid,
  ADD COLUMN IF NOT EXISTS utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS initialized_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.billing_intents ADD CONSTRAINT billing_intents_shop_item_fk
  FOREIGN KEY (item_id) REFERENCES public.shop_items(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS item_id text,
  ADD COLUMN IF NOT EXISTS item_title text,
  ADD COLUMN IF NOT EXISTS item_type text,
  ADD COLUMN IF NOT EXISTS buyer_name text,
  ADD COLUMN IF NOT EXISTS buyer_email text;
CREATE INDEX billing_intents_unclaimed_idx ON public.billing_intents(lower(email))
  WHERE kind = 'shop_item' AND status = 'success' AND claimed_at IS NULL;
CREATE INDEX billing_intents_campaign_idx ON public.billing_intents(campaign_id);

CREATE TABLE public.shop_campaign_events (
  campaign_id text NOT NULL REFERENCES public.shop_landing_pages(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('visit', 'click')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, visit_id, event)
);
ALTER TABLE public.shop_campaign_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_campaign_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_campaign_events TO service_role;

-- Anonymous endpoints use durable, fail-closed limits, independent of profiles.
CREATE TABLE public.shop_request_limits (
  key text NOT NULL,
  bucket timestamptz NOT NULL,
  requests integer NOT NULL,
  PRIMARY KEY (key, bucket)
);
ALTER TABLE public.shop_request_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX shop_request_limits_bucket_idx ON public.shop_request_limits(bucket);
REVOKE ALL ON public.shop_request_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_request_limits TO service_role;
CREATE FUNCTION public.consume_shop_request_limit(p_key text, p_maximum integer, p_seconds integer DEFAULT 60)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE count_now integer; window_start timestamptz;
BEGIN
  window_start := to_timestamp(floor(extract(epoch FROM now()) / p_seconds) * p_seconds);
  INSERT INTO public.shop_request_limits(key, bucket, requests) VALUES(p_key, window_start, 1)
  ON CONFLICT (key, bucket) DO UPDATE SET requests = shop_request_limits.requests + 1
  RETURNING requests INTO count_now;
  DELETE FROM public.shop_request_limits WHERE bucket < now() - interval '1 day';
  RETURN count_now <= p_maximum;
END;
$$;

CREATE TABLE public.shop_receipt_outbox (
  reference text PRIMARY KEY REFERENCES public.billing_intents(reference) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  processing_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  sent_at timestamptz
);
ALTER TABLE public.shop_receipt_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shop_receipt_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shop_receipt_outbox TO service_role;

-- Only the server (after verifying Google identity) can call this function.
-- Lock the intent and insert the payment, sale count, entitlement and receipt
-- job in ONE database transaction, including legacy signed-in shop checkouts.
CREATE FUNCTION public.fulfill_shop_payment(
  p_reference text, p_email text, p_amount bigint, p_currency text, p_paid_at timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE intent public.billing_intents%ROWTYPE; inserted_reference text;
BEGIN
  SELECT * INTO intent FROM public.billing_intents WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND OR intent.kind <> 'shop_item' THEN RAISE EXCEPTION 'Unknown shop payment'; END IF;
  IF lower(trim(intent.email)) <> lower(trim(p_email)) OR intent.amount_kobo <> p_amount OR p_currency <> 'NGN'
    THEN RAISE EXCEPTION 'Payment details do not match'; END IF;
  IF p_paid_at IS NULL THEN RAISE EXCEPTION 'Missing payment date'; END IF;
  INSERT INTO public.payments(reference, student_id, amount, kind, status, paid_at, created_at,
    item_id, item_title, item_type, buyer_name, buyer_email)
  VALUES(p_reference, intent.student_id, p_amount / 100.0, 'shop_item', 'success', p_paid_at, p_paid_at,
    intent.item_id, intent.item_title, intent.item_type, coalesce(intent.buyer_name, intent.donor_name), intent.email)
  ON CONFLICT (reference) DO NOTHING RETURNING reference INTO inserted_reference;
  IF inserted_reference IS NOT NULL THEN
    UPDATE public.shop_items SET sales_count = coalesce(sales_count, 0) + 1 WHERE id = intent.item_id;
    INSERT INTO public.shop_receipt_outbox(reference) VALUES(p_reference) ON CONFLICT DO NOTHING;
  END IF;
  IF intent.student_id IS NOT NULL THEN
    INSERT INTO public.shop_purchases(id, student_id, student_email, student_name, item_id,
      item_slug, item_title, item_type, amount, payment_reference, purchased_at, created_at)
    VALUES(intent.student_id::text || '_' || intent.item_id, intent.student_id, intent.email,
      coalesce(intent.buyer_name, intent.donor_name, 'Student'), intent.item_id,
      coalesce(intent.item_slug, ''), coalesce(intent.item_title, 'Store item'),
      coalesce(intent.item_type, 'course'), p_amount / 100.0, p_reference, p_paid_at, p_paid_at)
    ON CONFLICT (student_id, item_id) DO NOTHING;
  END IF;
  UPDATE public.billing_intents SET status = 'success',
    claimed_at = CASE WHEN student_id IS NOT NULL THEN coalesce(claimed_at, now()) ELSE claimed_at END
    WHERE reference = p_reference;
  RETURN inserted_reference IS NOT NULL;
END;
$$;

-- Google email ownership is verified in the API, before using the service role.
-- Email matching alone in a browser request is never sufficient.
CREATE FUNCTION public.claim_shop_purchases(p_user_id uuid, p_email text, p_name text, p_avatar text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE intent public.billing_intents%ROWTYPE; claimed_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('shop_claim:' || p_user_id::text, 0));
  IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE u.id = p_user_id
    AND lower(trim(u.email)) = lower(trim(p_email)) AND u.email_confirmed_at IS NOT NULL
    AND (u.raw_app_meta_data->>'provider' = 'google' OR u.raw_app_meta_data->'providers' ? 'google'))
    THEN RAISE EXCEPTION 'Verified Google account required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.billing_intents WHERE kind = 'shop_item' AND status = 'success'
    AND lower(trim(email)) = lower(trim(p_email)) AND (student_id IS NULL OR student_id = p_user_id))
    THEN RETURN 0; END IF;
  INSERT INTO public.profiles(id, full_name, email, role, primary_track, membership_plan,
    enrollment_status, enrolled_at, avatar_url)
  VALUES(p_user_id, coalesce(nullif(p_name, ''), 'Student'), lower(trim(p_email)), 'Student', NULL,
    'Free', 'purchase_only', now(), p_avatar)
  ON CONFLICT (id) DO UPDATE SET enrollment_status = CASE
    WHEN profiles.role = 'Student' AND profiles.primary_track IS NULL THEN 'purchase_only' ELSE profiles.enrollment_status END;
  FOR intent IN SELECT * FROM public.billing_intents WHERE kind = 'shop_item' AND status = 'success'
    AND lower(trim(email)) = lower(trim(p_email)) AND claimed_at IS NULL
    AND (student_id IS NULL OR student_id = p_user_id) ORDER BY reference FOR UPDATE
  LOOP
    INSERT INTO public.shop_purchases(id, student_id, student_email, student_name, item_id,
      item_slug, item_title, item_type, amount, payment_reference, purchased_at, created_at)
    SELECT p_user_id::text || '_' || intent.item_id, p_user_id, intent.email,
      coalesce(intent.buyer_name, p_name, 'Student'), intent.item_id, coalesce(intent.item_slug, ''),
      coalesce(intent.item_title, 'Store item'), coalesce(intent.item_type, 'course'),
      amount, intent.reference, paid_at, paid_at FROM public.payments WHERE reference = intent.reference
    ON CONFLICT (student_id, item_id) DO NOTHING;
    UPDATE public.payments SET student_id = p_user_id WHERE reference = intent.reference;
    UPDATE public.billing_intents SET student_id = p_user_id, claimed_at = now() WHERE reference = intent.reference;
    claimed_count := claimed_count + 1;
  END LOOP;
  RETURN claimed_count;
END;
$$;

CREATE FUNCTION public.reserve_shop_receipt(p_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE reserved text;
BEGIN
  UPDATE public.shop_receipt_outbox SET status = 'processing', processing_at = now(), attempts = attempts + 1
  WHERE reference = p_reference AND status <> 'sent' AND next_attempt_at <= now()
    AND (status <> 'processing' OR processing_at < now() - interval '5 minutes')
  RETURNING reference INTO reserved;
  RETURN reserved IS NOT NULL;
END;
$$;

CREATE FUNCTION public.shop_campaign_totals(p_campaign_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'checkouts', count(*),
    'payments', count(*) FILTER (WHERE i.status = 'success'),
    'accessed', count(*) FILTER (WHERE i.status = 'success' AND i.claimed_at IS NOT NULL),
    'unclaimed', count(*) FILTER (WHERE i.status = 'success' AND i.claimed_at IS NULL),
    'revenue', coalesce(sum(i.amount_kobo / 100.0) FILTER (WHERE i.status = 'success'), 0),
    'receiptFailures', count(*) FILTER (WHERE r.status = 'failed')
  ) FROM public.billing_intents i LEFT JOIN public.shop_receipt_outbox r USING (reference)
  WHERE i.campaign_id = p_campaign_id AND (i.initialized_at IS NOT NULL OR i.status = 'success');
$$;
REVOKE ALL ON FUNCTION public.shop_campaign_totals(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shop_campaign_totals(text) TO service_role;
REVOKE ALL ON FUNCTION public.consume_shop_request_limit(text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_shop_payment(text,text,bigint,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_shop_purchases(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_shop_receipt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_shop_request_limit(text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_shop_payment(text,text,bigint,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_shop_purchases(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_shop_receipt(text) TO service_role;
COMMIT;
