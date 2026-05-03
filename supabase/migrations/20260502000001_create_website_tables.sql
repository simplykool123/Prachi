/*
  # Website Backend Tables

  Adds the tables needed for the customer-facing House of Remedies website:
  1. `settings`           — generic key/value app settings (used by `shopping_mode` etc.)
  2. `product_web_meta`   — slug + Vastu metadata + publish flag per product
  3. `product_images`     — multi-image gallery per product
  4. `inquiry_leads`      — lead form submissions from the website

  Notes:
  - All tables have RLS enabled. Public-read / public-insert policies are added in
    the dedicated `*_website_rls_policies.sql` migration to keep policy logic central.
  - These tables are PURELY ADDITIVE — no existing ERP table is touched.
*/

-- ─────────────────────────────────────────────────────
-- 1. SETTINGS  (generic key/value)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settings (
  key         text PRIMARY KEY,
  value       text NOT NULL DEFAULT '',
  description text DEFAULT '',
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────
-- 2. PRODUCT WEB META
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_web_meta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  slug             text UNIQUE,
  tagline          text DEFAULT '',
  vastu_direction  text[] DEFAULT '{}',
  vastu_benefit    text[] DEFAULT '{}',
  placement_note   text DEFAULT '',
  where_to_use     text DEFAULT '',
  expected_results text DEFAULT '',
  is_published     boolean DEFAULT false,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.product_web_meta ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_web_meta_product_id ON public.product_web_meta(product_id);
CREATE INDEX IF NOT EXISTS idx_product_web_meta_slug       ON public.product_web_meta(slug);
CREATE INDEX IF NOT EXISTS idx_product_web_meta_published  ON public.product_web_meta(is_published);

-- ─────────────────────────────────────────────────────
-- 3. PRODUCT IMAGES (multi-image gallery)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url         text NOT NULL,
  alt_text    text DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  is_primary  boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_sort       ON public.product_images(product_id, sort_order);

-- Only one primary image per product
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_one_primary
  ON public.product_images(product_id) WHERE is_primary = true;

-- ─────────────────────────────────────────────────────
-- 4. INQUIRY LEADS (website lead form submissions)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inquiry_leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL DEFAULT '',
  phone        text DEFAULT '',
  email        text DEFAULT '',
  product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text DEFAULT '',
  message      text DEFAULT '',
  status       text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'replied', 'closed')),
  source       text DEFAULT 'website',
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE public.inquiry_leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_inquiry_leads_status     ON public.inquiry_leads(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_leads_created_at ON public.inquiry_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiry_leads_email      ON public.inquiry_leads(email);
