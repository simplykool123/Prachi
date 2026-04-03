/*
  # Sync godown_stock from products for Main Warehouse

  ## What this does
  - Inserts a godown_stock row for every active product into Main Warehouse
  - Uses the product's current stock_quantity as the godown quantity
  - Uses ON CONFLICT to avoid duplicates (safe to re-run)
  - Also adds a DB trigger to keep godown_stock in sync when products.stock_quantity changes
    (for single-godown setups this is the practical real-world approach)

  ## Real-world logic
  In a single-warehouse setup, the godown simply mirrors the master product stock.
  In multi-warehouse setups, each godown tracks its own quantities separately.
*/

-- 1. Populate godown_stock for Main Warehouse with current product stock
INSERT INTO godown_stock (godown_id, product_id, quantity)
SELECT 
  g.id,
  p.id,
  p.stock_quantity
FROM godowns g
CROSS JOIN products p
WHERE g.name = 'Main Warehouse'
  AND p.is_active = true
ON CONFLICT (godown_id, product_id) DO UPDATE 
  SET quantity = EXCLUDED.quantity,
      updated_at = now();

-- 2. Create a function that syncs godown_stock when a product's stock_quantity changes
CREATE OR REPLACE FUNCTION sync_godown_stock_on_product_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update quantity in all godown_stock rows for this product
  -- (for single-godown: keeps it in sync; for multi-godown: pro-rata not applied here)
  IF NEW.stock_quantity <> OLD.stock_quantity THEN
    UPDATE godown_stock
    SET quantity = NEW.stock_quantity,
        updated_at = now()
    WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach trigger to products table (drop if exists first)
DROP TRIGGER IF EXISTS trg_sync_godown_stock ON products;
CREATE TRIGGER trg_sync_godown_stock
  AFTER UPDATE OF stock_quantity ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_godown_stock_on_product_update();
