import { useState, useEffect } from 'react';
import { Plus, Search, RotateCcw, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, formatDateInput, nextDocNumber, exportToCSV } from '../../lib/utils';
import { useDateRange } from '../../contexts/DateRangeContext';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ActionMenu, { actionView, actionEdit, actionDelete } from '../../components/ui/ActionMenu';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import type { SalesReturn, SalesReturnItem } from '../../types';
import { processStockMovement } from '../../services/stockService';

interface InvoiceOption {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_id?: string;
}

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  selling_price: number;
  stock_quantity: number;
}

interface ReturnLineItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  return_to_stock: boolean;
  total_price: number;
}

export default function SalesReturns() {
  const { dateRange } = useDateRange();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);
  const [viewItems, setViewItems] = useState<SalesReturnItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [rowItems, setRowItems] = useState<Record<string, SalesReturnItem[]>>({});

  const [form, setForm] = useState({
    invoice_id: '', customer_name: '', return_date: new Date().toISOString().split('T')[0],
    reason: '', notes: '',
  });
  const [items, setItems] = useState<ReturnLineItem[]>([{
    product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', return_to_stock: true, total_price: 0,
  }]);
  const [editForm, setEditForm] = useState({
    invoice_id: '', customer_name: '', return_date: '', reason: '', notes: '',
  });
  const [editItems, setEditItems] = useState<ReturnLineItem[]>([]);

  useEffect(() => { loadData(); }, [dateRange]);

  const loadData = async () => {
    const [returnsRes, invoicesRes, productsRes] = await Promise.all([
      supabase.from('sales_returns').select('*')
        .gte('return_date', dateRange.from)
        .lte('return_date', dateRange.to)
        .order('created_at', { ascending: false }),
      supabase.from('invoices').select('id, invoice_number, customer_name, customer_id').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, unit, selling_price, stock_quantity').eq('is_active', true),
    ]);
    setReturns(returnsRes.data || []);
    setInvoices((invoicesRes.data || []) as InvoiceOption[]);
    setProducts((productsRes.data || []) as ProductOption[]);
  };

  const toggleExpand = async (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!rowItems[id]) {
        const { data } = await supabase.from('sales_return_items').select('*').eq('sales_return_id', id);
        setRowItems(prev => ({ ...prev, [id]: data || [] }));
      }
    }
    setExpandedRows(next);
  };

  const handleInvoiceChange = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    setForm(f => ({ ...f, invoice_id: id, customer_name: inv?.customer_name || '' }));
  };

  const handleEditInvoiceChange = (id: string) => {
    const inv = invoices.find(i => i.id === id);
    setEditForm(f => ({ ...f, invoice_id: id, customer_name: inv?.customer_name || '' }));
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', return_to_stock: true, total_price: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: string, value: string | boolean) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === (value as string));
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.selling_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      next[i].total_price = qty * price;
      return next;
    });
  };

  const addEditItem = () => setEditItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', return_to_stock: true, total_price: 0 }]);
  const removeEditItem = (i: number) => setEditItems(prev => prev.filter((_, idx) => idx !== i));

  const updateEditItem = (i: number, field: string, value: string | boolean) => {
    setEditItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === (value as string));
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.selling_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      next[i].total_price = qty * price;
      return next;
    });
  };

  const totalAmount = items.reduce((s, i) => s + i.total_price, 0);
  const editTotalAmount = editItems.reduce((s, i) => s + i.total_price, 0);

  const handleSave = async () => {
    const inv = invoices.find(i => i.id === form.invoice_id);
    const returnNumber = await nextDocNumber('RET', supabase);
    const { data: ret } = await supabase.from('sales_returns').insert({
      return_number: returnNumber,
      invoice_id: form.invoice_id || null,
      customer_id: inv?.customer_id || null,
      customer_name: form.customer_name,
      return_date: form.return_date,
      reason: form.reason,
      status: 'pending',
      total_amount: totalAmount,
      credit_note_issued: false,
      notes: form.notes,
    }).select().single();

    if (ret) {
      const returnItems = items.filter(i => i.product_name).map(i => ({
        sales_return_id: ret.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        total_price: i.total_price,
        return_to_stock: i.return_to_stock,
      }));
      await supabase.from('sales_return_items').insert(returnItems);
    }

    setShowModal(false);
    setForm({ invoice_id: '', customer_name: '', return_date: new Date().toISOString().split('T')[0], reason: '', notes: '' });
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', return_to_stock: true, total_price: 0 }]);
    loadData();
  };

  const openView = async (ret: SalesReturn) => {
    const { data } = await supabase.from('sales_return_items').select('*').eq('sales_return_id', ret.id);
    setViewItems(data || []);
    setSelectedReturn(ret);
    setShowViewModal(true);
  };

  const openEdit = async (ret: SalesReturn) => {
    const { data } = await supabase.from('sales_return_items').select('*').eq('sales_return_id', ret.id);
    setEditForm({
      invoice_id: ret.invoice_id || '',
      customer_name: ret.customer_name,
      return_date: formatDateInput(ret.return_date),
      reason: ret.reason || '',
      notes: ret.notes || '',
    });
    setEditItems((data || []).map(i => ({
      product_id: i.product_id || '',
      product_name: i.product_name,
      unit: i.unit,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
      return_to_stock: i.return_to_stock,
      total_price: i.total_price,
    })));
    setSelectedReturn(ret);
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedReturn) return;
    await supabase.from('sales_returns').update({
      invoice_id: editForm.invoice_id || null,
      customer_name: editForm.customer_name,
      return_date: editForm.return_date,
      reason: editForm.reason,
      notes: editForm.notes,
      total_amount: editTotalAmount,
    }).eq('id', selectedReturn.id);

    await supabase.from('sales_return_items').delete().eq('sales_return_id', selectedReturn.id);
    await supabase.from('sales_return_items').insert(
      editItems.filter(i => i.product_name).map(i => ({
        sales_return_id: selectedReturn.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        total_price: i.total_price,
        return_to_stock: i.return_to_stock,
      }))
    );

    setShowEditModal(false);
    loadData();
  };

  const openDelete = (ret: SalesReturn) => {
    setSelectedReturn(ret);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!selectedReturn) return;
    await supabase.from('sales_returns').update({ status: 'cancelled' }).eq('id', selectedReturn.id);
    loadData();
  };

  const handleApprove = async (ret: SalesReturn) => {
    await supabase.from('sales_returns').update({ status: 'approved' }).eq('id', ret.id);
    loadData();
  };

  const handleProcess = async (ret: SalesReturn) => {
    let retItems = rowItems[ret.id];
    if (!retItems) {
      const { data, error } = await supabase.from('sales_return_items').select('*').eq('sales_return_id', ret.id);
      if (error) throw error;
      retItems = data || [];
      setRowItems(prev => ({ ...prev, [ret.id]: retItems }));
    }

    // Build per-product godown map from the original invoice items.
    // Falls back to the first active godown if the invoice link is missing.
    const godownByProduct: Record<string, any> = {};
    if (ret.invoice_id) {
      const { data: invItems } = await supabase
        .from('invoice_items').select('product_id, godown_id').eq('invoice_id', ret.invoice_id);
      for (const ii of (invItems || [])) {
        if (ii.product_id && ii.godown_id) {
          godownByProduct[ii.product_id] = ii.godown_id;
        }
      }
    }

    // Fallback godown in case invoice items have no godown_id.
    let fallbackGodownId: string | null = null;
    const missingGodown = retItems.some(
      i => i.return_to_stock && i.product_id && !godownByProduct[i.product_id]
    );
    if (missingGodown) {
      const { data: godownList, error: gErr } = await supabase
        .from('godowns').select('id').eq('is_active', true).order('name').limit(1);
      if (gErr) throw gErr;
      fallbackGodownId = godownList && godownList.length > 0 ? godownList[0].id : null;
    }

    const restockItems = retItems
      .filter(i => i.return_to_stock && i.product_id)
      .map(i => {
        const godownId = godownByProduct[i.product_id as string] || fallbackGodownId;
        if (!godownId) return null;
        return {
          product_id: i.product_id as string,
          godown_id: godownId,
          quantity: i.quantity,
        };
      })
      .filter(Boolean) as { product_id: string; godown_id: string; quantity: number }[];

    if (restockItems.length > 0) {
      await processStockMovement({
        type: 'return',
        items: restockItems,
        reference_type: 'sales_return',
        reference_id: ret.id,
        reference_number: ret.return_number,
        notes: 'Return ' + ret.return_number,
      });
    }

    const { error: ledgerErr } = await supabase.from('ledger_entries').insert({
      entry_date: ret.return_date,
      entry_type: 'credit',
      account_type: 'customer',
      party_id: ret.customer_id || null,
      party_name: ret.customer_name,
      reference_type: 'sales_return',
      reference_id: ret.id,
      description: 'Return ' + ret.return_number,
      amount: ret.total_amount,
    });
    if (ledgerErr) throw ledgerErr;

    const { error: updErr } = await supabase.from('sales_returns').update({ status: 'processed' }).eq('id', ret.id);
    if (updErr) throw updErr;
    loadData();
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map(r => ({
        'Return #': r.return_number,
        'Customer': r.customer_name,
        'Return Date': r.return_date,
        'Reason': r.reason || '',
        'Total Amount': r.total_amount,
        'Status': r.status,
        'Notes': r.notes || '',
      })),
      'sales-returns'
    );
  };

  const filtered = returns.filter(r =>
    r.return_number.toLowerCase().includes(search.toLowerCase()) ||
    r.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = returns.filter(r => r.status === 'pending').length;
  const totalValue = returns.reduce((s, r) => s + r.total_amount, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Sales Returns</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Manage customer returns and restock items</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search returns..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExportCSV} className="btn-secondary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Return
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Returns</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{returns.length}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Action</p>
            <p className="text-2xl font-bold text-warning-600 mt-1">{pendingCount}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Return Value</p>
            <p className="text-2xl font-bold text-error-600 mt-1">{formatCurrency(totalValue)}</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header w-8" />
                <th className="table-header text-left">Return #</th>
                <th className="table-header text-left">Customer</th>
                <th className="table-header text-left">Return Date</th>
                <th className="table-header text-left">Reason</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ret => (
                <>
                  <tr key={ret.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="table-cell w-8">
                      <button onClick={() => toggleExpand(ret.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-200">
                        {expandedRows.has(ret.id) ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
                      </button>
                    </td>
                    <td className="table-cell font-medium text-primary-700">{ret.return_number}</td>
                    <td className="table-cell font-medium">{ret.customer_name}</td>
                    <td className="table-cell text-neutral-500">{formatDate(ret.return_date)}</td>
                    <td className="table-cell text-neutral-500 max-w-[160px]">
                      <p className="truncate">{ret.reason || '-'}</p>
                    </td>
                    <td className="table-cell text-right font-semibold text-error-600">{formatCurrency(ret.total_amount)}</td>
                    <td className="table-cell"><StatusBadge status={ret.status} /></td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {ret.status === 'pending' && (
                          <button onClick={() => handleApprove(ret)}
                            className="px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
                            Approve
                          </button>
                        )}
                        {ret.status === 'approved' && (
                          <button onClick={() => handleProcess(ret)}
                            className="px-2 py-1 rounded text-xs font-medium bg-success-50 text-success-600 hover:bg-green-100 transition-colors">
                            Process &amp; Restock
                          </button>
                        )}
                        <ActionMenu items={[
                          actionView(() => openView(ret)),
                          ...(ret.status === 'pending' ? [actionEdit(() => openEdit(ret))] : []),
                          ...(ret.status === 'pending' ? [actionDelete(() => openDelete(ret))] : []),
                        ]} />
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(ret.id) && (
                    <tr key={`${ret.id}-items`} className="bg-neutral-50 border-b border-neutral-100">
                      <td colSpan={8} className="px-10 py-3">
                        {rowItems[ret.id] ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-400 uppercase text-[10px]">
                                <th className="text-left pb-1 font-semibold tracking-wider">Product</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-16">Qty</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-24">Unit Price</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-24">Total</th>
                                <th className="text-center pb-1 font-semibold tracking-wider w-24">Restock?</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowItems[ret.id].map((item, idx) => (
                                <tr key={idx} className="border-t border-neutral-200">
                                  <td className="py-1.5 text-neutral-700 font-medium">{item.product_name}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{item.quantity} {item.unit}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-1.5 text-right font-semibold text-neutral-800">{formatCurrency(item.total_price)}</td>
                                  <td className="py-1.5 text-center">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.return_to_stock ? 'bg-success-50 text-success-600' : 'bg-neutral-100 text-neutral-500'}`}>
                                      {item.return_to_stock ? 'Yes' : 'No'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-neutral-400">Loading...</p>
                        )}
                        {ret.notes && <p className="mt-2 text-xs text-neutral-500 italic">Note: {ret.notes}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={RotateCcw} title="No returns yet" description="Log a customer return." />}
        </div>
      </div>

      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Return Details" size="xl"
        footer={
          <button onClick={() => setShowViewModal(false)} className="btn-primary">Close</button>
        }>
        {selectedReturn && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="label">Return #</p>
                <p className="text-sm font-semibold text-primary-700">{selectedReturn.return_number}</p>
              </div>
              <div>
                <p className="label">Status</p>
                <StatusBadge status={selectedReturn.status} />
              </div>
              <div>
                <p className="label">Customer</p>
                <p className="text-sm font-medium">{selectedReturn.customer_name}</p>
              </div>
              <div>
                <p className="label">Return Date</p>
                <p className="text-sm">{formatDate(selectedReturn.return_date)}</p>
              </div>
              {selectedReturn.reason && (
                <div className="col-span-2">
                  <p className="label">Reason</p>
                  <p className="text-sm">{selectedReturn.reason}</p>
                </div>
              )}
              {selectedReturn.notes && (
                <div className="col-span-2">
                  <p className="label">Notes</p>
                  <p className="text-sm text-neutral-600">{selectedReturn.notes}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-neutral-700 mb-2">Return Items</p>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="table-header text-left">Product</th>
                      <th className="table-header text-right w-16">Qty</th>
                      <th className="table-header text-right w-24">Unit Price</th>
                      <th className="table-header text-right w-24">Total</th>
                      <th className="table-header text-center w-24">Restock?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-neutral-100">
                        <td className="px-3 py-2 text-sm font-medium">{item.product_name}</td>
                        <td className="px-3 py-2 text-right text-sm">{item.quantity} {item.unit}</td>
                        <td className="px-3 py-2 text-right text-sm">{formatCurrency(item.unit_price)}</td>
                        <td className="px-3 py-2 text-right text-sm font-semibold">{formatCurrency(item.total_price)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.return_to_stock ? 'bg-success-50 text-success-600' : 'bg-neutral-100 text-neutral-500'}`}>
                            {item.return_to_stock ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 pr-2">
                <div className="bg-error-50 text-error-600 px-4 py-2 rounded-lg text-sm font-bold border border-error-200">
                  Return Total: {formatCurrency(selectedReturn.total_amount)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Sales Return" size="xl"
        footer={
          <>
            <button onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleEditSave} className="btn-primary">Save Changes</button>
          </>
        }>
        <div className="space-y-4">
          {selectedReturn && (
            <div className="flex items-center gap-3 p-2 bg-neutral-50 rounded-lg">
              <p className="text-sm font-semibold text-primary-700">{selectedReturn.return_number}</p>
              <StatusBadge status={selectedReturn.status} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Linked Invoice (Optional)</label>
              <select value={editForm.invoice_id} onChange={e => handleEditInvoiceChange(e.target.value)} className="input">
                <option value="">-- Select Invoice --</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} - {i.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Customer name" />
            </div>
            <div>
              <label className="label">Return Date</label>
              <input type="date" value={editForm.return_date} onChange={e => setEditForm(f => ({ ...f, return_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Reason</label>
              <input value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} className="input" placeholder="e.g., Damaged, Wrong item, Not satisfied" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Return Items</p>
              <button onClick={addEditItem} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-right w-16">Qty</th>
                    <th className="table-header text-right w-24">Unit Price</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header text-center w-24">Restock?</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <select value={item.product_id} onChange={e => updateEditItem(i, 'product_id', e.target.value)} className="input text-xs">
                          <option value="">-- Select Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!item.product_id && <input value={item.product_name} onChange={e => updateEditItem(i, 'product_name', e.target.value)} className="input text-xs mt-1" placeholder="Or type name..." />}
                      </td>
                      <td className="px-3 py-2 w-20"><input type="number" value={item.quantity} onChange={e => updateEditItem(i, 'quantity', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 w-24"><input type="number" value={item.unit_price} onChange={e => updateEditItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 w-24 text-right text-sm font-medium">{formatCurrency(item.total_price)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => updateEditItem(i, 'return_to_stock', !item.return_to_stock)}
                          className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${item.return_to_stock ? 'bg-success-50 text-success-600 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                          {item.return_to_stock ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-3 py-2 w-8"><button onClick={() => removeEditItem(i)} className="text-neutral-400 hover:text-error-500 text-lg leading-none">&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3">
              <div className="bg-error-50 text-error-600 px-4 py-2 rounded-lg text-sm font-bold border border-error-200">
                Return Total: {formatCurrency(editTotalAmount)}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" placeholder="Additional notes..." />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Sales Return" size="xl"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">Create Return</button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Linked Invoice (Optional)</label>
              <select value={form.invoice_id} onChange={e => handleInvoiceChange(e.target.value)} className="input">
                <option value="">-- Select Invoice --</option>
                {invoices.map(i => <option key={i.id} value={i.id}>{i.invoice_number} - {i.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Customer name" />
            </div>
            <div>
              <label className="label">Return Date</label>
              <input type="date" value={form.return_date} onChange={e => setForm(f => ({ ...f, return_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="input" placeholder="e.g., Damaged, Wrong item, Not satisfied" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Return Items</p>
              <button onClick={addItem} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-right w-16">Qty</th>
                    <th className="table-header text-right w-24">Unit Price</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header text-center w-24">Restock?</th>
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
                      <td className="px-3 py-2 w-20"><input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 w-24"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 w-24 text-right text-sm font-medium">{formatCurrency(item.total_price)}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => updateItem(i, 'return_to_stock', !item.return_to_stock)}
                          className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${item.return_to_stock ? 'bg-success-50 text-success-600 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                          {item.return_to_stock ? 'Yes' : 'No'}
                        </button>
                      </td>
                      <td className="px-3 py-2 w-8"><button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-error-500 text-lg leading-none">&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3">
              <div className="bg-error-50 text-error-600 px-4 py-2 rounded-lg text-sm font-bold border border-error-200">
                Return Total: {formatCurrency(totalAmount)}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" placeholder="Additional notes..." />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Cancel Return"
        message={selectedReturn ? `Are you sure you want to cancel return ${selectedReturn.return_number}? This action cannot be undone.` : ''}
        confirmLabel="Cancel Return"
        isDanger
      />
    </div>
  );
}
