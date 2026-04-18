/*
  # Fix B2B RPC validation and add b2b_price to sales_order_items

  1. Changes
    - Remove ship_to_customer_id requirement from create_sales_order RPC
      B2B orders now use manual ship-to address, not a linked customer
    - Add b2b_price column (nullable numeric) to sales_order_items
      Used only for B2B print output, never for totals or accounting
    - Update RPC to save b2b_price per item
    - Total calculation unchanged: qty × unit_price only

  2. Notes
    - b2b_price is display-only for B2B print layer
    - No accounting, stock, or invoice logic is affected
    - Discount fields remain in DB but are no longer used in UI
*/

ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS b2b_price numeric;

CREATE OR REPLACE FUNCTION create_sales_order(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_so_id       uuid;
  v_items       jsonb;
  v_item        jsonb;
  v_subtotal    numeric := 0;
  v_total       numeric;
  v_customer_id uuid;
  v_is_b2b      boolean;
BEGIN
  v_customer_id := NULLIF(p_payload->>'customer_id', '')::uuid;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_id is required';
  END IF;

  v_items := p_payload->'items';
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'at least one item is required';
  END IF;

  v_is_b2b := COALESCE((p_payload->>'is_b2b')::boolean, false);

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF (v_item->>'product_id') IS NULL OR (v_item->>'quantity')::numeric <= 0 THEN
      RAISE EXCEPTION 'each item needs product_id and positive quantity';
    END IF;
    v_subtotal := v_subtotal
      + (v_item->>'quantity')::numeric
      * (v_item->>'unit_price')::numeric;
  END LOOP;

  v_total := v_subtotal
    + COALESCE((p_payload->>'courier_charges')::numeric, 0)
    + COALESCE((p_payload->>'tax_amount')::numeric, 0)
    - COALESCE((p_payload->>'discount_amount')::numeric, 0);

  INSERT INTO sales_orders (
    so_number, customer_id, customer_name, customer_phone, customer_address,
    customer_address2, customer_city, customer_state, customer_pincode,
    so_date, delivery_date, status, subtotal, tax_amount, courier_charges,
    discount_amount, total_amount, notes, godown_id, company_id,
    is_b2b, ship_to_customer_id,
    ship_to_name, ship_to_address1, ship_to_address2,
    ship_to_city, ship_to_state, ship_to_pin, ship_to_phone
  ) VALUES (
    p_payload->>'so_number',
    v_customer_id,
    p_payload->>'customer_name',
    p_payload->>'customer_phone',
    p_payload->>'customer_address',
    p_payload->>'customer_address2',
    p_payload->>'customer_city',
    p_payload->>'customer_state',
    p_payload->>'customer_pincode',
    NULLIF(p_payload->>'so_date', '')::date,
    NULLIF(p_payload->>'delivery_date', '')::date,
    'confirmed',
    v_subtotal,
    COALESCE((p_payload->>'tax_amount')::numeric, 0),
    COALESCE((p_payload->>'courier_charges')::numeric, 0),
    COALESCE((p_payload->>'discount_amount')::numeric, 0),
    v_total,
    p_payload->>'notes',
    NULLIF(p_payload->>'godown_id', '')::uuid,
    NULLIF(p_payload->>'company_id', '')::uuid,
    v_is_b2b,
    NULL,
    NULLIF(p_payload->>'ship_to_name', ''),
    NULLIF(p_payload->>'ship_to_address1', ''),
    NULLIF(p_payload->>'ship_to_address2', ''),
    NULLIF(p_payload->>'ship_to_city', ''),
    NULLIF(p_payload->>'ship_to_state', ''),
    NULLIF(p_payload->>'ship_to_pin', ''),
    NULLIF(p_payload->>'ship_to_phone', '')
  ) RETURNING id INTO v_so_id;

  INSERT INTO sales_order_items (
    sales_order_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct, total_price, godown_id, b2b_price
  )
  SELECT v_so_id,
    (item->>'product_id')::uuid,
    item->>'product_name',
    item->>'unit',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    0,
    (item->>'quantity')::numeric * (item->>'unit_price')::numeric,
    NULLIF(item->>'godown_id', '')::uuid,
    NULLIF(item->>'b2b_price', '')::numeric
  FROM jsonb_array_elements(v_items) AS item;

  RETURN v_so_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_sales_order(jsonb) TO authenticated;
