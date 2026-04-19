/*
  # Invoice idempotency + DC status derived from invoice existence

  ## Changes

  1. Make create_invoice idempotent.
     If an active invoice already exists for the given DC, return its id
     instead of raising a constraint violation. This prevents duplicate-
     invoice errors when the user double-submits the form or navigates back.

  2. Add trigger trg_sync_dc_status that automatically keeps
     delivery_challans.status in sync with invoice existence:
       active invoice exists  → status = 'invoiced'
       no active invoice      → status = 'created'
     The trigger fires on INSERT / UPDATE / DELETE on invoices, making
     DC status a derived fact rather than a manually managed flag.
*/

-- ---------------------------------------------------------------------------
-- 1. Idempotent create_invoice
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_invoice(
  p_delivery_challan_id uuid,
  p_payload             jsonb
) RETURNS uuid
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

  -- DC must be in 'created' state to accept a new invoice.
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
    v_line_base    := v_item.quantity * v_item.unit_price
                      * (1 - COALESCE(v_item.discount_pct, 0) / 100);
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

  INSERT INTO invoice_items (
    invoice_id, product_id, product_name, description, unit, quantity,
    unit_price, discount_pct, tax_pct, total_price, godown_id
  )
  SELECT v_invoice_id,
    dci.product_id, dci.product_name, NULL, dci.unit, dci.quantity,
    dci.unit_price,
    COALESCE(dci.discount_pct, 0),
    COALESCE((v_tax_map->>dci.id::text)::numeric, 0),
    dci.quantity * dci.unit_price
      * (1 - COALESCE(dci.discount_pct, 0) / 100)
      * (1 + COALESCE((v_tax_map->>dci.id::text)::numeric, 0) / 100),
    dci.godown_id
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

GRANT EXECUTE ON FUNCTION create_invoice(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Trigger: derive DC status from invoice existence
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_fn_sync_dc_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_dc_id uuid;
BEGIN
  v_dc_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.delivery_challan_id
                  ELSE NEW.delivery_challan_id END;

  IF v_dc_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices
     WHERE delivery_challan_id = v_dc_id AND status <> 'cancelled'
  ) THEN
    UPDATE delivery_challans
       SET status = 'invoiced', updated_at = now()
     WHERE id = v_dc_id AND status <> 'invoiced';
  ELSE
    -- No active invoice → revert to 'created' (un-invoiced state)
    UPDATE delivery_challans
       SET status = 'created', updated_at = now()
     WHERE id = v_dc_id AND status = 'invoiced';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_dc_status ON invoices;
CREATE TRIGGER trg_sync_dc_status
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_fn_sync_dc_status();
