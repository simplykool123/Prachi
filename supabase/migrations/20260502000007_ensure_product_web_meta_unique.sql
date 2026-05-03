/*
  # Ensure UNIQUE(product_id) exists on product_web_meta

  Migration `20260502000001_create_website_tables.sql` declares the column
  with `... UNIQUE`, but it uses `CREATE TABLE IF NOT EXISTS`. On databases
  where `product_web_meta` was created before that declaration was added,
  `IF NOT EXISTS` is a no-op and the table never received the UNIQUE
  constraint. As a result, `INSERT ... ON CONFLICT (product_id)` (and the
  Supabase JS `.upsert(..., { onConflict: 'product_id' })` call it backs)
  fails with:

      42P10  there is no unique or exclusion constraint matching the
             ON CONFLICT specification

  This migration fixes that by:
  1. Cleaning up any duplicate rows per product_id (keeps the most recently
     updated one, deletes older copies). Safe because nothing else references
     `product_web_meta.id`.
  2. Adding the missing UNIQUE constraint when it does not already exist.

  Idempotent: the DO block checks pg_constraint before attempting to add the
  constraint, so re-running this migration is a no-op.
*/

-- 1. De-duplicate: keep the row with the latest updated_at (then created_at)
--    per product_id; delete the rest.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY product_id
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM public.product_web_meta
)
DELETE FROM public.product_web_meta pwm
USING ranked
WHERE pwm.id = ranked.id
  AND ranked.rn > 1;

-- 2. Add the UNIQUE constraint if it isn't already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'product_web_meta'
      AND c.contype = 'u'
      AND c.conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = t.oid AND attname = 'product_id')
      ]
  ) THEN
    ALTER TABLE public.product_web_meta
      ADD CONSTRAINT product_web_meta_product_id_key UNIQUE (product_id);
  END IF;
END $$;
