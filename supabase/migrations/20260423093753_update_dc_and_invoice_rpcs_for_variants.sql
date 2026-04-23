/*
  # Update create_delivery_challan and create_invoice RPCs for variant support

  ## Changes
  1. `create_delivery_challan`
    - Copies `variant_id` from sales_order_items into delivery_challan_items
    - Passes `variant_id` to `post_stock_movement` so variant stock is deducted from the correct godown_stock row

  2. `create_invoice`
    - Copies `variant_id` from delivery_challan_items into invoice_items
*/

CREATE OR REPLACE FUNCTION public.create_delivery_challan(p_sales_order_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc_id          uuid;
  v_so             RECORD;
  v_item           RECORD;
  v_challan_number text;
BEGIN
  IF p_sales_order_id IS NULL THEN
    RAISE EXCEPTION 'sales_order_id is required';
  END IF;

  SELECT * INTO v_so FROM sales_orders WHERE id = p_sales_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order % not found', p_sales_order_id;
  END IF;
  IF v_so.status NOT IN ('draft', 'confirmed') THEN
    RAISE EXCEPTION 'Sales order % cannot be dispatched (status: %)',
      v_so.so_number, v_so.status
    USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery_challans
    WHERE sales_order_id = p_sales_order_id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Sales order % already has an active delivery challan',
      v_so.so_number
    USING ERRCODE = 'unique_violation';
  END IF;

  v_challan_number := COALESCE(p_payload->>'challan_number', '');

  INSERT INTO delivery_challans (
    challan_number, sales_order_id, customer_id, customer_name, customer_phone,
    customer_address, customer_address2, customer_city, customer_state, customer_pincode,
    challan_date, dispatch_mode, courier_company, tracking_number, status, notes,
    company_id,
    is_b2b, ship_to_name, ship_to_address1, ship_to_address2,
    ship_to_city, ship_to_state, ship_to_pin, ship_to_phone
  )
  SELECT
    v_challan_number, p_sales_order_id, v_so.customer_id, v_so.customer_name, v_so.customer_phone,
    v_so.customer_address, v_so.customer_address2, v_so.customer_city, v_so.customer_state, v_so.customer_pincode,
    COALESCE(NULLIF(p_payload->>'challan_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'dispatch_mode', ''),
    NULLIF(p_payload->>'courier_company', ''),
    NULLIF(p_payload->>'tracking_number', ''),
    'created',
    NULLIF(p_payload->>'notes', ''),
    v_so.company_id,
    COALESCE(v_so.is_b2b, false),
    NULLIF(v_so.ship_to_name, ''),
    NULLIF(v_so.ship_to_address1, ''),
    NULLIF(v_so.ship_to_address2, ''),
    NULLIF(v_so.ship_to_city, ''),
    NULLIF(v_so.ship_to_state, ''),
    NULLIF(v_so.ship_to_pin, ''),
    NULLIF(v_so.ship_to_phone, '')
  RETURNING id INTO v_dc_id;

  -- Copy items including variant_id
  INSERT INTO delivery_challan_items (
    delivery_challan_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct, total_price, godown_id, gemstone_weight, variant_id
  )
  SELECT v_dc_id, product_id, product_name, unit, quantity,
    unit_price, discount_pct,
    CASE
      WHEN gemstone_weight IS NOT NULL AND gemstone_weight > 0
        THEN gemstone_weight * unit_price
      ELSE total_price
    END,
    godown_id,
    gemstone_weight,
    variant_id
  FROM sales_order_items WHERE sales_order_id = p_sales_order_id;

  -- Deduct stock per item, passing variant_id so the correct godown_stock row is updated
  FOR v_item IN
    SELECT product_id, godown_id, quantity, variant_id
    FROM sales_order_items
    WHERE sales_order_id = p_sales_order_id
      AND godown_id IS NOT NULL AND product_id IS NOT NULL
  LOOP
    PERFORM post_stock_movement(
      v_item.product_id, v_item.godown_id, -v_item.quantity,
      'sale', 'delivery_challan', v_dc_id,
      v_challan_number, 'DC ' || v_challan_number,
      v_item.variant_id
    );
  END LOOP;

  UPDATE sales_orders SET status = 'dispatched', updated_at = now()
  WHERE id = p_sales_order_id;

  RETURN v_dc_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.create_invoice(p_delivery_challan_id uuid, p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id     uuid;
  v_existing_id    uuid;
  v_dc             RECORD;
  v_item           RECORD;
  v_tax_map        jsonb;
  v_subtotal       numeric := 0;
  v_tax            numeric := 0;
  v_total          numeric;
  v_line_base      numeric;
  v_line_tax_pct   numeric;
  v_invoice_number text;
  v_courier        numeric;
  v_discount       numeric;
BEGIN
  IF p_delivery_challan_id IS NULL THEN
    RAISE EXCEPTION 'delivery_challan_id is required';
  END IF;

  SELECT * INTO v_dc FROM delivery_challans WHERE id = p_delivery_challan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery challan % not found', p_delivery_challan_id;
  END IF;

  -- Idempotency: return existing active invoice if one already exists.
  SELECT id INTO v_existing_id
  FROM invoices
  WHERE delivery_challan_id = p_delivery_challan_id AND status <> 'cancelled'
  LIMIT 1;
  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  IF v_dc.status <> 'created' THEN
    RAISE EXCEPTION 'Delivery challan % cannot be invoiced (status: %)',
      v_dc.challan_number, v_dc.status
    USING ERRCODE = 'check_violation';
  END IF;

  v_tax_map  := COALESCE(p_payload->'item_tax', '{}'::jsonb);
  v_courier  := COALESCE((p_payload->>'courier_charges')::numeric, 0);
  v_discount := COALESCE((p_payload->>'discount_amount')::numeric, 0);

  FOR v_item IN
    SELECT * FROM delivery_challan_items WHERE delivery_challan_id = p_delivery_challan_id
  LOOP
    IF v_item.gemstone_weight IS NOT NULL AND v_item.gemstone_weight > 0 THEN
      v_line_base := v_item.gemstone_weight * v_item.unit_price;
    ELSE
      v_line_base := v_item.quantity * v_item.unit_price
        * (1 - COALESCE(v_item.discount_pct, 0) / 100);
    END IF;
    v_line_tax_pct := COALESCE((v_tax_map->>v_item.id::text)::numeric, 0);
    v_subtotal     := v_subtotal + v_line_base;
    v_tax          := v_tax + v_line_base * v_line_tax_pct / 100;
  END LOOP;

  v_total          := v_subtotal + v_tax + v_courier - v_discount;
  v_invoice_number := COALESCE(p_payload->>'invoice_number', '');

  INSERT INTO invoices (
    invoice_number, sales_order_id, delivery_challan_id,
    customer_id, customer_name, customer_phone,
    customer_address, customer_address2, customer_city, customer_state, customer_pincode,
    invoice_date, due_date, status,
    subtotal, tax_amount, courier_charges, discount_amount, total_amount,
    paid_amount, outstanding_amount,
    payment_terms, notes, bank_name, account_number, ifsc_code, company_id
  ) VALUES (
    v_invoice_number, v_dc.sales_order_id, p_delivery_challan_id,
    v_dc.customer_id, v_dc.customer_name, v_dc.customer_phone,
    v_dc.customer_address, v_dc.customer_address2, v_dc.customer_city,
    v_dc.customer_state, v_dc.customer_pincode,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE),
    NULLIF(p_payload->>'due_date', '')::date,
    'issued',
    v_subtotal, v_tax, v_courier, v_discount, v_total,
    0, v_total,
    p_payload->>'payment_terms', p_payload->>'notes',
    p_payload->>'bank_name', p_payload->>'account_number', p_payload->>'ifsc_code',
    v_dc.company_id
  ) RETURNING id INTO v_invoice_id;

  -- Copy items including variant_id
  INSERT INTO invoice_items (
    invoice_id, product_id, product_name, description, unit, quantity,
    unit_price, discount_pct, tax_pct, total_price, godown_id, gemstone_weight, variant_id
  )
  SELECT v_invoice_id,
    dci.product_id, dci.product_name, NULL, dci.unit, dci.quantity,
    dci.unit_price,
    COALESCE(dci.discount_pct, 0),
    COALESCE((v_tax_map->>dci.id::text)::numeric, 0),
    CASE
      WHEN dci.gemstone_weight IS NOT NULL AND dci.gemstone_weight > 0
        THEN dci.gemstone_weight * dci.unit_price
          * (1 + COALESCE((v_tax_map->>dci.id::text)::numeric, 0) / 100)
      ELSE dci.quantity * dci.unit_price
        * (1 - COALESCE(dci.discount_pct, 0) / 100)
        * (1 + COALESCE((v_tax_map->>dci.id::text)::numeric, 0) / 100)
    END,
    dci.godown_id,
    dci.gemstone_weight,
    dci.variant_id
  FROM delivery_challan_items dci WHERE dci.delivery_challan_id = p_delivery_challan_id;

  INSERT INTO ledger_entries (
    customer_id, party_id, party_name, account_type, entry_type,
    amount, description, reference_type, reference_id, entry_date
  ) VALUES (
    v_dc.customer_id, v_dc.customer_id, COALESCE(v_dc.customer_name, ''),
    'customer', 'debit', v_total,
    'Invoice ' || v_invoice_number,
    'invoice', v_invoice_id,
    COALESCE(NULLIF(p_payload->>'invoice_date', '')::date, CURRENT_DATE)
  );

  UPDATE delivery_challans SET status = 'invoiced', updated_at = now()
  WHERE id = p_delivery_challan_id;

  RETURN v_invoice_id;
END;
$$;
