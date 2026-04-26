/*
  # Improve stock error messages with product and godown names

  ## Changes
  1. `post_stock_movement` — when stock would go negative, look up the product
     name and godown name and include them in the exception message so the
     frontend receives a human-readable error instead of raw UUIDs.

  2. `create_delivery_challan` — no change needed; it calls post_stock_movement
     which now raises a readable message that the frontend can surface directly.
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
  v_new_qty      numeric;
  v_total        numeric;
  v_rows         int;
  v_product_name text;
  v_godown_name  text;
BEGIN
  IF p_product_id IS NULL OR p_godown_id IS NULL THEN
    RAISE EXCEPTION 'product_id and godown_id are required';
  END IF;

  IF p_variant_id IS NOT NULL THEN
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
    -- Look up human-readable names for the error message
    SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
    SELECT name INTO v_godown_name  FROM godowns  WHERE id = p_godown_id;

    RAISE EXCEPTION 'Insufficient stock: "%" in godown "%" would become % (need at least %)',
      COALESCE(v_product_name, p_product_id::text),
      COALESCE(v_godown_name,  p_godown_id::text),
      v_new_qty,
      ABS(v_new_qty)
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
