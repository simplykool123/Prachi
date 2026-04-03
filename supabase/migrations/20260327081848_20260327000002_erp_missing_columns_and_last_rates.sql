/*
  # ERP Upgrade: Missing Columns and Smart Rate Memory Table

  ## Summary
  Adds missing columns to existing tables and creates the smart rate memory table
  for customer-product last used rates.

  ## Changes
  1. Add godown_id to stock_movements (if missing)
  2. Add godown_id to sales_order_items (if missing)
  3. Add godown_id to invoice_items (if missing)
  4. Add mode/reference_type/reference_id columns to dispatch_entries (if missing)
  5. Create customer_product_last_rates table for smart rate memory
  6. Add default godown if none exists

  ## Security
  - RLS enabled on customer_product_last_rates
*/

-- Add godown_id to stock_movements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stock_movements' AND column_name = 'godown_id'
  ) THEN
    ALTER TABLE stock_movements ADD COLUMN godown_id uuid REFERENCES godowns(id);
  END IF;
END $$;

-- Add godown_id to sales_order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_order_items' AND column_name = 'godown_id'
  ) THEN
    ALTER TABLE sales_order_items ADD COLUMN godown_id uuid REFERENCES godowns(id);
  END IF;
END $$;

-- Add godown_id to invoice_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_items' AND column_name = 'godown_id'
  ) THEN
    ALTER TABLE invoice_items ADD COLUMN godown_id uuid REFERENCES godowns(id);
  END IF;
END $$;

-- Add mode column to dispatch_entries if it uses dispatch_mode
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dispatch_entries' AND column_name = 'mode'
  ) THEN
    ALTER TABLE dispatch_entries ADD COLUMN mode text DEFAULT 'Other';
  END IF;
END $$;

-- Add reference_type column to dispatch_entries if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dispatch_entries' AND column_name = 'reference_type'
  ) THEN
    ALTER TABLE dispatch_entries ADD COLUMN reference_type text DEFAULT 'sales_order';
  END IF;
END $$;

-- Add godown_id column to dispatch_entries if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dispatch_entries' AND column_name = 'godown_id'
  ) THEN
    ALTER TABLE dispatch_entries ADD COLUMN godown_id uuid REFERENCES godowns(id);
  END IF;
END $$;

-- Customer product last rates (smart rate memory)
CREATE TABLE IF NOT EXISTS customer_product_last_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_rate numeric NOT NULL DEFAULT 0,
  last_used_at timestamptz DEFAULT now(),
  reference_type text DEFAULT 'invoice',
  reference_id uuid,
  UNIQUE(customer_id, product_id)
);

ALTER TABLE customer_product_last_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view last rates" ON customer_product_last_rates;
DROP POLICY IF EXISTS "Authenticated users can insert last rates" ON customer_product_last_rates;
DROP POLICY IF EXISTS "Authenticated users can update last rates" ON customer_product_last_rates;
DROP POLICY IF EXISTS "Authenticated users can delete last rates" ON customer_product_last_rates;

CREATE POLICY "Authenticated users can view last rates"
  ON customer_product_last_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert last rates"
  ON customer_product_last_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update last rates"
  ON customer_product_last_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete last rates"
  ON customer_product_last_rates FOR DELETE TO authenticated USING (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_godown_stock_godown_id ON godown_stock(godown_id);
CREATE INDEX IF NOT EXISTS idx_godown_stock_product_id ON godown_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_entries_status ON dispatch_entries(status);
CREATE INDEX IF NOT EXISTS idx_customer_rate_cards_customer_id ON customer_rate_cards(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_product_last_rates_cp ON customer_product_last_rates(customer_id, product_id);

-- Insert default godown if none exists
INSERT INTO godowns (name, location, is_active)
SELECT 'Main Godown', 'Head Office', true
WHERE NOT EXISTS (SELECT 1 FROM godowns LIMIT 1);
