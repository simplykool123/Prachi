/*
  # Resync products.stock_quantity from godown_stock

  products.stock_quantity is a denormalized total that must always equal
  SUM(godown_stock.quantity) for each product.  Some code paths (variant stock
  edits in Inventory.tsx) historically wrote directly to godown_stock without
  going through the post_stock_movement RPC, leaving products.stock_quantity
  out of sync.

  This migration performs a one-time reconciliation so every product's
  stock_quantity matches the actual godown totals.
*/

UPDATE products p
SET
  stock_quantity = COALESCE(g.total_qty, 0),
  updated_at     = now()
FROM (
  SELECT product_id, SUM(quantity) AS total_qty
  FROM godown_stock
  GROUP BY product_id
) g
WHERE p.id = g.product_id
  AND p.stock_quantity IS DISTINCT FROM COALESCE(g.total_qty, 0);

-- Zero out products that have no godown_stock rows at all
UPDATE products
SET stock_quantity = 0, updated_at = now()
WHERE stock_quantity <> 0
  AND id NOT IN (SELECT DISTINCT product_id FROM godown_stock);
