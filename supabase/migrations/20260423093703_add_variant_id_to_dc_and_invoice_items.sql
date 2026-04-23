/*
  # Add variant_id to delivery_challan_items and invoice_items

  ## Purpose
  Allows variant identity to flow from Sales Order → Delivery Challan → Invoice,
  preserving which variant each line item belongs to through the full document chain.

  ## Changes
  1. Modified Tables
    - `delivery_challan_items`: add `variant_id uuid` (nullable FK → product_variants.id)
    - `invoice_items`: add `variant_id uuid` (nullable FK → product_variants.id)
*/

ALTER TABLE delivery_challan_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL;
