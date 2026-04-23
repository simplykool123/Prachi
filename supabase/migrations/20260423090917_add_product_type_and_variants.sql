/*
  # Product Type System — product_type enum + product_variants table

  ## Summary
  Adds a structured `product_type` enum to the products table and a `product_variants`
  table to support size/colour variants. Existing products default to their correct type
  automatically (gemstones → 'gemstone', everything else → 'simple').

  ## Changes

  ### 1. New enum: product_type_enum
  - `simple`   — qty-based (default for existing non-gemstone products)
  - `variant`  — multiple named variants each with own stock
  - `weight`   — no discrete quantity; priced and sold by weight (e.g. bulk herbs, powders)
  - `gemstone` — individual piece tracking via product_units (existing behaviour)

  ### 2. Altered Table: products
  - Added column `product_type` (product_type_enum, NOT NULL, DEFAULT 'simple')
  - Existing products with `is_gemstone = true` are back-filled to 'gemstone'
  - `is_gemstone` flag is kept for backward-compat (still used by existing queries)

  ### 3. New Table: product_variants
  - `id`             uuid PK
  - `product_id`     uuid FK → products (CASCADE DELETE)
  - `name`           text NOT NULL  (e.g. "4 inch", "Small", "Red")
  - `sku`            text UNIQUE NOT NULL
  - `stock_quantity` numeric DEFAULT 0   (current qty in stock)
  - `purchase_price` numeric DEFAULT 0
  - `selling_price`  numeric DEFAULT 0
  - `is_active`      boolean DEFAULT true
  - `created_at`, `updated_at`

  ### 4. sales_order_items + purchase_entry_items
  - Added `variant_id` (nullable uuid FK → product_variants) to both tables

  ### 5. Security
  - RLS enabled on product_variants with authenticated-user policies
*/

-- 1. Enum
DO $$ BEGIN
  CREATE TYPE product_type_enum AS ENUM ('simple', 'variant', 'weight', 'gemstone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add product_type column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS product_type product_type_enum NOT NULL DEFAULT 'simple';

-- Back-fill gemstone products
UPDATE products SET product_type = 'gemstone' WHERE is_gemstone = true AND product_type = 'simple';

-- 3. product_variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name             text NOT NULL,
  sku              text UNIQUE NOT NULL DEFAULT '',
  stock_quantity   numeric(12, 3) NOT NULL DEFAULT 0,
  purchase_price   numeric(12, 2) NOT NULL DEFAULT 0,
  selling_price    numeric(12, 2) NOT NULL DEFAULT 0,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view product variants"
  ON product_variants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product variants"
  ON product_variants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product variants"
  ON product_variants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product variants"
  ON product_variants FOR DELETE
  TO authenticated
  USING (true);

-- 4. Add variant_id to sales_order_items
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;

-- 5. Add variant_id to purchase_entry_items
ALTER TABLE purchase_entry_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
