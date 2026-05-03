/*
  # Website-Facing RLS Policies (Phase 1 + Phase 4 from website-ERP handoff)

  These policies are ADDITIVE — they sit alongside the existing ERP staff
  policies. They give website-authenticated customers exactly the access
  they need to:
    - read & update their own customer row (B2C signup, profile edit)
    - read their own orders, invoices, delivery challans, and rate cards
    - place new sales orders (Phase 4)
  And they let anonymous + authenticated visitors:
    - read published, active products + variants + images + web meta
    - read public settings (e.g. shopping_mode)
    - submit inquiry leads

  Existing ERP staff policies are NOT touched.

  Idempotency: every CREATE POLICY is wrapped in DROP POLICY IF EXISTS so
  this migration is safe to re-run.
*/

-- ─────────────────────────────────────────────────────
-- A. CUSTOMERS — self read / update / insert
-- ─────────────────────────────────────────────────────
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_self_read"   ON public.customers;
CREATE POLICY "customers_self_read"
  ON public.customers FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "customers_self_update" ON public.customers;
CREATE POLICY "customers_self_update"
  ON public.customers FOR UPDATE
  TO authenticated
  USING  (lower(email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND category = 'B2C'   -- prevents B2C → B2B self-promotion via website
  );

DROP POLICY IF EXISTS "customers_self_insert" ON public.customers;
CREATE POLICY "customers_self_insert"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND category = 'B2C'
  );

-- ─────────────────────────────────────────────────────
-- B. SALES ORDERS / INVOICES / DELIVERY CHALLANS — self read
-- ─────────────────────────────────────────────────────
ALTER TABLE public.sales_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_challans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_orders_self_read" ON public.sales_orders;
CREATE POLICY "sales_orders_self_read"
  ON public.sales_orders FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "invoices_self_read" ON public.invoices;
CREATE POLICY "invoices_self_read"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "delivery_challans_self_read" ON public.delivery_challans;
CREATE POLICY "delivery_challans_self_read"
  ON public.delivery_challans FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ─────────────────────────────────────────────────────
-- C. CUSTOMER RATE CARDS — self read (so B2B customers see their pricing)
-- ─────────────────────────────────────────────────────
ALTER TABLE public.customer_rate_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_cards_self_read" ON public.customer_rate_cards;
CREATE POLICY "rate_cards_self_read"
  ON public.customer_rate_cards FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ─────────────────────────────────────────────────────
-- D. CATALOG — public read (anon + authenticated)
--    Products: only show active, website-enabled products to anon traffic.
-- ─────────────────────────────────────────────────────
ALTER TABLE public.products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_web_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND COALESCE(show_on_website, true) = true);

DROP POLICY IF EXISTS "product_web_meta_public_read" ON public.product_web_meta;
CREATE POLICY "product_web_meta_public_read"
  ON public.product_web_meta FOR SELECT
  TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "product_variants_public_read" ON public.product_variants;
CREATE POLICY "product_variants_public_read"
  ON public.product_variants FOR SELECT
  TO anon, authenticated
  USING (COALESCE(is_active, true) = true);

DROP POLICY IF EXISTS "product_images_public_read" ON public.product_images;
CREATE POLICY "product_images_public_read"
  ON public.product_images FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "settings_public_read" ON public.settings;
CREATE POLICY "settings_public_read"
  ON public.settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────
-- E. INQUIRY LEADS — public insert (anyone), authenticated read own
-- ─────────────────────────────────────────────────────
ALTER TABLE public.inquiry_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inquiry_leads_public_insert" ON public.inquiry_leads;
CREATE POLICY "inquiry_leads_public_insert"
  ON public.inquiry_leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "inquiry_leads_self_read" ON public.inquiry_leads;
CREATE POLICY "inquiry_leads_self_read"
  ON public.inquiry_leads FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));

-- ─────────────────────────────────────────────────────
-- F. PHASE 4 — Website customers can place orders
-- ─────────────────────────────────────────────────────
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_orders_self_insert" ON public.sales_orders;
CREATE POLICY "sales_orders_self_insert"
  ON public.sales_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id IN (
      SELECT id FROM public.customers
      WHERE lower(email) = lower(auth.jwt() ->> 'email')
    )
    AND status IN ('pending', 'draft')   -- customer can only create draft/pending orders
  );

DROP POLICY IF EXISTS "sales_order_items_self_insert" ON public.sales_order_items;
CREATE POLICY "sales_order_items_self_insert"
  ON public.sales_order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    sales_order_id IN (
      SELECT so.id
      FROM public.sales_orders so
      JOIN public.customers c ON c.id = so.customer_id
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "sales_order_items_self_read" ON public.sales_order_items;
CREATE POLICY "sales_order_items_self_read"
  ON public.sales_order_items FOR SELECT
  TO authenticated
  USING (
    sales_order_id IN (
      SELECT so.id
      FROM public.sales_orders so
      JOIN public.customers c ON c.id = so.customer_id
      WHERE lower(c.email) = lower(auth.jwt() ->> 'email')
    )
  );
