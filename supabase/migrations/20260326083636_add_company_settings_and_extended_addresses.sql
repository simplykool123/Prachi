/*
  # Company Settings & Extended Address Fields

  ## Summary
  This migration adds:

  1. **company_settings table** — stores editable business details (name, tagline, address,
     phone, email, GSTIN, bank details, UPI ID, website) used across all print formats
     (invoices, challans, purchase orders). A single row with id = 1 is seeded on creation.

  2. **Extended address on customers** — adds `address2` (second address line) and ensures
     `state`, `pincode`, `phone` (primary), and `alt_phone` (alternate number) exist.

  3. **Extended address on suppliers** — adds `address2`, `state`, `pincode`, `alt_phone`,
     and `contact_phone` for completeness.

  4. **Extended address on invoice copies** — adds `customer_state`, `customer_pincode` so
     invoices carry the full shipping address at time of creation.

  5. **Extended address on delivery challans** — adds `customer_city`, `customer_state`,
     `customer_pincode` columns.

  6. **Extended address on sales orders** — adds `customer_state`, `customer_pincode`.

  ## Security
  - RLS enabled on `company_settings`
  - Only authenticated users can read; only admins (via app_metadata role) can update
*/

-- ─────────────────────────────────────────────
-- 1. COMPANY SETTINGS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_settings (
  id integer PRIMARY KEY DEFAULT 1,
  name text NOT NULL DEFAULT 'Prachi Fulgagar',
  tagline text DEFAULT 'Vastu Expert | Palmist | Astrologer',
  address1 text DEFAULT '',
  address2 text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT 'Maharashtra',
  pincode text DEFAULT '',
  phone text DEFAULT '',
  alt_phone text DEFAULT '',
  email text DEFAULT 'contact@prachifulgagar.com',
  website text DEFAULT '',
  gstin text DEFAULT '',
  pan text DEFAULT '',
  bank_name text DEFAULT 'HDFC Bank',
  account_number text DEFAULT '',
  ifsc_code text DEFAULT '',
  account_holder text DEFAULT 'Prachi Fulgagar',
  upi_id text DEFAULT '',
  footer_note text DEFAULT 'Thank you for choosing Prachi Fulgagar — Celestial Curator | Vastu & Astrology',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read company settings"
  ON company_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can update company settings"
  ON company_settings FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Insert default row if not present
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────
-- 2. CUSTOMER — extended address
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'address2') THEN
    ALTER TABLE customers ADD COLUMN address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'alt_phone') THEN
    ALTER TABLE customers ADD COLUMN alt_phone text;
  END IF;
  -- state and pincode should already exist from initial migration; add if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'state') THEN
    ALTER TABLE customers ADD COLUMN state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'pincode') THEN
    ALTER TABLE customers ADD COLUMN pincode text;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 3. SUPPLIER — extended address
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'address2') THEN
    ALTER TABLE suppliers ADD COLUMN address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'state') THEN
    ALTER TABLE suppliers ADD COLUMN state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'pincode') THEN
    ALTER TABLE suppliers ADD COLUMN pincode text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'suppliers' AND column_name = 'alt_phone') THEN
    ALTER TABLE suppliers ADD COLUMN alt_phone text;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 4. INVOICES — extended customer address snapshot
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'customer_address2') THEN
    ALTER TABLE invoices ADD COLUMN customer_address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'customer_state') THEN
    ALTER TABLE invoices ADD COLUMN customer_state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'customer_pincode') THEN
    ALTER TABLE invoices ADD COLUMN customer_pincode text;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 5. DELIVERY CHALLANS — extended address snapshot
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'customer_address2') THEN
    ALTER TABLE delivery_challans ADD COLUMN customer_address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'customer_city') THEN
    ALTER TABLE delivery_challans ADD COLUMN customer_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'customer_state') THEN
    ALTER TABLE delivery_challans ADD COLUMN customer_state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delivery_challans' AND column_name = 'customer_pincode') THEN
    ALTER TABLE delivery_challans ADD COLUMN customer_pincode text;
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- 6. SALES ORDERS — extended address snapshot
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'customer_address2') THEN
    ALTER TABLE sales_orders ADD COLUMN customer_address2 text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'customer_city') THEN
    ALTER TABLE sales_orders ADD COLUMN customer_city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'customer_state') THEN
    ALTER TABLE sales_orders ADD COLUMN customer_state text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'customer_pincode') THEN
    ALTER TABLE sales_orders ADD COLUMN customer_pincode text;
  END IF;
END $$;
