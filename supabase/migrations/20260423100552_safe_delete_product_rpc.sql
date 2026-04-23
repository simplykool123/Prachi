/*
  # Safe Product Delete RPC

  ## Purpose
  Atomically hard-deletes a product and all its dependent data in the correct FK order.
  Called only after the application layer has confirmed there are no active document links.

  ## Deletes (in order)
  1. godown_stock rows for the product (and its variants via variant_id FK)
  2. stock_movements rows for the product
  3. product_units rows (gemstone piece weights)
  4. product_variants rows
  5. The product row itself

  ## Security
  - SECURITY DEFINER so it runs with owner privileges to bypass RLS on child tables
  - Callable by authenticated users only
*/

CREATE OR REPLACE FUNCTION public.safe_delete_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'product_id is required';
  END IF;

  -- Verify no active linked documents (safety guard in the DB layer too)
  IF EXISTS (
    SELECT 1 FROM sales_order_items soi
    JOIN sales_orders so ON so.id = soi.sales_order_id
    WHERE soi.product_id = p_product_id AND so.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Product is linked to active sales orders. Cancel or remove it from those orders first.'
    USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery_challan_items dci
    JOIN delivery_challans dc ON dc.id = dci.delivery_challan_id
    WHERE dci.product_id = p_product_id AND dc.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Product is linked to active delivery challans.'
    USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoice_items ii
    JOIN invoices inv ON inv.id = ii.invoice_id
    WHERE ii.product_id = p_product_id AND inv.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Product is linked to active invoices.'
    USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Delete godown_stock (includes variant rows via variant_id → product_variants)
  DELETE FROM godown_stock WHERE product_id = p_product_id;

  -- Delete stock movements history
  DELETE FROM stock_movements WHERE product_id = p_product_id;

  -- Delete gemstone piece units
  DELETE FROM product_units WHERE product_id = p_product_id;

  -- Delete variants (also cascades godown_stock rows with variant_id via FK)
  DELETE FROM product_variants WHERE product_id = p_product_id;

  -- Delete the product
  DELETE FROM products WHERE id = p_product_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.safe_delete_product(uuid) TO authenticated;
