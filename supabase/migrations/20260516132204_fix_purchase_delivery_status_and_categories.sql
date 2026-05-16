/*
  # Fix Purchase Delivery Status and Product Categories

  ## Changes

  ### 1. purchase_entries.delivery_status
  - Add 'Partial' as a valid delivery_status value
  - New flow: Pending → (Partial) → Delivered
  - Partial means some items received, some still pending

  ### 2. products.category CHECK constraint
  - Expand allowed categories to include all taxonomy used in productCategories.ts:
    Services, Crystals, Pyramids, Feng Shui, Vastu & Yantras, Handicraft, Dowsing
  - Existing values retained: Astro Products, Vastu Items, Healing Items, Gemstones

  ### 3. purchase_entry_items: add received_qty column
  - Track how many units of each item have been received
  - Allows partial receipts at the item level
*/

-- 1. Add 'Partial' to delivery_status enum
DO $$
BEGIN
  ALTER TABLE purchase_entries
    DROP CONSTRAINT IF EXISTS purchase_entries_delivery_status_check;
  ALTER TABLE purchase_entries
    ADD CONSTRAINT purchase_entries_delivery_status_check
    CHECK (delivery_status IN ('Pending', 'In Transit', 'Partial', 'Delivered', 'Delayed', 'Cancelled'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 2. Expand products.category CHECK constraint
DO $$
BEGIN
  ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_category_check;
  ALTER TABLE products
    ADD CONSTRAINT products_category_check
    CHECK (category IN (
      'Astro Products', 'Vastu Items', 'Healing Items', 'Gemstones',
      'Services', 'Crystals', 'Pyramids', 'Feng Shui',
      'Vastu & Yantras', 'Handicraft', 'Dowsing'
    ));
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- 3. Add received_qty to purchase_entry_items for partial receipt tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_entry_items' AND column_name = 'received_qty'
  ) THEN
    ALTER TABLE purchase_entry_items ADD COLUMN received_qty numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 4. Add expected_delivery_date to purchase_entries if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_entries' AND column_name = 'expected_delivery_date'
  ) THEN
    ALTER TABLE purchase_entries ADD COLUMN expected_delivery_date date;
  END IF;
END $$;
