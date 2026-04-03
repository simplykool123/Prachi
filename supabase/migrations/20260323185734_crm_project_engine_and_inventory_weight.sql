/*
  # CRM Project Engine & Inventory Weight Enhancements

  ## Summary
  This migration adds the full CRM Project Engine features and weight-based inventory support.

  ## New Tables
  - `vastu_plans` - Stores Vastu Plan items per customer (direction, product, qty, notes)
  - `stock_movements` - Stock movement ledger (purchase, sale, return, adjustment)

  ## Modified Tables
  ### customers
  - conversion_stage, project_value, next_followup_date, customer_score, last_interaction_date

  ### products
  - total_weight, remaining_weight, weight_unit (for gemstone weight-based stock)

  ## Security
  - RLS enabled on all new tables with authenticated-user policies
*/

-- Add project engine fields to customers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'conversion_stage') THEN
    ALTER TABLE customers ADD COLUMN conversion_stage text DEFAULT 'Lead';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'project_value') THEN
    ALTER TABLE customers ADD COLUMN project_value numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'next_followup_date') THEN
    ALTER TABLE customers ADD COLUMN next_followup_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'customer_score') THEN
    ALTER TABLE customers ADD COLUMN customer_score integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'last_interaction_date') THEN
    ALTER TABLE customers ADD COLUMN last_interaction_date date;
  END IF;
END $$;

-- Add weight fields to products
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'total_weight') THEN
    ALTER TABLE products ADD COLUMN total_weight numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'remaining_weight') THEN
    ALTER TABLE products ADD COLUMN remaining_weight numeric DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'weight_unit') THEN
    ALTER TABLE products ADD COLUMN weight_unit text DEFAULT 'grams';
  END IF;
END $$;

-- Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type text NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'return', 'adjustment', 'in', 'out')),
  quantity numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  reference_number text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_movements' AND policyname = 'Authenticated users can view stock movements') THEN
    CREATE POLICY "Authenticated users can view stock movements"
      ON stock_movements FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_movements' AND policyname = 'Authenticated users can insert stock movements') THEN
    CREATE POLICY "Authenticated users can insert stock movements"
      ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stock_movements' AND policyname = 'Authenticated users can update stock movements') THEN
    CREATE POLICY "Authenticated users can update stock movements"
      ON stock_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Create vastu_plans table
CREATE TABLE IF NOT EXISTS vastu_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  direction text NOT NULL DEFAULT '',
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  notes text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'installed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE vastu_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vastu_plans' AND policyname = 'Authenticated users can view vastu plans') THEN
    CREATE POLICY "Authenticated users can view vastu plans"
      ON vastu_plans FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vastu_plans' AND policyname = 'Authenticated users can insert vastu plans') THEN
    CREATE POLICY "Authenticated users can insert vastu plans"
      ON vastu_plans FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vastu_plans' AND policyname = 'Authenticated users can update vastu plans') THEN
    CREATE POLICY "Authenticated users can update vastu plans"
      ON vastu_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vastu_plans' AND policyname = 'Authenticated users can delete vastu plans') THEN
    CREATE POLICY "Authenticated users can delete vastu plans"
      ON vastu_plans FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vastu_plans_customer_id ON vastu_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_customers_next_followup ON customers(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_customers_conversion_stage ON customers(conversion_stage);
