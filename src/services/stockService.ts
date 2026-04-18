import { supabase } from '../lib/supabase';

export type StockMovementType = 'purchase' | 'dispatch' | 'adjustment';

export interface StockMovementItem {
  product_id: string;
  godown_id: string;
  quantity: number;
  unit_price?: number;
}

export interface ProcessStockMovementArgs {
  type: StockMovementType;
  items: StockMovementItem[];
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  notes?: string;
}

const MOVEMENT_TYPE_MAP: Record<StockMovementType, string> = {
  purchase: 'purchase',
  dispatch: 'sale',
  adjustment: 'adjustment',
};

function deltaFor(type: StockMovementType, quantity: number): number {
  if (type === 'purchase') return quantity;
  if (type === 'dispatch') return -quantity;
  return quantity;
}

export async function processStockMovement({
  type,
  items,
  reference_type,
  reference_id,
  reference_number,
  notes,
}: ProcessStockMovementArgs): Promise<void> {
  if (!items || items.length === 0) return;

  if (type === 'dispatch') {
    for (const item of items) {
      if (!item.product_id || !item.godown_id) {
        throw new Error('product_id and godown_id are required for dispatch');
      }
      const { data, error } = await supabase
        .from('godown_stock')
        .select('quantity')
        .eq('product_id', item.product_id)
        .eq('godown_id', item.godown_id)
        .maybeSingle();
      if (error) throw error;
      const available = data?.quantity ?? 0;
      if (available < item.quantity) {
        throw new Error(
          `Insufficient stock for product ${item.product_id} in godown ${item.godown_id}: ` +
          `requested ${item.quantity}, available ${available}`
        );
      }
    }
  }

  for (const item of items) {
    if (!item.product_id || !item.godown_id) {
      throw new Error('product_id and godown_id are required');
    }
    const delta = deltaFor(type, item.quantity);

    const { error: rpcErr } = await supabase.rpc('update_godown_stock', {
      p_product_id: item.product_id,
      p_godown_id: item.godown_id,
      p_delta: delta,
    });
    if (rpcErr) throw rpcErr;

    const { error: movementErr } = await supabase.from('stock_movements').insert({
      product_id: item.product_id,
      godown_id: item.godown_id,
      movement_type: MOVEMENT_TYPE_MAP[type],
      quantity: Math.abs(item.quantity),
      reference_type: reference_type ?? null,
      reference_id: reference_id ?? null,
      reference_number: reference_number ?? null,
      notes: notes ?? null,
    });
    if (movementErr) throw movementErr;
  }
}
