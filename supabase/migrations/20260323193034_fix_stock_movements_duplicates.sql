/*
  # Fix Duplicate stock_movements Policies and Indexes

  ## Summary
  Removes duplicate RLS policies and duplicate index on stock_movements table.

  ## Changes
  1. Drop duplicate INSERT policy "Authenticated users can insert stock_movements"
     (keeping "Authenticated users can insert stock movements")
  2. Drop duplicate SELECT policy "Authenticated users can view stock_movements"
     (keeping "Authenticated users can view stock movements")
  3. Drop duplicate index idx_stock_movements_product_id
     (keeping idx_stock_movements_product)
*/

DROP POLICY IF EXISTS "Authenticated users can insert stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can view stock_movements" ON public.stock_movements;

DROP INDEX IF EXISTS idx_stock_movements_product_id;
