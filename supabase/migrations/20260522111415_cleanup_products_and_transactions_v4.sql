/*
  # Product Cleanup and Transaction Reset (v4)

  1. Clear all transaction line items first (FK references to products)
  2. Clear transaction headers
  3. Clear product FK references for products being deleted
  4. Delete inactive + "remove" products
  5. Title-case fix all remaining product names
  6. Reset document sequences (prefix column)
*/

-- Step 1: Clear transaction line items
DELETE FROM invoice_items;
DELETE FROM delivery_challan_items;
DELETE FROM sales_order_items;
DELETE FROM sales_return_items;
DELETE FROM drop_shipment_items;
DELETE FROM purchase_entry_items;
DELETE FROM purchase_order_items;
DELETE FROM godown_transfer_items;
DELETE FROM product_bundle_items;

-- Step 2: Clear transaction headers
DELETE FROM invoices;
DELETE FROM delivery_challans;
DELETE FROM sales_orders;

-- Step 3: Clear FK references for products being deleted
DELETE FROM stock_movements
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM godown_stock
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM product_variants
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM product_images
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM product_web_meta
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM product_units
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM customer_last_rates
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM customer_product_last_rates
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM customer_rate_cards
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM customer_rates
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM transaction_rates
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM inquiry_leads
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

DELETE FROM product_recommendations
WHERE product_id IN (SELECT id FROM products WHERE is_active = false OR name ILIKE '%remove%');

-- Step 4: Delete inactive and "remove" products
DELETE FROM products WHERE is_active = false OR name ILIKE '%remove%';

-- Step 5: Fix product names - Title Case, collapse internal whitespace/tabs
UPDATE products
SET name = trim(initcap(trim(regexp_replace(name, '\s+', ' ', 'g'))))
WHERE is_active = true;

-- Step 6: Reset document sequences for INV, DC, SO
DELETE FROM document_sequences
WHERE prefix IN ('INV', 'DC', 'SO');
