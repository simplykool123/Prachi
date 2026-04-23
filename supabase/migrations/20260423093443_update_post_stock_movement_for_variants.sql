/*
  # Update post_stock_movement RPC to support variant_id

  ## Changes
  1. Functions Modified
    - `post_stock_movement`: Added optional `p_variant_id` parameter.
      When variant_id is provided, upserts godown_stock with (product_id, godown_id, variant_id).
      When variant_id is NULL, upserts godown_stock with (product_id, godown_id) only.
      Uses explicit UPDATE + INSERT pattern (no ON CONFLICT) since we have partial unique indexes.

  ## Notes
  - Non-variant products are unaffected (variant_id stays NULL, same behaviour as before).
  - Variant stock tracks separately per (godown, product, variant).
  - products.stock_quantity sums ALL godown_stock rows for that product (includes variant rows).
*/

CREATE OR REPLACE FUNCTION public.post_stock_movement(
  p_product_id      uuid,
  p_godown_id       uuid,
  p_qty_change      numeric,
  p_movement_type   text,
  p_reference_type  text,
  p_reference_id    uuid,
  p_reference_number text DEFAULT NULL,
  p_notes           text DEFAULT NULL,
  p_variant_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_qty numeric;
  v_total   numeric;
  v_rows    int;
BEGIN
  IF p_product_id IS NULL OR p_godown_id IS NULL THEN
    RAISE EXCEPTION 'product_id and godown_id are required';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    -- Variant path: key is (godown_id, product_id, variant_id)
    UPDATE godown_stock
       SET quantity   = quantity + p_qty_change,
           updated_at = now()
     WHERE godown_id  = p_godown_id
       AND product_id = p_product_id
       AND variant_id = p_variant_id
    RETURNING quantity INTO v_new_qty;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      INSERT INTO godown_stock (product_id, godown_id, variant_id, quantity, updated_at)
      VALUES (p_product_id, p_godown_id, p_variant_id, p_qty_change, now())
      RETURNING quantity INTO v_new_qty;
    END IF;
  ELSE
    -- Non-variant path: key is (godown_id, product_id) WHERE variant_id IS NULL
    UPDATE godown_stock
       SET quantity   = quantity + p_qty_change,
           updated_at = now()
     WHERE godown_id  = p_godown_id
       AND product_id = p_product_id
       AND variant_id IS NULL
    RETURNING quantity INTO v_new_qty;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      INSERT INTO godown_stock (product_id, godown_id, quantity, updated_at)
      VALUES (p_product_id, p_godown_id, p_qty_change, now())
      RETURNING quantity INTO v_new_qty;
    END IF;
  END IF;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % in godown % would become %',
      p_product_id, p_godown_id, v_new_qty
    USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO stock_movements (
    product_id, godown_id, movement_type, quantity,
    reference_type, reference_id, reference_number, notes
  ) VALUES (
    p_product_id, p_godown_id, p_movement_type, ABS(p_qty_change),
    p_reference_type, p_reference_id, p_reference_number, p_notes
  );

  SELECT COALESCE(SUM(quantity), 0) INTO v_total
    FROM godown_stock
   WHERE product_id = p_product_id;

  UPDATE products
     SET stock_quantity = v_total,
         updated_at     = now()
   WHERE id = p_product_id;
END;
$$;
