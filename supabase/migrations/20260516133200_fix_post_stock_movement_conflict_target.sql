/*
  # Fix post_stock_movement: replace ON CONFLICT with manual upsert

  ## Problem
  The current function uses `ON CONFLICT (godown_id, product_id)` which fails with
  "no unique or exclusion constraint matching the ON CONFLICT specification" because
  the only unique indexes on godown_stock are partial (WHERE variant_id IS NULL / IS NOT NULL).
  PostgreSQL cannot use partial indexes as ON CONFLICT targets.

  ## Fix
  Drop and recreate post_stock_movement using a manual SELECT-then-UPDATE/INSERT pattern,
  which correctly handles the partial index situation.
*/

DROP FUNCTION IF EXISTS post_stock_movement(uuid, uuid, numeric, text, text, uuid, text, text);

CREATE FUNCTION post_stock_movement(
  p_product_id      uuid,
  p_godown_id       uuid,
  p_qty_change      numeric,
  p_movement_type   text,
  p_reference_type  text  DEFAULT NULL,
  p_reference_id    uuid  DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_notes           text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_qty numeric;
  v_total   numeric;
  v_existing_id uuid;
BEGIN
  IF p_product_id IS NULL OR p_godown_id IS NULL THEN
    RAISE EXCEPTION 'product_id and godown_id are required';
  END IF;

  -- Manual upsert: avoids ON CONFLICT issues with partial unique indexes
  SELECT id INTO v_existing_id
  FROM godown_stock
  WHERE product_id = p_product_id
    AND godown_id  = p_godown_id
    AND variant_id IS NULL
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE godown_stock
    SET quantity   = quantity + p_qty_change,
        updated_at = now()
    WHERE id = v_existing_id
    RETURNING quantity INTO v_new_qty;
  ELSE
    INSERT INTO godown_stock (product_id, godown_id, quantity, updated_at)
    VALUES (p_product_id, p_godown_id, p_qty_change, now())
    RETURNING quantity INTO v_new_qty;
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
