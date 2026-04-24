/*
  # Fix product_type constraint (v2)

  1. Order
    - Drop old check first (so updates can proceed)
    - Migrate legacy 'product'/'service' values to 'simple'
    - Re-add check with correct allowed values
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_product_type_check'
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_product_type_check;
  END IF;
END $$;

UPDATE products SET product_type = 'simple' WHERE product_type IN ('product', 'service');

ALTER TABLE products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('simple', 'variant', 'weight', 'gemstone'));
