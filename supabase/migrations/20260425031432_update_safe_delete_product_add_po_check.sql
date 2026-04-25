/*
  # Update safe_delete_product RPC to check purchase entries

  1. Changes
    - Adds check: if product is linked to active (non-cancelled) purchase entries, raise error
    - Also deletes purchase_entry_items for the product when doing a hard delete
  2. Safety
    - No data loss; this is a guard and cleanup extension
*/

CREATE OR REPLACE FUNCTION public.safe_delete_product(p_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'product_id is required';
  END IF;

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

  IF EXISTS (
    SELECT 1 FROM purchase_entry_items pei
    JOIN purchase_entries pe ON pe.id = pei.purchase_entry_id
    WHERE pei.product_id = p_product_id AND pe.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Product is linked to active purchase entries. Cancel those entries before deleting this product.'
    USING ERRCODE = 'foreign_key_violation';
  END IF;

  DELETE FROM godown_stock WHERE product_id = p_product_id;
  DELETE FROM stock_movements WHERE product_id = p_product_id;
  DELETE FROM product_units WHERE product_id = p_product_id;
  DELETE FROM product_variants WHERE product_id = p_product_id;
  DELETE FROM purchase_entry_items WHERE product_id = p_product_id;
  DELETE FROM products WHERE id = p_product_id;
END;
$$;
