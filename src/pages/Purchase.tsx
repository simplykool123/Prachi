import { useState, useEffect } from 'react';
import { Plus, Search, FileText, Building2, ChevronDown, ChevronRight, X, Download, Warehouse } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, nextDocNumber, exportToCSV } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/ui/Modal';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import ActionMenu, { actionEdit, actionDelete } from '../components/ui/ActionMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { processStockMovement } from '../services/stockService';
import { useDateRange } from '../contexts/DateRangeContext';
import type { PurchaseEntry, Product, Supplier, Godown } from '../types';

interface LineItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  total_price: number;
}

type Tab = 'entries' | 'suppliers';

export default function Purchase() {
  const { isAdmin } = useAuth();
  const { dateRange } = useDateRange();
  const [tab, setTab] = useState<Tab>('entries');
  const [entries, setEntries] = useState<PurchaseEntry[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [entryItems, setEntryItems] = useState<Record<string, any[]>>({});
  const [editingEntry, setEditingEntry] = useState<PurchaseEntry | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [confirmEntry, setConfirmEntry] = useState<PurchaseEntry | null>(null);
  const [confirmSupplier, setConfirmSupplier] = useState<Supplier | null>(null);

  const [form, setForm] = useState({
    supplier_id: '', supplier_name: '',
    entry_date: new Date().toISOString().split('T')[0],
    invoice_number: '', notes: '', godown_id: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);

  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_person: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '', gstin: '', notes: '', opening_balance: '0',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [entriesRes, suppliersRes, productsRes, godownsRes] = await Promise.all([
      supabase.from('purchase_entries').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('products').select('id, name, unit, purchase_price').eq('is_active', true),
      supabase.from('godowns').select('*').eq('is_active', true).order('name'),
    ]);
    setEntries(entriesRes.data || []);
    setSuppliers(suppliersRes.data || []);
    setProducts(productsRes.data || []);
    setGodowns(godownsRes.data || []);
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.purchase_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      next[i].total_price = qty * price;
      return next;
    });
  };

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find(s => s.id === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: s?.name || '' }));
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);

  const openNewEntry = () => {
    setEditingEntry(null);
    setForm({ supplier_id: '', supplier_name: '', entry_date: new Date().toISOString().split('T')[0], invoice_number: '', notes: '', godown_id: godowns[0]?.id || '' });
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
    setShowModal(true);
  };

  const openEditEntry = async (entry: PurchaseEntry) => {
    setEditingEntry(entry);
    setForm({
      supplier_id: entry.supplier_id || '',
      supplier_name: entry.supplier_name,
      entry_date: entry.entry_date,
      invoice_number: entry.invoice_number || '',
      notes: entry.notes || '',
      godown_id: '',
    });
    const { data } = await supabase.from('purchase_entry_items').select('*').eq('purchase_entry_id', entry.id);
    const loaded = (data || []).map((item: any) => ({
      product_id: item.product_id || '',
      product_name: item.product_name,
      unit: item.unit,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      total_price: item.total_price,
    }));
    setItems(loaded.length ? loaded : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (editingEntry) {
      await supabase.from('purchase_entries').update({
        supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name,
        entry_date: form.entry_date,
        invoice_number: form.invoice_number,
        subtotal, tax_amount: 0, total_amount: subtotal,
        outstanding_amount: subtotal,
        notes: form.notes,
        updated_at: new Date().toISOString(),
      }).eq('id', editingEntry.id);

      await supabase.from('purchase_entry_items').delete().eq('purchase_entry_id', editingEntry.id);
      const updatedItems = items.filter(i => i.product_name).map(i => ({
        purchase_entry_id: editingEntry.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        total_price: i.total_price,
      }));
      await supabase.from('purchase_entry_items').insert(updatedItems);
      setEntryItems(prev => ({ ...prev, [editingEntry.id]: updatedItems }));
    } else {
      const entryNumber = await nextDocNumber('PO', supabase);
      const { data: entry } = await supabase.from('purchase_entries').insert({
        entry_number: entryNumber,
        supplier_id: form.supplier_id || null,
        supplier_name: form.supplier_name,
        entry_date: form.entry_date,
        invoice_number: form.invoice_number,
        subtotal, tax_amount: 0, total_amount: subtotal,
        paid_amount: 0, outstanding_amount: subtotal,
        status: 'unpaid', notes: form.notes,
      }).select().single();

      if (entry) {
        const entryItemPayload = items.filter(i => i.product_name).map(i => ({
          purchase_entry_id: entry.id,
          product_id: i.product_id || null,
          product_name: i.product_name,
          unit: i.unit,
          quantity: parseFloat(i.quantity) || 0,
          unit_price: parseFloat(i.unit_price) || 0,
          total_price: i.total_price,
        }));
        await supabase.from('purchase_entry_items').insert(entryItemPayload);

        if (form.godown_id) {
          const stockItems = items
            .filter(i => i.product_id)
            .map(i => ({
              product_id: i.product_id,
              godown_id: form.godown_id,
              quantity: parseFloat(i.quantity) || 0,
              unit_price: parseFloat(i.unit_price) || 0,
            }))
            .filter(i => i.quantity > 0);
          if (stockItems.length > 0) {
            await processStockMovement({
              type: 'purchase',
              items: stockItems,
              reference_type: 'purchase_entry',
              reference_id: entry.id,
              reference_number: entryNumber,
              notes: 'Purchase ' + entryNumber,
            });
          }
        }

        for (const item of items.filter(i => i.product_id)) {
          const prod = products.find(p => p.id === item.product_id);
          if (parseFloat(item.unit_price) || prod?.purchase_price) {
            const { error: priceErr } = await supabase.from('products').update({
              purchase_price: parseFloat(item.unit_price) || (prod?.purchase_price ?? 0),
              updated_at: new Date().toISOString(),
            }).eq('id', item.product_id);
            if (priceErr) throw priceErr;
          }
        }

        await supabase.from('ledger_entries').insert({
          entry_date: form.entry_date,
          entry_type: 'credit',
          account_type: 'supplier',
          party_id: form.supplier_id || null,
          party_name: form.supplier_name,
          reference_type: 'purchase_entry',
          reference_id: entry.id,
          description: 'Purchase ' + entryNumber,
          amount: subtotal,
        });

        if (form.supplier_id) {
          const { data: sup } = await supabase.from('suppliers').select('balance').eq('id', form.supplier_id).maybeSingle();
          if (sup) {
            await supabase.from('suppliers').update({
              balance: (sup.balance || 0) + subtotal,
              updated_at: new Date().toISOString(),
            }).eq('id', form.supplier_id);
          }
        }
      }
    }
    setShowModal(false);
    loadData();
  };

  const handleDeleteEntry = async (entry: PurchaseEntry) => {
    await supabase.from('purchase_entries').update({ status: 'cancelled' }).eq('id', entry.id);
    loadData();
  };

  const openNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ name: '', contact_person: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '', gstin: '', notes: '', opening_balance: '0' });
    setShowSupplierModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditingSupplier(s);
    setSupplierForm({
      name: s.name,
      contact_person: s.contact_person || '',
      phone: s.phone || '',
      alt_phone: s.alt_phone || '',
      email: s.email || '',
      address: s.address || '',
      address2: s.address2 || '',
      city: s.city || '',
      state: s.state || '',
      pincode: s.pincode || '',
      gstin: s.gstin || '',
      notes: s.notes || '',
      opening_balance: String(s.opening_balance ?? 0),
    });
    setShowSupplierModal(true);
  };

  const handleSaveSupplier = async () => {
    const opening_balance = parseFloat(supplierForm.opening_balance) || 0;
    const { opening_balance: _ob, ...rest } = supplierForm;
    if (editingSupplier) {
      await supabase.from('suppliers').update({ ...rest, opening_balance, updated_at: new Date().toISOString() }).eq('id', editingSupplier.id);
    } else {
      await supabase.from('suppliers').insert({ ...rest, opening_balance, balance: opening_balance });
    }
    setShowSupplierModal(false);
    setEditingSupplier(null);
    setSupplierForm({ name: '', contact_person: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '', gstin: '', notes: '', opening_balance: '0' });
    loadData();
  };

  const handleDeleteSupplier = async (s: Supplier) => {
    await supabase.from('suppliers').update({ is_active: false }).eq('id', s.id);
    loadData();
  };

  const markPaid = async (entry: PurchaseEntry) => {
    await supabase.from('purchase_entries').update({ status: 'paid', paid_amount: entry.total_amount, outstanding_amount: 0 }).eq('id', entry.id);
    if (entry.supplier_id) {
      const { data: sup } = await supabase.from('suppliers').select('balance').eq('id', entry.supplier_id).maybeSingle();
      if (sup) {
        await supabase.from('suppliers').update({ balance: Math.max(0, (sup.balance || 0) - entry.total_amount) }).eq('id', entry.supplier_id);
      }
    }
    loadData();
  };

  const toggleExpand = async (id: string) => {
    if (expandedEntry === id) { setExpandedEntry(null); return; }
    if (!entryItems[id]) {
      const { data } = await supabase.from('purchase_entry_items').select('*').eq('purchase_entry_id', id);
      setEntryItems(prev => ({ ...prev, [id]: data || [] }));
    }
    setExpandedEntry(id);
  };

  const handleExportEntries = () => {
    exportToCSV(filtered.map(e => ({
      entry_number: e.entry_number,
      supplier_name: e.supplier_name,
      entry_date: e.entry_date,
      invoice_number: e.invoice_number || '',
      total_amount: e.total_amount,
      paid_amount: e.paid_amount,
      outstanding_amount: e.outstanding_amount,
      status: e.status,
    })), 'purchase-entries');
  };

  const handleExportSuppliers = () => {
    exportToCSV(filteredSuppliers.map(s => ({
      name: s.name,
      contact_person: s.contact_person || '',
      phone: s.phone || '',
      email: s.email || '',
      city: s.city || '',
      gstin: s.gstin || '',
      balance: s.balance,
    })), 'suppliers');
  };

  const filtered = entries.filter(e =>
    e.entry_date >= dateRange.from &&
    e.entry_date <= dateRange.to &&
    (e.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
    e.entry_number.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredSuppliers = suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const totalPayable = entries.filter(e => e.status !== 'paid').reduce((s, e) => s + e.outstanding_amount, 0);

  if (!isAdmin) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">Purchase</h1>
          <p className="text-xs text-neutral-500">Manage purchases, suppliers & inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-8 w-44 text-xs" />
          </div>
          {tab === 'entries' && (
            <button onClick={handleExportEntries} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
          {tab === 'suppliers' && (
            <button onClick={handleExportSuppliers} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          )}
          <button onClick={openNewSupplier} className="btn-secondary text-xs">
            <Building2 className="w-3.5 h-3.5" /> Add Supplier
          </button>
          <button onClick={openNewEntry} className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" /> New Purchase
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Payable</p>
            <p className="text-2xl font-bold text-error-600 mt-0.5">{formatCurrency(totalPayable)}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">{entries.filter(e => e.status !== 'paid').length} pending bills</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Suppliers</p>
            <p className="text-2xl font-bold text-neutral-900 mt-0.5">{suppliers.length}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">{suppliers.filter(s => s.balance > 0).length} with pending balance</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Entries</p>
            <p className="text-2xl font-bold text-neutral-900 mt-0.5">{entries.length}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Paid All Time</p>
            <p className="text-2xl font-bold text-success-600 mt-0.5">
              {formatCurrency(entries.filter(e => e.status === 'paid').reduce((s, e) => s + e.total_amount, 0))}
            </p>
          </div>
        </div>

        <div className="flex gap-4 border-b border-neutral-200">
          {(['entries', 'suppliers'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${tab === t ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              {t === 'entries' ? 'Purchase Entries' : 'Supplier Directory'}
            </button>
          ))}
        </div>

        {tab === 'entries' && (
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="table-header w-8" />
                  <th className="table-header text-left">Entry #</th>
                  <th className="table-header text-left">Supplier</th>
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Invoice #</th>
                  <th className="table-header text-right">Amount</th>
                  <th className="table-header text-right">Outstanding</th>
                  <th className="table-header text-left">Status</th>
                  <th className="table-header text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => (
                  <>
                    <tr key={e.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                      <td className="table-cell">
                        <button onClick={() => toggleExpand(e.id)} className="text-neutral-400 hover:text-primary-600">
                          {expandedEntry === e.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                      <td className="table-cell font-medium text-primary-700 text-xs">{e.entry_number}</td>
                      <td className="table-cell font-medium">{e.supplier_name}</td>
                      <td className="table-cell text-neutral-500 text-sm">{formatDate(e.entry_date)}</td>
                      <td className="table-cell text-neutral-500 text-xs">{e.invoice_number || '-'}</td>
                      <td className="table-cell text-right font-semibold">{formatCurrency(e.total_amount)}</td>
                      <td className="table-cell text-right text-sm">
                        {e.outstanding_amount > 0 ? (
                          <span className="text-error-600 font-medium">{formatCurrency(e.outstanding_amount)}</span>
                        ) : <span className="text-success-600">Paid</span>}
                      </td>
                      <td className="table-cell"><StatusBadge status={e.status} /></td>
                      <td className="table-cell text-right">
                        <div className="flex items-center justify-end gap-2">
                          {e.status === 'unpaid' && (
                            <button onClick={() => markPaid(e)} className="text-xs text-primary-600 hover:underline font-medium">Mark Paid</button>
                          )}
                          <ActionMenu items={[
                            ...(e.status === 'unpaid' ? [actionEdit(() => openEditEntry(e))] : []),
                            actionDelete(() => setConfirmEntry(e)),
                          ]} />
                        </div>
                      </td>
                    </tr>
                    {expandedEntry === e.id && entryItems[e.id] && (
                      <tr key={`${e.id}-items`}>
                        <td colSpan={9} className="bg-orange-50 px-8 py-3 border-b border-orange-100">
                          <table className="w-full">
                            <thead>
                              <tr className="text-[10px] text-neutral-500 uppercase tracking-wider">
                                <th className="text-left pb-1 font-semibold">Product</th>
                                <th className="text-right pb-1 font-semibold w-24">Qty</th>
                                <th className="text-right pb-1 font-semibold w-28">Unit Price</th>
                                <th className="text-right pb-1 font-semibold w-28">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entryItems[e.id].map((item: any) => (
                                <tr key={item.id} className="text-xs">
                                  <td className="py-0.5 text-neutral-800 font-medium">{item.product_name}</td>
                                  <td className="py-0.5 text-right text-neutral-600">{item.quantity} {item.unit}</td>
                                  <td className="py-0.5 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-0.5 text-right font-semibold">{formatCurrency(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={FileText} title="No purchases yet" description="Create your first purchase entry." />}
          </div>
        )}

        {tab === 'suppliers' && (
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="table-header text-left">Supplier Name</th>
                  <th className="table-header text-left">Contact</th>
                  <th className="table-header text-left">City</th>
                  <th className="table-header text-left">GSTIN</th>
                  <th className="table-header text-right">Outstanding Balance</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map(s => (
                  <tr key={s.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="table-cell font-medium">{s.name}</td>
                    <td className="table-cell">
                      <p className="text-sm text-neutral-700">{s.contact_person || '-'}</p>
                      <p className="text-xs text-neutral-400">{s.phone}</p>
                    </td>
                    <td className="table-cell text-neutral-500">{s.city || '-'}</td>
                    <td className="table-cell text-xs font-mono text-neutral-500">{s.gstin || '-'}</td>
                    <td className="table-cell text-right">
                      {s.balance > 0 ? (
                        <span className="text-error-600 font-semibold">{formatCurrency(s.balance)}</span>
                      ) : <span className="text-success-600 font-medium">Clear</span>}
                    </td>
                    <td className="table-cell text-right">
                      <ActionMenu items={[
                        actionEdit(() => openEditSupplier(s)),
                        actionDelete(() => setConfirmSupplier(s)),
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suppliers.length === 0 && <EmptyState icon={Building2} title="No suppliers yet" description="Add your first supplier." />}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingEntry ? 'Edit Purchase Entry' : 'New Purchase Entry'} size="xl"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">{editingEntry ? 'Update Purchase' : 'Save Purchase'}</button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Supplier</label>
              <select value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)} className="input">
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier Name *</label>
              <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} className="input" placeholder="Or type name" />
            </div>
            <div>
              <label className="label">Entry Date</label>
              <input type="date" value={form.entry_date} onChange={e => setForm(f => ({ ...f, entry_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-neutral-400" /> Receive Into Godown *
              </label>
              <select value={form.godown_id} onChange={e => setForm(f => ({ ...f, godown_id: e.target.value }))} className="input">
                <option value="">-- Select Godown --</option>
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}{g.code ? ` (${g.code})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier Invoice #</label>
              <input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} className="input" placeholder="Optional" />
            </div>
            <div>
              <label className="label">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Items</p>
              <button onClick={addItem} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left w-16">Unit</th>
                    <th className="table-header text-right w-20">Qty</th>
                    <th className="table-header text-right w-24">Price (₹)</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="input text-xs">
                          <option value="">-- Select Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!item.product_id && <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} className="input text-xs mt-1" placeholder="Or type name..." />}
                      </td>
                      <td className="px-3 py-2"><input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} className="input text-xs" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 text-right text-sm font-medium">{formatCurrency(item.total_price)}</td>
                      <td className="px-3 py-2"><button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-error-500"><X className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <div className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                Total: {formatCurrency(subtotal)}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showSupplierModal} onClose={() => setShowSupplierModal(false)} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'} size="md"
        footer={
          <>
            <button onClick={() => setShowSupplierModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveSupplier} className="btn-primary">{editingSupplier ? 'Update Supplier' : 'Add Supplier'}</button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Supplier Name *</label>
            <input value={supplierForm.name} onChange={e => setSupplierForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Company or individual name" />
          </div>
          <div>
            <label className="label">Contact Person</label>
            <input value={supplierForm.contact_person} onChange={e => setSupplierForm(f => ({ ...f, contact_person: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={supplierForm.phone} onChange={e => setSupplierForm(f => ({ ...f, phone: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Alt. Phone</label>
            <input value={supplierForm.alt_phone} onChange={e => setSupplierForm(f => ({ ...f, alt_phone: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Email</label>
            <input value={supplierForm.email} onChange={e => setSupplierForm(f => ({ ...f, email: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">City</label>
            <input value={supplierForm.city} onChange={e => setSupplierForm(f => ({ ...f, city: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">State</label>
            <input value={supplierForm.state} onChange={e => setSupplierForm(f => ({ ...f, state: e.target.value }))} className="input" placeholder="State" />
          </div>
          <div>
            <label className="label">PIN Code</label>
            <input value={supplierForm.pincode} onChange={e => setSupplierForm(f => ({ ...f, pincode: e.target.value }))} className="input" placeholder="PIN Code" />
          </div>
          <div className="col-span-2">
            <label className="label">Address Line 1</label>
            <input value={supplierForm.address} onChange={e => setSupplierForm(f => ({ ...f, address: e.target.value }))} className="input" placeholder="Street / House No." />
          </div>
          <div className="col-span-2">
            <label className="label">Address Line 2</label>
            <input value={supplierForm.address2} onChange={e => setSupplierForm(f => ({ ...f, address2: e.target.value }))} className="input" placeholder="Area / Landmark" />
          </div>
          <div>
            <label className="label">GSTIN</label>
            <input value={supplierForm.gstin} onChange={e => setSupplierForm(f => ({ ...f, gstin: e.target.value }))} className="input" placeholder="Optional" />
          </div>
          <div>
            <label className="label">Opening Balance</label>
            <input type="number" value={supplierForm.opening_balance} onChange={e => setSupplierForm(f => ({ ...f, opening_balance: e.target.value }))} className="input" placeholder="0" />
          </div>
          <div className="col-span-2">
            <label className="label">Notes</label>
            <input value={supplierForm.notes} onChange={e => setSupplierForm(f => ({ ...f, notes: e.target.value }))} className="input" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmEntry}
        onClose={() => setConfirmEntry(null)}
        onConfirm={() => confirmEntry && handleDeleteEntry(confirmEntry)}
        title="Cancel Purchase Entry"
        message={`Cancel entry ${confirmEntry?.entry_number}? This will mark it as cancelled.`}
        confirmLabel="Cancel Entry"
        isDanger
      />

      <ConfirmDialog
        isOpen={!!confirmSupplier}
        onClose={() => setConfirmSupplier(null)}
        onConfirm={() => confirmSupplier && handleDeleteSupplier(confirmSupplier)}
        title="Delete Supplier"
        message={`Remove ${confirmSupplier?.name} from suppliers? This action cannot be undone.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
