-- =====================================================================
-- Shipping & "Request a Shipping Quote" support.
--
-- Goal: let the customer-facing website (and the ERP) compute shipping
-- charges from a slab table, fall back to a configurable default weight,
-- and route over-threshold (heavy) orders into a "needs quote" flow
-- where no payment is taken — staff follow up manually.
--
-- Strictly additive. Re-running this migration is a no-op.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. settings rows (the `settings` table itself already exists, used by
--    WebsiteSettingsTab for `shopping_mode` / `website_open`).
-- ---------------------------------------------------------------------
INSERT INTO public.settings (key, value)
VALUES
  ('free_shipping_threshold_inr', to_jsonb(1500)),
  ('default_weight_grams_fallback', to_jsonb(500)),
  ('heavy_item_threshold_grams',  to_jsonb(10000))
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. shipping_rates — slab pricing the website + ERP both read.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label             text NOT NULL,
  min_weight_grams  integer NOT NULL CHECK (min_weight_grams >= 0),
  max_weight_grams  integer NOT NULL CHECK (max_weight_grams > min_weight_grams),
  rate_inr          numeric(10,2) NOT NULL CHECK (rate_inr >= 0),
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_active_sort
  ON public.shipping_rates(is_active, sort_order);

ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;

-- Public read (so the website cart can compute live rates), staff-only
-- writes. Uses the same `is_erp_staff()` helper added in 0005.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shipping_rates'
      AND policyname = 'shipping_rates_public_read'
  ) THEN
    CREATE POLICY shipping_rates_public_read
      ON public.shipping_rates FOR SELECT
      USING (is_active = true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'shipping_rates'
      AND policyname = 'shipping_rates_staff_all'
  ) THEN
    CREATE POLICY shipping_rates_staff_all
      ON public.shipping_rates FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END$$;

-- Seed a sensible default ladder (admins can edit / disable from the UI).
INSERT INTO public.shipping_rates (label, min_weight_grams, max_weight_grams, rate_inr, sort_order)
SELECT * FROM (VALUES
  ('Up to 500 g',       0,     500,    60.00, 10),
  ('500 g – 1 kg',      500,   1000,   90.00, 20),
  ('1 – 2 kg',          1000,  2000,   140.00, 30),
  ('2 – 5 kg',          2000,  5000,   220.00, 40),
  ('5 – 10 kg',         5000,  10000,  380.00, 50)
) AS v(label, min_weight_grams, max_weight_grams, rate_inr, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.shipping_rates);

-- ---------------------------------------------------------------------
-- 3. product_variants.weight_grams — optional per-variant override.
-- ---------------------------------------------------------------------
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS weight_grams integer;

-- ---------------------------------------------------------------------
-- 4. sales_orders shipping + quote columns.
--    requires_shipping_quote  — set by website when cart weight exceeds
--                               heavy_item_threshold_grams.
--    shipping_quote_status    — pending / quoted / accepted / declined.
--    shipping_weight_grams    — parcel weight stamped at checkout (or
--                               filled in by staff after they weigh it).
-- ---------------------------------------------------------------------
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS shipping_weight_grams   integer,
  ADD COLUMN IF NOT EXISTS requires_shipping_quote boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_quote_status   text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_orders_shipping_quote_status_check'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_shipping_quote_status_check
      CHECK (shipping_quote_status IS NULL OR shipping_quote_status IN
             ('pending','quoted','accepted','declined'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_quote_pending
  ON public.sales_orders(shipping_quote_status)
  WHERE requires_shipping_quote = true AND shipping_quote_status = 'pending';

-- ---------------------------------------------------------------------
-- 5. One-time fallback backfill — every product without a weight gets
--    the configured default (500 g) so the website never sees NULL.
--    Admins can refine real weights later via the Bulk Weight Editor.
-- ---------------------------------------------------------------------
UPDATE public.products
   SET weight_grams = 500
 WHERE weight_grams IS NULL
    OR weight_grams = 0;
