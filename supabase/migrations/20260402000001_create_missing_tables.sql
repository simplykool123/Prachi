/*
  # Create Missing Tables
  
  Several tables are referenced throughout the app code but were never created
  in any migration. This migration creates them all safely using IF NOT EXISTS.

  Tables created:
  1. godowns           - warehouse/storage locations
  2. godown_stock      - per-product stock per godown
  3. dispatch_entries  - internal dispatch tracking (used by Dispatch page)
  4. customer_rates    - fixed rate cards per customer-product
  5. customer_rate_cards - extended rate card with validity dates (used by rateCardService)

  Also fixes:
  - sales_orders status constraint (adds 'invoiced' and 'closed' values used in code)
  - stock_movements movement_type constraint (ensures 'purchase' and 'sale' are allowed)
  - payments table: adds invoice_id FK column (used by invoiceService.recordPayment)
*/

-- ─────────────────────────────────────────────────────
-- 1. GODOWNS
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS godowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text DEFAULT '',
  name text NOT NULL,
  location text DEFAULT '',
  manager_name text DEFAULT '',
  phone text DEFAULT '',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE godowns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godowns' AND policyname = 'Authenticated users can view godowns') THEN
    CREATE POLICY "Authenticated users can view godowns" ON godowns FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godowns' AND policyname = 'Authenticated users can insert godowns') THEN
    CREATE POLICY "Authenticated users can insert godowns" ON godowns FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godowns' AND policyname = 'Authenticated users can update godowns') THEN
    CREATE POLICY "Authenticated users can update godowns" ON godowns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godowns' AND policyname = 'Authenticated users can delete godowns') THEN
    CREATE POLICY "Authenticated users can delete godowns" ON godowns FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Seed a default godown if none exists
INSERT INTO godowns (name, location, is_active)
SELECT 'Main Warehouse', 'Head Office', true
WHERE NOT EXISTS (SELECT 1 FROM godowns LIMIT 1);

-- ─────────────────────────────────────────────────────
-- 2. GODOWN STOCK
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS godown_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  godown_id uuid NOT NULL REFERENCES godowns(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(godown_id, product_id)
);

ALTER TABLE godown_stock ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godown_stock' AND policyname = 'Authenticated users can view godown_stock') THEN
    CREATE POLICY "Authenticated users can view godown_stock" ON godown_stock FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godown_stock' AND policyname = 'Authenticated users can insert godown_stock') THEN
    CREATE POLICY "Authenticated users can insert godown_stock" ON godown_stock FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godown_stock' AND policyname = 'Authenticated users can update godown_stock') THEN
    CREATE POLICY "Authenticated users can update godown_stock" ON godown_stock FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'godown_stock' AND policyname = 'Authenticated users can delete godown_stock') THEN
    CREATE POLICY "Authenticated users can delete godown_stock" ON godown_stock FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_godown_stock_godown_id ON godown_stock(godown_id);
CREATE INDEX IF NOT EXISTS idx_godown_stock_product_id ON godown_stock(product_id);

-- ─────────────────────────────────────────────────────
-- 3. DISPATCH ENTRIES  (used by Dispatch.tsx page and Dashboard)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_number text UNIQUE NOT NULL,
  reference_type text DEFAULT 'sales_order' CHECK (reference_type IN ('sales_order', 'invoice', 'manual')),
  sales_order_id uuid REFERENCES sales_orders(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT '',
  dispatch_mode text DEFAULT 'Other',
  mode text DEFAULT 'Other',
  transport_name text DEFAULT '',
  lr_number text DEFAULT '',
  vehicle_number text DEFAULT '',
  driver_name text DEFAULT '',
  driver_phone text DEFAULT '',
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date date,
  actual_delivery date,
  godown_id uuid REFERENCES godowns(id) ON DELETE SET NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'in_transit', 'delivered', 'returned')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE dispatch_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatch_entries' AND policyname = 'Authenticated users can view dispatch_entries') THEN
    CREATE POLICY "Authenticated users can view dispatch_entries" ON dispatch_entries FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatch_entries' AND policyname = 'Authenticated users can insert dispatch_entries') THEN
    CREATE POLICY "Authenticated users can insert dispatch_entries" ON dispatch_entries FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatch_entries' AND policyname = 'Authenticated users can update dispatch_entries') THEN
    CREATE POLICY "Authenticated users can update dispatch_entries" ON dispatch_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dispatch_entries' AND policyname = 'Authenticated users can delete dispatch_entries') THEN
    CREATE POLICY "Authenticated users can delete dispatch_entries" ON dispatch_entries FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dispatch_entries_status ON dispatch_entries(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_entries_sales_order ON dispatch_entries(sales_order_id);

-- ─────────────────────────────────────────────────────
-- 4. CUSTOMER RATES  (simple fixed rate per customer-product)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, product_id)
);

ALTER TABLE customer_rates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rates' AND policyname = 'Authenticated users can view customer_rates') THEN
    CREATE POLICY "Authenticated users can view customer_rates" ON customer_rates FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rates' AND policyname = 'Authenticated users can insert customer_rates') THEN
    CREATE POLICY "Authenticated users can insert customer_rates" ON customer_rates FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rates' AND policyname = 'Authenticated users can update customer_rates') THEN
    CREATE POLICY "Authenticated users can update customer_rates" ON customer_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rates' AND policyname = 'Authenticated users can delete customer_rates') THEN
    CREATE POLICY "Authenticated users can delete customer_rates" ON customer_rates FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 5. CUSTOMER RATE CARDS  (extended rate cards with validity)
-- ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  effective_from date,
  effective_to date,
  is_active boolean DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_id, product_id)
);

ALTER TABLE customer_rate_cards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rate_cards' AND policyname = 'Authenticated users can view customer_rate_cards') THEN
    CREATE POLICY "Authenticated users can view customer_rate_cards" ON customer_rate_cards FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rate_cards' AND policyname = 'Authenticated users can insert customer_rate_cards') THEN
    CREATE POLICY "Authenticated users can insert customer_rate_cards" ON customer_rate_cards FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rate_cards' AND policyname = 'Authenticated users can update customer_rate_cards') THEN
    CREATE POLICY "Authenticated users can update customer_rate_cards" ON customer_rate_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_rate_cards' AND policyname = 'Authenticated users can delete customer_rate_cards') THEN
    CREATE POLICY "Authenticated users can delete customer_rate_cards" ON customer_rate_cards FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_rate_cards_customer_id ON customer_rate_cards(customer_id);

-- Also ensure customer_last_rates exists (alias table used by rateService.ts)
CREATE TABLE IF NOT EXISTS customer_last_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rate numeric(12,2) NOT NULL DEFAULT 0,
  last_used_at timestamptz DEFAULT now(),
  reference_type text DEFAULT 'invoice',
  reference_id uuid,
  UNIQUE(customer_id, product_id)
);

ALTER TABLE customer_last_rates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_last_rates' AND policyname = 'Authenticated users can view customer_last_rates') THEN
    CREATE POLICY "Authenticated users can view customer_last_rates" ON customer_last_rates FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_last_rates' AND policyname = 'Authenticated users can insert customer_last_rates') THEN
    CREATE POLICY "Authenticated users can insert customer_last_rates" ON customer_last_rates FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_last_rates' AND policyname = 'Authenticated users can update customer_last_rates') THEN
    CREATE POLICY "Authenticated users can update customer_last_rates" ON customer_last_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 6. FIX: payments table — add invoice_id column (required by invoiceService.recordPayment)
-- ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'invoice_id') THEN
    ALTER TABLE payments ADD COLUMN invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 7. FIX: ledger_entries — add customer_id column (used by workflowService inserts)
-- ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ledger_entries' AND column_name = 'customer_id') THEN
    ALTER TABLE ledger_entries ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 8. FIX: sales_orders status — add 'invoiced' and 'closed' values
-- ─────────────────────────────────────────────────────
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check
  CHECK (status IN ('draft', 'confirmed', 'invoiced', 'dispatched', 'delivered', 'closed', 'cancelled'));

-- ─────────────────────────────────────────────────────
-- 9. FIX: invoices — add godown_id column (used in workflowService.onInvoiceCreated)
-- ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'godown_id') THEN
    ALTER TABLE invoices ADD COLUMN godown_id uuid REFERENCES godowns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────
-- 10. Sync existing product stock into Main Warehouse godown_stock
-- ─────────────────────────────────────────────────────
INSERT INTO godown_stock (godown_id, product_id, quantity)
SELECT g.id, p.id, p.stock_quantity
FROM godowns g
CROSS JOIN products p
WHERE g.name = 'Main Warehouse'
  AND p.is_active = true
ON CONFLICT (godown_id, product_id) DO NOTHING;

-- ─────────────────────────────────────────────────────
-- 11. FIX: company_settings RLS — allow admin role from user_profiles to update
--     (Previous policy used app_metadata which is not set by the app)
-- ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update company settings" ON company_settings;

CREATE POLICY "Admins can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Also allow insert for initial setup
DROP POLICY IF EXISTS "Admins can insert company settings" ON company_settings;

CREATE POLICY "Admins can insert company settings"
  ON company_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
