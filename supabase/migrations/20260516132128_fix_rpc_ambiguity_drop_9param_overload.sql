/*
  # Fix RPC Ambiguity: Drop 9-param post_stock_movement overload

  ## Problem
  Two overloads of `post_stock_movement` exist: one with 8 params and one with 9 params (extra p_variant_id).
  When `cancel_purchase_entry` calls the 8-param version, Postgres cannot resolve which overload to use,
  causing: "function post_stock_movement(uuid, uuid, numeric, unknown, unknown, uuid, text, text) is not unique"

  ## Changes
  - Drop the 9-param overload (with p_variant_id uuid)
  - The 8-param version handles all stock movements; variant_id is stored via notes/references if needed
*/

DROP FUNCTION IF EXISTS post_stock_movement(uuid, uuid, numeric, text, text, uuid, text, text, uuid);
