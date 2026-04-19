/*
  # Fix stock integrity bugs

  ## Changes
  1. Restore products.stock_quantity sync in post_stock_movement RPC.
     (Migration 20260417120000 removed this update; it is required because
     multiple UI pages still read products.stock_quantity directly.)

  2. Fix cancel_delivery_challan: movement_type 'sale_return' → 'return'.
     The stock_movements CHECK constraint only allows:
       'purchase' | 'sale' | 'return' | 'adjustment' | 'in' | 'out'
     Using 'sale_return' causes every DC cancel to fail with a constraint
     violation. The semantically correct value is 'return'.

  3. Expand stock_movements movement_type constraint to include 'sale_return'
     as a defensive measure (in case any existing rows already use it).

  4. Add cancel_purchase_entry(p_entry_id uuid) RPC.
     Reverses all stock movements posted for the entry, writes a reversing
     ledger entry, decrements the supplier balance, and marks the entry
     as cancelled.

  5. One-time reconciliation: sync products.stock_quantity = SUM(godown_stock)
     for every product so the UI shows accurate totals immediately.
*/

-- ---------------------------------------------------------------------------
-- 1. Expand movement_type constraint to include 'sale_return'
-- ---------------------------------------------------------------------------

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN (
    'purchase', 'sale', 'return', 'adjustment', 'in', 'out', 'sale_return'
  ));

-- ---------------------------------------------------------------------------
-- 2. Restore products.stock_quantity sync in post_stock_movement
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION post_stock_movement(
  p_product_id     uuid,
  p_godown_id      uuid,
  p_qty_change     numeric,
  p_movement_type  text,
  p_reference_type text,
  p_reference_id   uuid,
  p_reference_number text DEFAULT NULL,
  p_notes          text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_qty numeric;
  v_total   numeric;
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

  -- Keep products.stock_quantity in sync (sum across all godowns).
  SELECT COALESCE(SUM(quantity), 0) INTO v_total
    FROM godown_stock
   WHERE product_id = p_product_id;

  UPDATE products
     SET stock_quantity = v_total,
         updated_at     = now()
   WHERE id = p_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION post_stock_movement(uuid, uuid, numeric, text, text, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fix cancel_delivery_challan: use 'return' instead of 'sale_return'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_delivery_challan(p_dc_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc         RECORD;
  v_item       RECORD;
  v_active_inv int;
BEGIN
  IF p_dc_id IS NULL THEN
    RAISE EXCEPTION 'dc_id is required';
  END IF;

  SELECT * INTO v_dc FROM delivery_challans WHERE id = p_dc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', p_dc_id;
  END IF;
  IF v_dc.status = 'cancelled' THEN
    RAISE EXCEPTION 'Delivery challan % is already cancelled', v_dc.challan_number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_active_inv
    FROM invoices
   WHERE delivery_challan_id = p_dc_id AND status <> 'cancelled';
  IF v_active_inv > 0 THEN
    RAISE EXCEPTION 'Cannot cancel DC %: it has an active invoice. Cancel the invoice first.',
      v_dc.challan_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reverse stock for every dispatched line.
  FOR v_item IN
    SELECT product_id, godown_id, quantity
      FROM delivery_challan_items
     WHERE delivery_challan_id = p_dc_id
       AND godown_id   IS NOT NULL
       AND product_id  IS NOT NULL
  LOOP
    PERFORM post_stock_movement(
      v_item.product_id,
      v_item.godown_id,
      v_item.quantity,          -- positive → returns stock
      'return',                 -- valid movement_type (was 'sale_return' which violated constraint)
      'delivery_challan_cancel',
      p_dc_id,
      v_dc.challan_number,
      'Reverse DC ' || v_dc.challan_number
    );
  END LOOP;

  UPDATE delivery_challans
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_dc_id;

  -- Roll parent SO back to 'confirmed' so it can be re-dispatched.
  UPDATE sales_orders
     SET status = 'confirmed', updated_at = now()
   WHERE id = v_dc.sales_order_id
     AND status = 'dispatched';
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_challan(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. cancel_purchase_entry RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_purchase_entry(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_entry RECORD;
  v_mv    RECORD;
BEGIN
  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'entry_id is required';
  END IF;

  SELECT * INTO v_entry FROM purchase_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase entry % not found', p_entry_id;
  END IF;
  IF v_entry.status = 'cancelled' THEN
    RAISE EXCEPTION 'Purchase entry % is already cancelled', v_entry.entry_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reverse every stock movement posted for this purchase entry.
  FOR v_mv IN
    SELECT product_id, godown_id, quantity
      FROM stock_movements
     WHERE reference_type = 'purchase_entry'
       AND reference_id   = p_entry_id
       AND movement_type  = 'purchase'
  LOOP
    PERFORM post_stock_movement(
      v_mv.product_id,
      v_mv.godown_id,
      -v_mv.quantity,
      'adjustment',
      'purchase_entry_cancel',
      p_entry_id,
      v_entry.entry_number,
      'Reverse purchase ' || v_entry.entry_number
    );
  END LOOP;

  -- Reverse supplier ledger entry (only if a supplier is linked).
  IF v_entry.supplier_id IS NOT NULL THEN
    INSERT INTO ledger_entries (
      entry_date, entry_type, account_type,
      party_id, party_name,
      reference_type, reference_id,
      description, amount
    ) VALUES (
      CURRENT_DATE, 'debit', 'supplier',
      v_entry.supplier_id, v_entry.supplier_name,
      'purchase_entry_cancel', p_entry_id,
      'Cancel ' || v_entry.entry_number,
      v_entry.total_amount
    );

    -- Reduce supplier outstanding balance (only the unpaid portion).
    UPDATE suppliers
       SET balance    = GREATEST(0, balance - COALESCE(v_entry.outstanding_amount, 0)),
           updated_at = now()
     WHERE id = v_entry.supplier_id;
  END IF;

  UPDATE purchase_entries
     SET status     = 'cancelled',
         updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_purchase_entry(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. One-time reconciliation: sync products.stock_quantity from godown_stock
-- ---------------------------------------------------------------------------

UPDATE products p
   SET stock_quantity = (
         SELECT COALESCE(SUM(gs.quantity), 0)
           FROM godown_stock gs
          WHERE gs.product_id = p.id
       ),
       updated_at = now();
