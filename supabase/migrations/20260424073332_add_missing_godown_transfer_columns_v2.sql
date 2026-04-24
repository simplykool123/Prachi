/*
  # Add missing columns to godown_transfers table

  The godown_transfers table exists but is missing several columns needed
  by the GodownTransfer UI.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'godown_transfers' AND column_name = 'transfer_number') THEN
    ALTER TABLE godown_transfers ADD COLUMN transfer_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'godown_transfers' AND column_name = 'transfer_date') THEN
    ALTER TABLE godown_transfers ADD COLUMN transfer_date date NOT NULL DEFAULT CURRENT_DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'godown_transfers' AND column_name = 'notes') THEN
    ALTER TABLE godown_transfers ADD COLUMN notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'godown_transfers' AND column_name = 'status') THEN
    ALTER TABLE godown_transfers ADD COLUMN status text NOT NULL DEFAULT 'completed';
  END IF;
END $$;
