import { supabase } from '../lib/supabase';

export interface SalesOrderItemInput {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  godown_id?: string | null;
}

export interface CreateSalesOrderPayload {
  so_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_address2?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  so_date: string;
  delivery_date?: string | null;
  tax_amount?: number;
  courier_charges?: number;
  discount_amount?: number;
  notes?: string;
  godown_id?: string | null;
  company_id?: string | null;
  is_b2b?: boolean;
  ship_to_customer_id?: string | null;
  ship_to_name?: string | null;
  ship_to_address1?: string | null;
  ship_to_address2?: string | null;
  ship_to_city?: string | null;
  ship_to_state?: string | null;
  ship_to_pin?: string | null;
  ship_to_phone?: string | null;
  items: SalesOrderItemInput[];
}

export interface CreateDeliveryChallanPayload {
  challan_number: string;
  challan_date: string;
  dispatch_mode?: string;
  courier_company?: string;
  tracking_number?: string;
  notes?: string;
}

export interface CreateInvoicePayload {
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null;
  payment_terms?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  notes?: string;
  courier_charges?: number;
  discount_amount?: number;
  /**
   * Map of delivery_challan_items.id → tax_pct. Keys are item UUIDs
   * returned by listing the DC; values are the GST% to apply.
   */
  item_tax?: Record<string, number>;
}

export async function createSalesOrder(payload: CreateSalesOrderPayload): Promise<string> {
  const { data, error } = await supabase.rpc('create_sales_order', { p_payload: payload });
  if (error) throw error;
  return data as string;
}

export async function createDeliveryChallan(
  salesOrderId: string,
  payload: CreateDeliveryChallanPayload,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_delivery_challan', {
    p_sales_order_id: salesOrderId,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function createInvoice(
  deliveryChallanId: string,
  payload: CreateInvoicePayload,
): Promise<string> {
  if (!deliveryChallanId) {
    throw new Error('Create Delivery Challan before Invoice');
  }
  const { data, error } = await supabase.rpc('create_invoice', {
    p_delivery_challan_id: deliveryChallanId,
    p_payload: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelDeliveryChallan(deliveryChallanId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_delivery_challan', {
    p_dc_id: deliveryChallanId,
  });
  if (error) throw error;
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_invoice', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
}
