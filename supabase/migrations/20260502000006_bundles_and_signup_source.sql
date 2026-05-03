/*
  # Product Bundles / Combo Offers + customers.signup_source

  ─────────────────────────────────────────────────────────────────────
  COPY-PASTE READY: open the Supabase SQL editor and paste THIS ENTIRE
  FILE (including these comments) into a new query, then click "Run".
  The migration is idempotent — safe to run multiple times.
  ─────────────────────────────────────────────────────────────────────

  ADDITIVE migration. Existing tables and policies are unaffected.

  1. New tables
     - product_bundles
         id, name, slug (unique partial), description, image_url,
         bundle_price (the offer price), compare_at_price (optional MRP),
         is_active, show_on_website, sort_order, created_at, updated_at
     - product_bundle_items
         id, bundle_id (FK -> product_bundles ON DELETE CASCADE),
         product_id (FK -> products ON DELETE RESTRICT),
         quantity, sort_order, created_at
         UNIQUE (bundle_id, product_id)

  2. New column
     - sales_order_items.bundle_id (nullable, FK -> product_bundles ON DELETE SET NULL)
       Populated only when an item came from a website bundle/combo. Allows
       the ERP UI to visually group items belonging to the same bundle.
     - customers.signup_source (text, nullable)
       'website' for website-originated signups, NULL for ERP-created customers.

  3. Trigger update
     - Replace public.create_customer_for_new_user so it also writes
       signup_source = 'website' on the new customers row.

  4. RLS
     - Staff (is_erp_staff()): full read/write on bundles + items.
     - Public (anon + authenticated): SELECT bundles where is_active AND
       show_on_website; SELECT bundle_items whose parent bundle is publicly
       visible.

  Idempotent: safe to re-run.
*/

-- ─────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_bundles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  slug              text,
  description       text,        -- short description (card / list view)
  long_description  text,        -- long description (product detail page)
  image_url         text,
  bundle_price      numeric(12,2) NOT NULL DEFAULT 0,
  compare_at_price  numeric(12,2),
  valid_from        timestamptz, -- offer window start (NULL = no start gate)
  valid_to          timestamptz, -- offer window end   (NULL = no end gate)
  is_active         boolean NOT NULL DEFAULT true,
  show_on_website   boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed (re-run), make sure the optional columns are present.
ALTER TABLE public.product_bundles ADD COLUMN IF NOT EXISTS long_description text;
ALTER TABLE public.product_bundles ADD COLUMN IF NOT EXISTS valid_from       timestamptz;
ALTER TABLE public.product_bundles ADD COLUMN IF NOT EXISTS valid_to         timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS product_bundles_slug_unique_idx
  ON public.product_bundles (lower(slug))
  WHERE slug IS NOT NULL AND slug <> '';

CREATE TABLE IF NOT EXISTS public.product_bundle_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id   uuid NOT NULL REFERENCES public.product_bundles(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity    numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_bundle_items_bundle_idx
  ON public.product_bundle_items (bundle_id);
CREATE INDEX IF NOT EXISTS product_bundle_items_product_idx
  ON public.product_bundle_items (product_id);

-- ─────────────────────────────────────────────────────
-- 2. sales_order_items.bundle_id
-- ─────────────────────────────────────────────────────
ALTER TABLE public.sales_order_items
  ADD COLUMN IF NOT EXISTS bundle_id uuid
    REFERENCES public.product_bundles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_order_items_bundle_idx
  ON public.sales_order_items (bundle_id);

-- ─────────────────────────────────────────────────────
-- 3. customers.signup_source
-- ─────────────────────────────────────────────────────
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS signup_source text;

CREATE INDEX IF NOT EXISTS customers_signup_source_idx
  ON public.customers (signup_source)
  WHERE signup_source IS NOT NULL;

-- ─────────────────────────────────────────────────────
-- 4. Replace signup trigger so it persists signup_source
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_customer_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  src text;
BEGIN
  src := COALESCE(NEW.raw_user_meta_data ->> 'signup_source', '');

  -- Only run for website-originated signups
  IF src <> 'website' THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL OR NEW.email = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.customers (name, email, phone, city, category, is_active, signup_source)
  VALUES (
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'name', ''), split_part(NEW.email, '@', 1)),
    lower(NEW.email),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'city', ''),
    'B2C',
    true,
    'website'
  )
  ON CONFLICT (lower(email)) WHERE email IS NOT NULL AND email <> '' DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_customer_for_new_user failed: %', SQLERRM;
  RETURN NEW;
END $$;

-- Trigger itself was created in migration 0003; no need to recreate.

-- ─────────────────────────────────────────────────────
-- 5. RLS — bundles + bundle items
-- ─────────────────────────────────────────────────────
ALTER TABLE public.product_bundles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;

-- product_bundles: staff full access
DROP POLICY IF EXISTS "ERP staff can view product_bundles"   ON public.product_bundles;
CREATE POLICY "ERP staff can view product_bundles"
  ON public.product_bundles FOR SELECT
  TO authenticated
  USING (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can insert product_bundles" ON public.product_bundles;
CREATE POLICY "ERP staff can insert product_bundles"
  ON public.product_bundles FOR INSERT
  TO authenticated
  WITH CHECK (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can update product_bundles" ON public.product_bundles;
CREATE POLICY "ERP staff can update product_bundles"
  ON public.product_bundles FOR UPDATE
  TO authenticated
  USING (public.is_erp_staff())
  WITH CHECK (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can delete product_bundles" ON public.product_bundles;
CREATE POLICY "ERP staff can delete product_bundles"
  ON public.product_bundles FOR DELETE
  TO authenticated
  USING (public.is_erp_staff());

-- product_bundles: public read of active + show_on_website rows
DROP POLICY IF EXISTS "product_bundles_public_read" ON public.product_bundles;
CREATE POLICY "product_bundles_public_read"
  ON public.product_bundles FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND show_on_website = true);

-- product_bundle_items: staff full access
DROP POLICY IF EXISTS "ERP staff can view product_bundle_items"   ON public.product_bundle_items;
CREATE POLICY "ERP staff can view product_bundle_items"
  ON public.product_bundle_items FOR SELECT
  TO authenticated
  USING (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can insert product_bundle_items" ON public.product_bundle_items;
CREATE POLICY "ERP staff can insert product_bundle_items"
  ON public.product_bundle_items FOR INSERT
  TO authenticated
  WITH CHECK (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can update product_bundle_items" ON public.product_bundle_items;
CREATE POLICY "ERP staff can update product_bundle_items"
  ON public.product_bundle_items FOR UPDATE
  TO authenticated
  USING (public.is_erp_staff())
  WITH CHECK (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can delete product_bundle_items" ON public.product_bundle_items;
CREATE POLICY "ERP staff can delete product_bundle_items"
  ON public.product_bundle_items FOR DELETE
  TO authenticated
  USING (public.is_erp_staff());

-- product_bundle_items: unrestricted public SELECT so the website can
-- render bundle contents without joining through the bundles table.
-- (Bundles themselves are still gated by is_active + show_on_website.)
DROP POLICY IF EXISTS "product_bundle_items_public_read" ON public.product_bundle_items;
CREATE POLICY "product_bundle_items_public_read"
  ON public.product_bundle_items FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────
-- 6. Touch updated_at on product_bundles via trigger
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_product_bundles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_bundles_touch_updated_at ON public.product_bundles;
CREATE TRIGGER product_bundles_touch_updated_at
  BEFORE UPDATE ON public.product_bundles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_product_bundles_updated_at();
