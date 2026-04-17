import { supabase } from './supabase';

export async function getDefaultGodownId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('godowns')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getGodowns() {
  const { data, error } = await supabase
    .from('godowns')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getGodownStock(godownId: string) {
  const { data, error } = await supabase
    .from('godown_stock')
    .select('*, products(id, name, sku, unit, selling_price, low_stock_alert)')
    .eq('godown_id', godownId);
  if (error) throw error;
  return data || [];
}

export async function getAllGodownStockSummary() {
  const { data, error } = await supabase
    .from('godown_stock')
    .select('*, godowns(name), products(id, name, sku, unit, low_stock_alert, selling_price)');
  if (error) throw error;
  return data || [];
}
