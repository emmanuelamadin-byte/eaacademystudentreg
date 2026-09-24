-- Add included_in_premium column to shop_items table for courses included in the monthly membership
ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS included_in_premium boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS shop_items_included_in_premium_idx
  ON public.shop_items(included_in_premium);
