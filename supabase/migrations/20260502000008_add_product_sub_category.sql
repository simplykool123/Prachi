/*
  # Add sub_category column to products

  Introduces a second-level taxonomy: existing `products.category` is treated
  as the Main Category, and the new `sub_category` column captures the more
  specific Sub-Category (see src/lib/productCategories.ts for the canonical
  Main → Sub list).

  Additive only — column is nullable, existing rows keep working with
  sub_category = NULL until they are edited.

  Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
*/

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category text;

CREATE INDEX IF NOT EXISTS idx_products_sub_category
  ON public.products(sub_category)
  WHERE sub_category IS NOT NULL;
