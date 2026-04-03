/*
  # Add Customer Documents Table

  1. New Tables
    - `customer_documents`
      - `id` (uuid, primary key)
      - `customer_id` (uuid, foreign key to customers)
      - `file_name` (text) - original filename
      - `file_url` (text) - public URL from storage
      - `file_path` (text) - storage path for deletion
      - `file_size` (bigint) - size in bytes
      - `file_type` (text) - MIME type
      - `tag` (text) - category: Palm/Floor Plan/Report/Photo/Other
      - `notes` (text) - optional notes about the document
      - `uploaded_by` (uuid) - user who uploaded
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Authenticated users can manage documents for their org
*/

CREATE TABLE IF NOT EXISTS customer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL DEFAULT '',
  file_path text NOT NULL DEFAULT '',
  file_size bigint DEFAULT 0,
  file_type text DEFAULT '',
  tag text DEFAULT 'Other',
  notes text DEFAULT '',
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Authenticated users can view customer documents'
  ) THEN
    CREATE POLICY "Authenticated users can view customer documents"
      ON customer_documents FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Authenticated users can insert customer documents'
  ) THEN
    CREATE POLICY "Authenticated users can insert customer documents"
      ON customer_documents FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Authenticated users can update customer documents'
  ) THEN
    CREATE POLICY "Authenticated users can update customer documents"
      ON customer_documents FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL)
      WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_documents' AND policyname = 'Authenticated users can delete customer documents'
  ) THEN
    CREATE POLICY "Authenticated users can delete customer documents"
      ON customer_documents FOR DELETE
      TO authenticated
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
