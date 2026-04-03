/*
  # Drop Unused Indexes

  ## Summary
  Removes indexes that have never been used by the query planner.
  These indexes consume disk space and slow down write operations (INSERT/UPDATE/DELETE)
  without providing any read query benefit.

  ## Indexes dropped
  - idx_stock_movements_product (duplicate kept, other dropped above; this was unused)
  - idx_customers_next_followup
  - idx_customers_conversion_stage
  - idx_products_category
  - idx_sales_orders_customer
  - idx_sales_orders_status
  - idx_invoices_customer
  - idx_invoices_so
  - idx_invoices_status
  - idx_invoices_date
  - idx_challans_invoice
  - idx_challans_so
  - idx_payments_reference
  - idx_crm_notes_customer
  - idx_appointments_start
  - idx_appointments_customer
  - idx_ledger_party
  - idx_expenses_date
  - idx_suppliers_name
  - idx_sales_returns_invoice
  - idx_sales_returns_customer
  - idx_customer_documents_customer_id (replaced by new index above)
*/

DROP INDEX IF EXISTS idx_stock_movements_product;
DROP INDEX IF EXISTS idx_customers_next_followup;
DROP INDEX IF EXISTS idx_customers_conversion_stage;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_sales_orders_customer;
DROP INDEX IF EXISTS idx_sales_orders_status;
DROP INDEX IF EXISTS idx_invoices_customer;
DROP INDEX IF EXISTS idx_invoices_so;
DROP INDEX IF EXISTS idx_invoices_status;
DROP INDEX IF EXISTS idx_invoices_date;
DROP INDEX IF EXISTS idx_challans_invoice;
DROP INDEX IF EXISTS idx_challans_so;
DROP INDEX IF EXISTS idx_payments_reference;
DROP INDEX IF EXISTS idx_crm_notes_customer;
DROP INDEX IF EXISTS idx_appointments_start;
DROP INDEX IF EXISTS idx_appointments_customer;
DROP INDEX IF EXISTS idx_ledger_party;
DROP INDEX IF EXISTS idx_expenses_date;
DROP INDEX IF EXISTS idx_suppliers_name;
DROP INDEX IF EXISTS idx_sales_returns_invoice;
DROP INDEX IF EXISTS idx_sales_returns_customer;
DROP INDEX IF EXISTS idx_customer_documents_customer_id;
