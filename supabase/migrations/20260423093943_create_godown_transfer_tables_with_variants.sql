/*
  # Create godown_transfers and godown_transfer_items tables

  ## Purpose
  Enables stock transfer tracking between godowns with full variant support.

  ## New Tables
  1. `godown_transfers` — header record for a transfer event
  2. `godown_transfer_items` — individual product/variant lines per transfer
    - `variant_id` tracks which variant was transferred
    - `variant_name` is denormalized for display without joins

  ## Security
  - RLS enabled on both tables
  - Authenticated users can read/write (internal operational tables)
*/

CREATE TABLE IF NOT EXISTS godown_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL UNIQUE,
  transfer_date date NOT NULL,
  from_godown_id uuid REFERENCES godowns(id),
  from_godown_name text NOT NULL DEFAULT '',
  to_godown_id uuid REFERENCES godowns(id),
  to_godown_name text NOT NULL DEFAULT '',
  reason text,
  notes text,
  status text NOT NULL DEFAULT 'completed',
  total_items integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS godown_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES godown_transfers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text NOT NULL DEFAULT 'pcs',
  quantity numeric NOT NULL DEFAULT 0,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  variant_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE godown_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE godown_transfer_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'godown_transfers' AND policyname = 'Authenticated users can manage transfers'
  ) THEN
    CREATE POLICY "Authenticated users can manage transfers"
      ON godown_transfers FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'godown_transfers' AND policyname = 'Authenticated users can insert transfers'
  ) THEN
    CREATE POLICY "Authenticated users can insert transfers"
      ON godown_transfers FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'godown_transfer_items' AND policyname = 'Authenticated users can manage transfer items'
  ) THEN
    CREATE POLICY "Authenticated users can manage transfer items"
      ON godown_transfer_items FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'godown_transfer_items' AND policyname = 'Authenticated users can insert transfer items'
  ) THEN
    CREATE POLICY "Authenticated users can insert transfer items"
      ON godown_transfer_items FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;
