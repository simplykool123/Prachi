/*
  # Lock Existing Broad Policies to ERP Staff (CRITICAL SECURITY)

  Before this migration, most existing policies on the ERP tables were
  `TO authenticated USING (true)` or `TO authenticated USING (auth.uid() IS NOT NULL)`.

  Postgres combines permissive policies with OR. So once we let website
  customers authenticate (via `auth.users`), they would inherit those
  broad policies and could read every customer, every invoice, every order.
  The new self-scoped website policies in `..._website_rls_policies.sql`
  cannot RESTRICT — they can only ADD access.

  This migration plugs that hole by:
  1. Adding a SECURITY DEFINER helper `public.is_erp_staff()` that returns
     true iff the current `auth.uid()` exists in `public.user_profiles`.
     ERP staff (admin, manager, billing, sales, etc.) all have rows there;
     website customers do not. Confirmed by the website-side handoff doc:
     "user_profiles is for ERP staff/admin only ... the website intentionally
      does not read or write it."
  2. Rewriting the broad authenticated policies on every customer-sensitive
     table to require `public.is_erp_staff()` instead of `auth.uid() IS NOT NULL`.

  ERP impact: zero. ERP staff still have a user_profiles row, so
  `is_erp_staff()` returns true and the existing UI behaves identically.
  Website customers (no user_profiles row) can no longer fall through to
  the broad ERP policies — they are restricted to the self-scoped policies
  added in `20260502000004`.

  Idempotency: every policy is dropped before being recreated.
*/

-- ─────────────────────────────────────────────────────
-- 0. Patch handle_new_user — skip user_profiles creation for website signups.
--
--    The existing trigger auto-created a user_profiles row for EVERY new
--    auth.users insert. That made every signed-in user look like ERP staff.
--    From now on, signups that pass `raw_user_meta_data->>'signup_source'='website'`
--    will NOT get a user_profiles row, so they remain plain customers.
--
--    All existing ERP users already have user_profiles rows — unaffected.
--    Future ERP staff signups (admin dashboard, admin-create-user, etc.) that
--    do NOT pass the website flag continue to behave exactly as before.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Website-originated signups: skip user_profiles. The customers row is
  -- handled by create_customer_for_new_user (migration 0003).
  IF COALESCE(NEW.raw_user_meta_data ->> 'signup_source', '') = 'website' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- ─────────────────────────────────────────────────────
-- 1. Helper: is_erp_staff()
--    True iff the current auth.uid() has a user_profiles row.
--    Website customers (signed up with signup_source='website') do NOT.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_erp_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_erp_staff() TO authenticated, anon;

-- ─────────────────────────────────────────────────────
-- 2. Tighten broad policies on customer-sensitive tables.
--    For each table we drop the existing broad policies (named in earlier
--    migrations as e.g. "Authenticated users can view <table>") and replace
--    them with staff-only equivalents. The self-scoped website policies
--    from migration 0004 remain in place (PERMISSIVE OR with these), so
--    customers still see their own rows; everyone else needs staff status.
-- ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  pol record;
  tables text[] := ARRAY[
    'customers',
    'sales_orders',
    'sales_order_items',
    'invoices',
    'invoice_items',
    'delivery_challans',
    'delivery_challan_items',
    'customer_rate_cards',
    'customer_rates',
    'customer_last_rates',
    'customer_product_last_rates',
    'payments',
    'ledger_entries',
    'journal_entries',
    'crm_notes',
    'crm_files',
    'customer_documents',
    'appointments',
    'travel_plans',
    'product_recommendations',
    'reminders',
    'automation_rules',
    'workflow_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip tables that don't exist in this database
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Make sure RLS is on
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop every existing policy whose name starts with "Authenticated users can"
    -- (those are the legacy broad ones from earlier migrations). The website
    -- self-scoped policies use different names ("..._self_read", etc.) so they
    -- are preserved.
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname LIKE 'Authenticated users can %'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Drop our own staff policies first so this migration is re-runnable
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can view %1$s"   ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can delete %1$s" ON public.%1$I', t);

    -- Recreate as staff-only (one consolidated set per table)
    EXECUTE format($p$
      CREATE POLICY "ERP staff can view %1$s"
        ON public.%1$I FOR SELECT
        TO authenticated
        USING (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can insert %1$s"
        ON public.%1$I FOR INSERT
        TO authenticated
        WITH CHECK (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can update %1$s"
        ON public.%1$I FOR UPDATE
        TO authenticated
        USING (public.is_erp_staff())
        WITH CHECK (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can delete %1$s"
        ON public.%1$I FOR DELETE
        TO authenticated
        USING (public.is_erp_staff())
    $p$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────
-- 3. Catalog tables (products, product_variants, product_images,
--    product_web_meta, settings):
--    Public READ is fine (already added in migration 0004 as anon+authenticated
--    policies). But we must lock down WRITES — only ERP staff should be able
--    to insert/update/delete catalog rows. Same pattern: drop legacy broad
--    write policies, recreate as staff-only.
-- ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  pol record;
  catalog_tables text[] := ARRAY[
    'products',
    'product_variants',
    'product_units',
    'product_images',
    'product_web_meta',
    'settings',
    'godowns',
    'godown_stock',
    'stock_movements',
    'godown_transfers',
    'godown_transfer_items',
    'companies',
    'company_settings',
    'suppliers',
    'purchase_orders',
    'purchase_order_items',
    'purchase_entries',
    'purchase_entry_items',
    'expenses',
    'courier_entries',
    'dispatch_entries'
  ];
BEGIN
  FOREACH t IN ARRAY catalog_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop legacy broad policies. Public read policies (from migration 0004)
    -- have different names and are preserved.
    FOR pol IN
      SELECT policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname LIKE 'Authenticated users can %'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    -- Drop our own staff policies first so this migration is re-runnable
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can view %1$s"   ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can insert %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can update %1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "ERP staff can delete %1$s" ON public.%1$I', t);

    -- Staff-only writes (catalog tables also need staff SELECT for ERP UI;
    -- public SELECT remains via the policies added in migration 0004)
    EXECUTE format($p$
      CREATE POLICY "ERP staff can view %1$s"
        ON public.%1$I FOR SELECT
        TO authenticated
        USING (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can insert %1$s"
        ON public.%1$I FOR INSERT
        TO authenticated
        WITH CHECK (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can update %1$s"
        ON public.%1$I FOR UPDATE
        TO authenticated
        USING (public.is_erp_staff())
        WITH CHECK (public.is_erp_staff())
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "ERP staff can delete %1$s"
        ON public.%1$I FOR DELETE
        TO authenticated
        USING (public.is_erp_staff())
    $p$, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────
-- 4. Inquiry leads — staff-only read/update/delete (public insert was added
--    in migration 0004 and remains).
-- ─────────────────────────────────────────────────────
ALTER TABLE public.inquiry_leads ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='inquiry_leads'
      AND policyname LIKE 'Authenticated users can %'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.inquiry_leads', pol.policyname);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "ERP staff can view inquiry_leads"   ON public.inquiry_leads;
CREATE POLICY "ERP staff can view inquiry_leads"
  ON public.inquiry_leads FOR SELECT
  TO authenticated
  USING (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can update inquiry_leads" ON public.inquiry_leads;
CREATE POLICY "ERP staff can update inquiry_leads"
  ON public.inquiry_leads FOR UPDATE
  TO authenticated
  USING (public.is_erp_staff())
  WITH CHECK (public.is_erp_staff());

DROP POLICY IF EXISTS "ERP staff can delete inquiry_leads" ON public.inquiry_leads;
CREATE POLICY "ERP staff can delete inquiry_leads"
  ON public.inquiry_leads FOR DELETE
  TO authenticated
  USING (public.is_erp_staff());

-- ─────────────────────────────────────────────────────
-- 5. Hardening: make customer self-update truly safe by also blocking any
--    change to category/balance/opening_balance/total_revenue via website.
--    Implemented as a BEFORE UPDATE trigger so the rule applies even if
--    additional permissive policies are added later.
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_customer_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ERP staff can change anything
  IF public.is_erp_staff() THEN
    RETURN NEW;
  END IF;

  -- Service role / no auth context: leave alone
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Website customer path: lock financial + categorisation columns to OLD values
  NEW.category         := OLD.category;
  NEW.is_active        := OLD.is_active;
  NEW.opening_balance  := OLD.opening_balance;
  NEW.balance          := OLD.balance;
  NEW.total_revenue    := COALESCE(OLD.total_revenue, NEW.total_revenue);
  NEW.gstin            := OLD.gstin;          -- never touched from website
  NEW.email            := OLD.email;          -- email change must go through auth

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_customer_self_update_tg ON public.customers;
CREATE TRIGGER guard_customer_self_update_tg
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_customer_self_update();
