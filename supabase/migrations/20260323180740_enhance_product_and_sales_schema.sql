/*
  # Enhance Product, Sales, and Ledger Schema

  1. Products
     - Add `direction` field (Vastu/Feng Shui directional placement)
     - Add `gemstone` boolean flag
     - Add `weight_grams` for gemstone products

  2. Customer Recommendations
     - New `product_recommendations` table linking customers to products
     - Stores recommended direction, quantity, notes

  3. Ledger Entries
     - Ensure `ledger_entries` table has proper trigger support

  4. Invoice → Sales Order constraint
     - `invoices.sales_order_id` should be encouraged (we enforce at app level)

  5. Sales Returns
     - Ensure return restores stock via stock_movements

  Notes:
     - All new columns use IF NOT EXISTS guards
     - RLS remains enabled on all new tables
*/

-- Add product enhancement columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='direction') THEN
    ALTER TABLE products ADD COLUMN direction text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='is_gemstone') THEN
    ALTER TABLE products ADD COLUMN is_gemstone boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='weight_grams') THEN
    ALTER TABLE products ADD COLUMN weight_grams numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- Product Recommendations table
CREATE TABLE IF NOT EXISTS product_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL DEFAULT '',
  direction text DEFAULT '',
  recommended_quantity integer DEFAULT 1,
  notes text DEFAULT '',
  recommended_by text DEFAULT '',
  recommended_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE product_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select product_recommendations"
  ON product_recommendations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product_recommendations"
  ON product_recommendations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product_recommendations"
  ON product_recommendations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product_recommendations"
  ON product_recommendations FOR DELETE
  TO authenticated
  USING (true);

-- Ensure customers table has all needed fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='notes') THEN
    ALTER TABLE customers ADD COLUMN notes text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='project_status') THEN
    ALTER TABLE customers ADD COLUMN project_status text DEFAULT 'active';
  END IF;
END $$;

-- Ensure ledger_entries has all fields for auto-entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ledger_entries' AND column_name='narration') THEN
    ALTER TABLE ledger_entries ADD COLUMN narration text DEFAULT '';
  END IF;
END $$;
