/*
  # Strict stock RPCs — raise on negative, no stock_quantity writes

  ## Rationale
  - godown_stock is the single source of truth for inventory.
  - products.stock_quantity is being phased out; code no longer reads/writes it.
  - Clamping negative results to zero (GREATEST(0, ...)) silently hid bugs
    where a dispatch would over-consume stock. With strict validation in the
    service layer, the DB must also refuse negative results.

  ## Changes
  1. New RPC `update_godown_stock(p_product_id, p_godown_id, p_delta)` —
     atomic upsert of godown_stock by delta; RAISES EXCEPTION if the
     resulting quantity would go below zero.
  2. Replace existing `post_stock_movement` to:
       - use the same strict no-clamp semantics,
       - stop updating `products.stock_quantity`.
     Existing callers (SalesReturns, GodownTransfer, workflowService, etc.)
     continue to work; they will now surface over-consumption errors that
     were previously silenced.
*/

CREATE OR REPLACE FUNCTION update_godown_stock(
  p_product_id uuid,
  p_godown_id uuid,
  p_delta numeric
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_qty numeric;
BEGIN
  IF p_product_id IS NULL OR p_godown_id IS NULL THEN
    RAISE EXCEPTION 'product_id and godown_id are required';
  END IF;

  INSERT INTO godown_stock (product_id, godown_id, quantity, updated_at)
  VALUES (p_product_id, p_godown_id, p_delta, now())
  ON CONFLICT (godown_id, product_id) DO UPDATE
    SET quantity   = godown_stock.quantity + p_delta,
        updated_at = now()
  RETURNING quantity INTO v_new_qty;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % in godown % would become %',
      p_product_id, p_godown_id, v_new_qty
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION update_godown_stock(uuid, uuid, numeric) TO authenticated;


CREATE OR REPLACE FUNCTION post_stock_movement(
  p_product_id uuid,
  p_godown_id uuid,
  p_qty_change numeric,
  p_movement_type text,
  p_reference_type text,
  p_reference_id uuid,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_qty numeric;
BEGIN
  IF p_product_id IS NULL OR p_godown_id IS NULL THEN
    RAISE EXCEPTION 'product_id and godown_id are required';
  END IF;

  INSERT INTO godown_stock (product_id, godown_id, quantity, updated_at)
  VALUES (p_product_id, p_godown_id, p_qty_change, now())
  ON CONFLICT (godown_id, product_id) DO UPDATE
    SET quantity   = godown_stock.quantity + p_qty_change,
        updated_at = now()
  RETURNING quantity INTO v_new_qty;

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
END;
$$;

GRANT EXECUTE ON FUNCTION post_stock_movement(uuid, uuid, numeric, text, text, uuid, text, text) TO authenticated;
