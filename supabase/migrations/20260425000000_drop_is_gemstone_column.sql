-- Remove legacy is_gemstone column; product_type is the sole source of truth.
ALTER TABLE products DROP COLUMN IF EXISTS is_gemstone;
