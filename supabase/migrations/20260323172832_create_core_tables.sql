/*
  # Prachi Fulfagar Business App - Core Schema
  Complete database schema for an astrology & vastu consultancy business management app.
*/

-- Products / Inventory
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Astro Products', 'Vastu Items', 'Healing Items', 'Gemstones')),
  unit text NOT NULL DEFAULT 'pcs',
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  selling_price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity numeric(12,3) NOT NULL DEFAULT 0,
  low_stock_alert numeric(12,3) NOT NULL DEFAULT 5,
  description text DEFAULT '',
  image_url text DEFAULT '',
  product_type text DEFAULT 'product' CHECK (product_type IN ('product', 'gemstone', 'service')),
  gemstone_details jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view products" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert products" ON products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update products" ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Stock Movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id),
  movement_type text NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment', 'return')),
  quantity numeric(12,3) NOT NULL,
  reference_type text DEFAULT '',
  reference_id uuid,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view stock_movements" ON stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert stock_movements" ON stock_movements FOR INSERT TO authenticated WITH CHECK (true);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text DEFAULT '',
  phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  city text DEFAULT '',
  gstin text DEFAULT '',
  opening_balance numeric(12,2) DEFAULT 0,
  balance numeric(12,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text UNIQUE NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  po_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'received', 'cancelled')),
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view purchase_orders" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchase_orders" ON purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchase_orders" ON purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view po_items" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert po_items" ON purchase_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update po_items" ON purchase_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete po_items" ON purchase_order_items FOR DELETE TO authenticated USING (true);

-- Purchase Entries (GRN)
CREATE TABLE IF NOT EXISTS purchase_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text UNIQUE NOT NULL,
  purchase_order_id uuid REFERENCES purchase_orders(id),
  supplier_id uuid REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_number text DEFAULT '',
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0,
  outstanding_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'paid')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view purchase_entries" ON purchase_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert purchase_entries" ON purchase_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update purchase_entries" ON purchase_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Purchase Entry Items
CREATE TABLE IF NOT EXISTS purchase_entry_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_entry_id uuid NOT NULL REFERENCES purchase_entries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_entry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view pe_items" ON purchase_entry_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pe_items" ON purchase_entry_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pe_items" ON purchase_entry_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete pe_items" ON purchase_entry_items FOR DELETE TO authenticated USING (true);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text DEFAULT '',
  email text DEFAULT '',
  address text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  pincode text DEFAULT '',
  gstin text DEFAULT '',
  category text DEFAULT 'B2C' CHECK (category IN ('B2B', 'B2C')),
  tags text[] DEFAULT '{}',
  notes text DEFAULT '',
  opening_balance numeric(12,2) DEFAULT 0,
  balance numeric(12,2) DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  last_interaction timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view customers" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  customer_phone text DEFAULT '',
  customer_address text DEFAULT '',
  so_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'invoiced', 'dispatched', 'delivered', 'cancelled')),
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  courier_charges numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view sales_orders" ON sales_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sales_orders" ON sales_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sales_orders" ON sales_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Sales Order Items
CREATE TABLE IF NOT EXISTS sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view so_items" ON sales_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert so_items" ON sales_order_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update so_items" ON sales_order_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete so_items" ON sales_order_items FOR DELETE TO authenticated USING (true);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text UNIQUE NOT NULL,
  sales_order_id uuid REFERENCES sales_orders(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  customer_phone text DEFAULT '',
  customer_address text DEFAULT '',
  customer_city text DEFAULT '',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')),
  subtotal numeric(12,2) DEFAULT 0,
  tax_amount numeric(12,2) DEFAULT 0,
  courier_charges numeric(12,2) DEFAULT 0,
  discount_amount numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0,
  outstanding_amount numeric(12,2) DEFAULT 0,
  payment_terms text DEFAULT 'Due on receipt',
  notes text DEFAULT '',
  bank_name text DEFAULT 'HDFC Bank',
  account_number text DEFAULT '',
  ifsc_code text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update invoices" ON invoices FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Invoice Items
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  description text DEFAULT '',
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount_pct numeric(5,2) DEFAULT 0,
  tax_pct numeric(5,2) DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view inv_items" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert inv_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update inv_items" ON invoice_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete inv_items" ON invoice_items FOR DELETE TO authenticated USING (true);

-- Delivery Challans
CREATE TABLE IF NOT EXISTS delivery_challans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text UNIQUE NOT NULL,
  invoice_id uuid REFERENCES invoices(id),
  sales_order_id uuid REFERENCES sales_orders(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  customer_address text DEFAULT '',
  customer_phone text DEFAULT '',
  challan_date date NOT NULL DEFAULT CURRENT_DATE,
  dispatch_mode text DEFAULT 'Courier',
  courier_company text DEFAULT '',
  tracking_number text DEFAULT '',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'dispatched', 'delivered', 'cancelled')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE delivery_challans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view challans" ON delivery_challans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert challans" ON delivery_challans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update challans" ON delivery_challans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Delivery Challan Items
CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_challan_id uuid NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE delivery_challan_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view challan_items" ON delivery_challan_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert challan_items" ON delivery_challan_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update challan_items" ON delivery_challan_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete challan_items" ON delivery_challan_items FOR DELETE TO authenticated USING (true);

-- Sales Returns
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text UNIQUE NOT NULL,
  invoice_id uuid REFERENCES invoices(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  return_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text DEFAULT '',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'processed', 'cancelled')),
  total_amount numeric(12,2) DEFAULT 0,
  credit_note_issued boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view sales_returns" ON sales_returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sales_returns" ON sales_returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sales_returns" ON sales_returns FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Sales Return Items
CREATE TABLE IF NOT EXISTS sales_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_return_id uuid NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  product_name text NOT NULL,
  unit text DEFAULT 'pcs',
  quantity numeric(12,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) DEFAULT 0,
  total_price numeric(12,2) DEFAULT 0,
  return_to_stock boolean DEFAULT true
);

ALTER TABLE sales_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view sales_return_items" ON sales_return_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sales_return_items" ON sales_return_items FOR INSERT TO authenticated WITH CHECK (true);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text UNIQUE NOT NULL,
  payment_type text NOT NULL CHECK (payment_type IN ('receipt', 'payment')),
  reference_type text NOT NULL CHECK (reference_type IN ('invoice', 'purchase_entry', 'advance', 'sales_return')),
  reference_id uuid,
  customer_id uuid REFERENCES customers(id),
  supplier_id uuid REFERENCES suppliers(id),
  party_name text NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card')),
  reference_number text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert payments" ON payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update payments" ON payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Courier Entries
CREATE TABLE IF NOT EXISTS courier_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_date date NOT NULL DEFAULT CURRENT_DATE,
  invoice_id uuid REFERENCES invoices(id),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  courier_company text NOT NULL,
  tracking_id text DEFAULT '',
  weight_kg numeric(8,3) DEFAULT 0,
  charges numeric(10,2) DEFAULT 0,
  status text DEFAULT 'booked' CHECK (status IN ('booked', 'in_transit', 'delivered', 'returned')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE courier_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view courier_entries" ON courier_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert courier_entries" ON courier_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update courier_entries" ON courier_entries FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- CRM Notes
CREATE TABLE IF NOT EXISTS crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_type text DEFAULT 'Note' CHECK (note_type IN ('Note', 'Call', 'Meeting', 'Vastu Visit', 'Astro Reading', 'Follow Up', 'Gemstone Reading')),
  title text NOT NULL,
  content text DEFAULT '',
  note_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view crm_notes" ON crm_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_notes" ON crm_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update crm_notes" ON crm_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete crm_notes" ON crm_notes FOR DELETE TO authenticated USING (true);

-- CRM Files
CREATE TABLE IF NOT EXISTS crm_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text DEFAULT 'Document' CHECK (file_type IN ('Palm Image', 'Floor Plan', 'Report', 'Document', 'Photo', 'Gemstone Certificate')),
  file_size_kb integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE crm_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view crm_files" ON crm_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert crm_files" ON crm_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete crm_files" ON crm_files FOR DELETE TO authenticated USING (true);

-- Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  customer_id uuid REFERENCES customers(id),
  customer_name text DEFAULT '',
  appointment_type text DEFAULT 'Consultation' CHECK (appointment_type IN ('Astro Reading', 'Vastu Audit', 'Consultation', 'Follow Up', 'Site Visit', 'Video Call', 'Phone Call', 'Gemstone Reading')),
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  location text DEFAULT '',
  city text DEFAULT '',
  travel_plan_id uuid,
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view appointments" ON appointments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert appointments" ON appointments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update appointments" ON appointments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete appointments" ON appointments FOR DELETE TO authenticated USING (true);

-- Travel Plans
CREATE TABLE IF NOT EXISTS travel_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  hotel_name text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE travel_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view travel_plans" ON travel_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert travel_plans" ON travel_plans FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update travel_plans" ON travel_plans FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete travel_plans" ON travel_plans FOR DELETE TO authenticated USING (true);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number text UNIQUE NOT NULL,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL CHECK (category IN ('Rent', 'Travel', 'Marketing', 'Courier', 'Utilities', 'Supplies', 'Salary', 'Miscellaneous')),
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode text DEFAULT 'Cash',
  reference_number text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view expenses" ON expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert expenses" ON expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update expenses" ON expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Ledger Entries
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type text NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  account_type text NOT NULL CHECK (account_type IN ('customer', 'supplier', 'cash', 'bank', 'income', 'expense')),
  party_id uuid,
  party_name text NOT NULL,
  reference_type text DEFAULT '',
  reference_id uuid,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  running_balance numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view ledger_entries" ON ledger_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert ledger_entries" ON ledger_entries FOR INSERT TO authenticated WITH CHECK (true);

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_number text UNIQUE NOT NULL,
  journal_date date NOT NULL DEFAULT CURRENT_DATE,
  description text NOT NULL,
  debit_account text NOT NULL,
  credit_account text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view journal_entries" ON journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert journal_entries" ON journal_entries FOR INSERT TO authenticated WITH CHECK (true);

-- Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view automation_rules" ON automation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert automation_rules" ON automation_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update automation_rules" ON automation_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- WhatsApp Logs
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id),
  customer_name text NOT NULL,
  phone text NOT NULL,
  message_type text DEFAULT 'manual',
  message_content text NOT NULL,
  reference_type text DEFAULT '',
  reference_id uuid,
  status text DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  sent_at timestamptz DEFAULT now()
);

ALTER TABLE whatsapp_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view whatsapp_logs" ON whatsapp_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert whatsapp_logs" ON whatsapp_logs FOR INSERT TO authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_so ON invoices(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_challans_invoice ON delivery_challans(invoice_id);
CREATE INDEX IF NOT EXISTS idx_challans_so ON delivery_challans(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_customer ON crm_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_party ON ledger_entries(party_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice ON sales_returns(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
