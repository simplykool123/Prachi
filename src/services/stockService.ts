import { supabase } from '../lib/supabase';

/**
 * StockMovementType — semantic operation type.
 *
 * purchase      — receiving stock from a supplier (+qty)
 * dispatch      — outbound on sale (-qty)
 * return        — customer return into stock (+qty)
 * adjustment    — signed delta for opening stock / physical count correction
 * transfer_in   — second leg of a godown transfer (+qty)
 * transfer_out  — first leg of a godown transfer (-qty)
 */
export type StockMovementType =
  | 'purchase'
  | 'dispatch'
  | 'return'
  | 'adjustment'
  | 'transfer_in'
  | 'transfer_out';

export interface StockMovementItem {
  product_id: string;
  godown_id: string;
  /**
   * For purchase / dispatch / return / transfer_in / transfer_out: magnitude (>= 0).
   * For adjustment: signed delta (may be negative).
   */
  quantity: number;
  unit_price?: number;
  variant_id?: string | null;
}

export interface ProcessStockMovementArgs {
  type: StockMovementType;
  items: StockMovementItem[];
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  notes?: string;
}

/** Maps our semantic type to the `movement_type` column value stored in stock_movements. */
const MOVEMENT_TYPE_COLUMN: Record<StockMovementType, string> = {
  purchase: 'purchase',
  dispatch: 'sale',
  return: 'return',
  adjustment: 'adjustment',
  transfer_in: 'in',
  transfer_out: 'out',
};

function signedDelta(type: StockMovementType, quantity: number): number {
  switch (type) {
    case 'purchase':
    case 'return':
    case 'transfer_in':
      return Math.abs(quantity);
    case 'dispatch':
    case 'transfer_out':
      return -Math.abs(quantity);
    case 'adjustment':
      return quantity; // caller-signed
  }
}

/**
 * The ONE and ONLY entry point for stock changes from application code.
 *
 * Every item is routed through the `post_stock_movement` Postgres RPC,
 * which atomically:
 *   1. upserts godown_stock with delta arithmetic
 *   2. raises exception if the resulting quantity would be negative
 *   3. inserts into stock_movements
 *
 * No caller may touch godown_stock or stock_movements directly.
 */
export async function processStockMovement({
  type,
  items,
  reference_type,
  reference_id,
  reference_number,
  notes,
}: ProcessStockMovementArgs): Promise<void> {
  if (!items || items.length === 0) return;

  for (const item of items) {
    if (!item.product_id || !item.godown_id) {
      throw new Error('product_id and godown_id are required for every stock item');
    }
    if (type !== 'adjustment' && item.quantity <= 0) {
      throw new Error(`quantity must be positive for ${type}; got ${item.quantity}`);
    }

    const delta = signedDelta(type, item.quantity);

    const { error } = await supabase.rpc('post_stock_movement', {
      p_product_id: item.product_id,
      p_godown_id: item.godown_id,
      p_qty_change: delta,
      p_movement_type: MOVEMENT_TYPE_COLUMN[type],
      p_reference_type: reference_type ?? null,
      p_reference_id: reference_id ?? null,
      p_reference_number: reference_number ?? null,
      p_notes: notes ?? null,
      p_variant_id: item.variant_id ?? null,
    });
    if (error) throw error;
  }
}
