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

// ─── Gemstone piece helpers ───────────────────────────────────────────────────
// These are the only functions allowed to write to product_units.

/** Insert new gemstone pieces and increment godown_stock by the piece count. */
export async function addGemPieces(args: {
  productId: string;
  pieces: Array<{ weight: number; weightUnit: 'g' | 'kg' | 'carat'; godownId: string | null }>;
  movementType?: 'purchase' | 'return';
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
}): Promise<void> {
  if (args.pieces.length === 0) return;

  const { error } = await supabase.from('product_units').insert(
    args.pieces.map(p => ({
      product_id: args.productId,
      weight: p.weight,
      weight_unit: p.weightUnit,
      status: 'in_stock' as const,
      godown_id: p.godownId,
    }))
  );
  if (error) throw error;

  // Increment godown_stock per godown, grouped by godownId
  const byGodown: Record<string, number> = {};
  for (const p of args.pieces) {
    if (p.godownId) byGodown[p.godownId] = (byGodown[p.godownId] || 0) + 1;
  }
  for (const [godownId, count] of Object.entries(byGodown)) {
    await processStockMovement({
      type: args.movementType ?? 'purchase',
      items: [{ product_id: args.productId, godown_id: godownId, quantity: count }],
      reference_type: args.referenceType,
      reference_id: args.referenceId,
      reference_number: args.referenceNumber,
      notes: args.notes,
    });
  }
}

/** Delete gemstone pieces and decrement godown_stock by the piece count. */
export async function removeGemPieces(args: {
  pieceIds: string[];
  productId: string;
  referenceType?: string;
  notes?: string;
}): Promise<void> {
  if (args.pieceIds.length === 0) return;

  // Read current godown assignments before deleting
  const { data: pieces, error: fetchErr } = await supabase
    .from('product_units')
    .select('id, godown_id')
    .in('id', args.pieceIds);
  if (fetchErr) throw fetchErr;

  const { error: delErr } = await supabase.from('product_units').delete().in('id', args.pieceIds);
  if (delErr) throw delErr;

  // Decrement godown_stock per godown
  const byGodown: Record<string, number> = {};
  for (const p of pieces || []) {
    if (p.godown_id) byGodown[p.godown_id] = (byGodown[p.godown_id] || 0) + 1;
  }
  for (const [godownId, count] of Object.entries(byGodown)) {
    await processStockMovement({
      type: 'adjustment',
      items: [{ product_id: args.productId, godown_id: godownId, quantity: -count }],
      reference_type: args.referenceType,
      notes: args.notes,
    });
  }
}

/** Update piece weight and/or godown — metadata only, no stock count change. */
export async function updateGemPieceMetadata(args: {
  pieceId: string;
  weight?: number;
  godownId?: string | null;
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (args.weight !== undefined) updates.weight = args.weight;
  if (args.godownId !== undefined) updates.godown_id = args.godownId;
  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase.from('product_units').update(updates).eq('id', args.pieceId);
  if (error) throw error;
}

/**
 * Mark specific pieces as sold/reserved against a reference (e.g. a sales order).
 * Does NOT change godown_stock — the actual stock deduction happens at dispatch.
 */
export async function markGemPiecesSold(args: {
  pieceIds: string[];
  referenceType: string;
  referenceId: string;
}): Promise<void> {
  if (args.pieceIds.length === 0) return;
  const { error } = await supabase.from('product_units').update({
    status: 'sold',
    sold_at: new Date().toISOString(),
    sold_reference_type: args.referenceType,
    sold_reference_id: args.referenceId,
  }).in('id', args.pieceIds);
  if (error) throw error;
}

/**
 * Revert all pieces that were marked sold against a reference back to in_stock.
 * Used when a sales order is edited, deleted, or cancelled.
 */
export async function revertGemPiecesSold(args: {
  referenceType: string;
  referenceId: string;
}): Promise<void> {
  const { error } = await supabase.from('product_units').update({
    status: 'in_stock',
    sold_at: null,
    sold_reference_type: null,
    sold_reference_id: null,
  }).eq('sold_reference_type', args.referenceType).eq('sold_reference_id', args.referenceId);
  if (error) throw error;
}

// ─── Variant stock helper ─────────────────────────────────────────────────────

/**
 * Replace a variant's godown allocation with a new godown + quantity.
 * Zeroes out any existing rows for this variant (across all godowns) via
 * signed adjustments through the RPC, then sets the new allocation.
 * This is the only safe way to update variant stock from the UI.
 */
export async function setVariantGodownStock(args: {
  productId: string;
  variantId: string;
  newGodownId: string;
  newQty: number;
}): Promise<void> {
  // Read existing rows for this variant
  const { data: existing, error: fetchErr } = await supabase
    .from('godown_stock')
    .select('godown_id, quantity')
    .eq('product_id', args.productId)
    .eq('variant_id', args.variantId);
  if (fetchErr) throw fetchErr;

  // Zero out each existing row
  for (const row of existing || []) {
    if ((row.quantity || 0) !== 0) {
      await processStockMovement({
        type: 'adjustment',
        items: [{
          product_id: args.productId,
          godown_id: row.godown_id,
          quantity: -(row.quantity || 0),
          variant_id: args.variantId,
        }],
        reference_type: 'stock_edit',
        notes: 'Variant stock reassignment',
      });
    }
  }

  // Set the new allocation
  if (args.newQty > 0) {
    await processStockMovement({
      type: 'adjustment',
      items: [{
        product_id: args.productId,
        godown_id: args.newGodownId,
        quantity: args.newQty,
        variant_id: args.variantId,
      }],
      reference_type: 'stock_edit',
      notes: 'Variant stock reassignment',
    });
  }
}
