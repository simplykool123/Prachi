/*
  # Add Optional Website Columns to Products + Seed Shopping Mode

  Optional product columns the customer-facing website can read/render:
  - short_description   — short blurb for product cards
  - specs               — JSONB key/value specs (e.g. {"weight": "350g"})
  - tags                — text[] for filtering
  - show_on_website     — boolean toggle (default true) — when false the product is hidden on the website

  Also seeds a default `settings` row for `shopping_mode = on`.
*/

-- ─────────────────────────────────────────────────────
-- Add optional product columns
-- ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='short_description') THEN
    ALTER TABLE public.products ADD COLUMN short_description text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='specs') THEN
    ALTER TABLE public.products ADD COLUMN specs jsonb;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='tags') THEN
    ALTER TABLE public.products ADD COLUMN tags text[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='products' AND column_name='show_on_website') THEN
    ALTER TABLE public.products ADD COLUMN show_on_website boolean DEFAULT true;
  END IF;
END $$;

-- Index to speed up website product listing queries
CREATE INDEX IF NOT EXISTS idx_products_show_on_website
  ON public.products(show_on_website) WHERE show_on_website = true;

-- ─────────────────────────────────────────────────────
-- Seed default settings rows
-- ─────────────────────────────────────────────────────
INSERT INTO public.settings (key, value, description) VALUES
  ('shopping_mode', 'on', 'Controls whether the public website can place orders. Values: on | off'),
  ('website_open',  'on', 'Master switch for the customer-facing website. Values: on | off')
ON CONFLICT (key) DO NOTHING;
