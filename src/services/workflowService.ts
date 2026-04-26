import { supabase } from '../lib/supabase';
import { updateLastRate } from '../lib/rateCardService';
import { processStockMovement } from './stockService';
import { fireAutomation } from './automationService';

export async function onInvoiceCreated(invoiceId: string): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, items:invoice_items(*)')
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invoice) return { errors: ['Invoice not found'] };

  const dispatchItems = (invoice.items || [])
    .filter((item: { product_id?: string; godown_id?: string; quantity: number }) => {
      const itemGodownId = item.godown_id || invoice.godown_id;
      return !!itemGodownId && !!item.product_id;
    })
    .map((item: { product_id: string; godown_id?: string; quantity: number }) => ({
      product_id: item.product_id,
      godown_id: (item.godown_id || invoice.godown_id) as string,
      quantity: item.quantity,
    }));

  if (dispatchItems.length > 0) {
    try {
      await processStockMovement({
        type: 'dispatch',
        items: dispatchItems,
        reference_type: 'invoice',
        reference_id: invoice.id,
        reference_number: invoice.invoice_number,
        notes: `Invoice ${invoice.invoice_number}`,
      });
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'stock posting failed');
    }
  }

  // Fix: ledger_entries requires party_id, party_name, account_type (NOT customer_id)
  await supabase.from('ledger_entries').insert({
    customer_id: invoice.customer_id,   // extra column added by migration
    party_id: invoice.customer_id,
    party_name: invoice.customer_name ?? '',
    account_type: 'customer',
    entry_type: 'debit',
    amount: invoice.total_amount,
    description: `Invoice ${invoice.invoice_number}`,
    reference_type: 'invoice',
    reference_id: invoiceId,
    entry_date: invoice.invoice_date,
  });

  if (invoice.customer_id) {
    for (const item of (invoice.items || [])) {
      if (item.product_id && item.rate) {
        await updateLastRate(invoice.customer_id, item.product_id, item.rate, 'invoice', invoiceId);
      }
    }
  }

  if (invoice.sales_order_id) {
    await supabase
      .from('sales_orders')
      .update({ status: 'invoiced', updated_at: new Date().toISOString() })
      .eq('id', invoice.sales_order_id);
  }

  // Fire automation rules for invoice_created
  await fireAutomation('invoice_created', {
    entity_type: 'invoice',
    entity_id: invoice.id,
    entity_name: invoice.invoice_number,
    customer_name: invoice.customer_name ?? '',
    customer_phone: invoice.customer_phone ?? '',
    invoice_number: invoice.invoice_number,
    amount: invoice.total_amount,
  });

  return { errors };
}

export async function onPaymentCreated(paymentId: string): Promise<void> {
  const { data: payment } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return;

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, invoice_number, customer_name, customer_phone, total_amount, paid_amount, outstanding_amount, sales_order_id')
    .eq('id', payment.invoice_id)
    .maybeSingle();

  if (!invoice) return;

  const newPaid = (invoice.paid_amount || 0) + payment.amount;
  const newOutstanding = Math.max(0, invoice.total_amount - newPaid);
  const newStatus = newOutstanding <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'sent';

  await supabase.from('invoices').update({
    paid_amount: newPaid,
    outstanding_amount: newOutstanding,
    status: newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', invoice.id);

  // Fix: ledger_entries requires party_id, party_name, account_type
  await supabase.from('ledger_entries').insert({
    customer_id: payment.customer_id,   // extra column added by migration
    party_id: payment.customer_id,
    party_name: payment.party_name ?? invoice.customer_name ?? '',
    account_type: 'customer',
    entry_type: 'credit',
    amount: payment.amount,
    description: `Payment received — ${payment.payment_mode || 'cash'}`,
    reference_type: 'payment',
    reference_id: paymentId,
    entry_date: payment.payment_date,
  });

  if (newStatus === 'paid' && invoice.sales_order_id) {
    await supabase
      .from('sales_orders')
      .update({ status: 'closed', updated_at: new Date().toISOString() })
      .eq('id', invoice.sales_order_id);
  }

  // Fire automation rules for payment_received
  await fireAutomation('payment_received', {
    entity_type: 'payment',
    entity_id: paymentId,
    entity_name: `Payment for invoice`,
    customer_name: invoice.customer_name ?? '',
    customer_phone: invoice.customer_phone ?? '',
    amount: payment.amount,
    invoice_number: invoice.invoice_number ?? '',
  });
}
