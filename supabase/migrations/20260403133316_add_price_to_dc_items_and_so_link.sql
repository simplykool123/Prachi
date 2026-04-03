/*
  # Add pricing to delivery challan items and improve SO linking

  ## Changes:
  1. delivery_challan_items - add unit_price, total_price, discount_pct columns
     so a DC can carry price info (pulled from Sales Order)
  2. delivery_challans - add sales_order_id already exists; ensure no duplicate
  3. products - no changes needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_challan_items' AND column_name = 'unit_price'
  ) THEN
    ALTER TABLE delivery_challan_items ADD COLUMN unit_price numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_challan_items' AND column_name = 'total_price'
  ) THEN
    ALTER TABLE delivery_challan_items ADD COLUMN total_price numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'delivery_challan_items' AND column_name = 'discount_pct'
  ) THEN
    ALTER TABLE delivery_challan_items ADD COLUMN discount_pct numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
