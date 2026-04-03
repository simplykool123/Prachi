/*
  # Add Missing Foreign Key Indexes

  ## Summary
  Adds covering indexes for all unindexed foreign key columns to improve
  query performance on JOIN operations and cascaded deletes.

  ## Tables affected
  - courier_entries: customer_id, invoice_id
  - crm_files: customer_id
  - customer_documents: uploaded_by
  - delivery_challan_items: delivery_challan_id, product_id
  - delivery_challans: customer_id
  - invoice_items: invoice_id, product_id
  - payments: customer_id, supplier_id
  - product_recommendations: customer_id, product_id
  - purchase_entries: purchase_order_id, supplier_id
  - purchase_entry_items: product_id, purchase_entry_id
  - purchase_order_items: product_id, purchase_order_id
  - purchase_orders: supplier_id
  - sales_order_items: product_id, sales_order_id
  - sales_return_items: product_id, sales_return_id
  - vastu_plans: product_id
  - whatsapp_logs: customer_id
*/

CREATE INDEX IF NOT EXISTS idx_courier_entries_customer_id ON public.courier_entries (customer_id);
CREATE INDEX IF NOT EXISTS idx_courier_entries_invoice_id ON public.courier_entries (invoice_id);

CREATE INDEX IF NOT EXISTS idx_crm_files_customer_id ON public.crm_files (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_documents_uploaded_by ON public.customer_documents (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_delivery_challan_items_challan_id ON public.delivery_challan_items (delivery_challan_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challan_items_product_id ON public.delivery_challan_items (product_id);

CREATE INDEX IF NOT EXISTS idx_delivery_challans_customer_id ON public.delivery_challans (customer_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON public.invoice_items (product_id);

CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier_id ON public.payments (supplier_id);

CREATE INDEX IF NOT EXISTS idx_product_recommendations_customer_id ON public.product_recommendations (customer_id);
CREATE INDEX IF NOT EXISTS idx_product_recommendations_product_id ON public.product_recommendations (product_id);

CREATE INDEX IF NOT EXISTS idx_purchase_entries_purchase_order_id ON public.purchase_entries (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entries_supplier_id ON public.purchase_entries (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_entry_items_product_id ON public.purchase_entry_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_entry_items_purchase_entry_id ON public.purchase_entry_items (purchase_entry_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON public.purchase_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchase_order_id ON public.purchase_order_items (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON public.purchase_orders (supplier_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id ON public.sales_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sales_order_id ON public.sales_order_items (sales_order_id);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_product_id ON public.sales_return_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_sales_return_id ON public.sales_return_items (sales_return_id);

CREATE INDEX IF NOT EXISTS idx_vastu_plans_product_id ON public.vastu_plans (product_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_customer_id ON public.whatsapp_logs (customer_id);
