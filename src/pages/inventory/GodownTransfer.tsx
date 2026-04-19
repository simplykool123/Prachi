import { useState, useEffect } from 'react';
import { Plus, ArrowRight, Warehouse, Package, Search, ChevronDown, ChevronRight, Download, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, nextDocNumber, exportToCSV } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useDateRange } from '../../contexts/DateRangeContext';
import type { Godown } from '../../types';
import { processStockMovement } from '../../services/stockService';

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  stock_quantity: number;
}

interface TransferItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  available_qty: number;
}

interface Transfer {
  id: string;
  transfer_number: string;
  transfer_date: string;
  from_godown_id: string;
  from_godown_name: string;
  to_godown_id: string;
  to_godown_name: string;
  reason: string;
  notes: string;
  status: 'completed';
  total_items: number;
  created_at: string;
}

interface TransferDetail {
  id: string;
  transfer_id: string;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
}

export default function GodownTransfer() {
  const { dateRange } = useDateRange();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [rowDetails, setRowDetails] = useState<Record<string, TransferDetail[]>>({});
  const [godownStockMap, setGodownStockMap] = useState<Record<string, Record<string, number>>>({});
  const [confirmCancel, setConfirmCancel] = useState<Transfer | null>(null);

  const [form, setForm] = useState({
    transfer_date: new Date().toISOString().split('T')[0],
    from_godown_id: '',
    to_godown_id: '',
    reason: '',
    notes: '',
  });
  const [items, setItems] = useState<TransferItem[]>([
    { product_id: '', product_name: '', unit: 'pcs', quantity: '1', available_qty: 0 },
  ]);

  const [tablesMissing, setTablesMissing] = useState(false);

  useEffect(() => { loadData(); }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    const [godownsRes, productsRes, transfersRes] = await Promise.all([
      supabase.from('godowns').select('*').eq('is_active', true).order('name'),
      supabase.from('products').select('id, name, unit, stock_quantity').eq('is_active', true).order('name'),
      supabase.from('godown_transfers').select('*')
        .gte('transfer_date', dateRange.from)
        .lte('transfer_date', dateRange.to)
        .order('created_at', { ascending: false }),
    ]);
    setGodowns(godownsRes.data || []);
    setProducts((productsRes.data || []) as ProductOption[]);
    if (transfersRes.error && 'code' in transfersRes.error && transfersRes.error.code === 'PGRST205') {
      setTablesMissing(true);
    } else {
      setTablesMissing(false);
      setTransfers((transfersRes.data || []) as Transfer[]);
    }
    setLoading(false);
  };

  const loadGodownStock = async (godownId: string) => {
    if (godownStockMap[godownId]) return;
    const { data } = await supabase
      .from('godown_stock')
      .select('product_id, quantity')
      .eq('godown_id', godownId);
    const stockMap: Record<string, number> = {};
    (data || []).forEach(r => { stockMap[r.product_id] = r.quantity || 0; });
    setGodownStockMap(prev => ({ ...prev, [godownId]: stockMap }));
    return stockMap;
  };

  const handleFromGodownChange = async (godownId: string) => {
    setForm(f => ({ ...f, from_godown_id: godownId }));
    if (godownId) {
      const map = godownStockMap[godownId] || await loadGodownStock(godownId) || {};
      setItems(prev => prev.map(item => ({
        ...item,
        available_qty: item.product_id ? (map[item.product_id] || 0) : 0,
      })));
    }
  };

  const addItem = () => setItems(prev => [...prev, {
    product_id: '', product_name: '', unit: 'pcs', quantity: '1', available_qty: 0,
  }]);

  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) {
          next[i].product_name = p.name;
          next[i].unit = p.unit;
          const stockMap = godownStockMap[form.from_godown_id] || {};
          next[i].available_qty = stockMap[p.id] || 0;
        }
      }
      return next;
    });
  };

  const toggleExpand = async (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) { next.delete(id); }
    else {
      next.add(id);
      if (!rowDetails[id]) {
        const { data } = await supabase.from('godown_transfer_items').select('*').eq('transfer_id', id);
        setRowDetails(prev => ({ ...prev, [id]: (data || []) as TransferDetail[] }));
      }
    }
    setExpandedRows(next);
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_id && parseFloat(i.quantity) > 0);
    if (!form.from_godown_id || !form.to_godown_id || validItems.length === 0) return;
    if (form.from_godown_id === form.to_godown_id) {
      alert('From and To godowns cannot be the same.');
      return;
    }

    const errors: string[] = [];
    const fromMap = godownStockMap[form.from_godown_id] || {};
    for (const item of validItems) {
      const qty = parseFloat(item.quantity);
      const avail = fromMap[item.product_id] || 0;
      if (qty > avail) {
        errors.push(`${item.product_name}: only ${avail} available, requested ${qty}`);
      }
    }
    if (errors.length > 0) {
      alert('Insufficient stock:\n' + errors.join('\n'));
      return;
    }

    setSaving(true);

    const fromGodown = godowns.find(g => g.id === form.from_godown_id);
    const toGodown = godowns.find(g => g.id === form.to_godown_id);
    const transferNumber = await nextDocNumber('TRF', supabase);

    const { data: transfer, error: transferError } = await supabase.from('godown_transfers').insert({
      transfer_number: transferNumber,
      transfer_date: form.transfer_date,
      from_godown_id: form.from_godown_id,
      from_godown_name: fromGodown?.name || '',
      to_godown_id: form.to_godown_id,
      to_godown_name: toGodown?.name || '',
      reason: form.reason,
      notes: form.notes,
      status: 'completed',
      total_items: validItems.length,
    }).select().single();
    if (transferError) throw transferError;

    if (transfer) {
      const { error: itemsError } = await supabase.from('godown_transfer_items').insert(
        validItems.map(item => ({
          transfer_id: transfer.id,
          product_id: item.product_id,
          product_name: item.product_name,
          unit: item.unit,
          quantity: parseFloat(item.quantity),
        }))
      );
      if (itemsError) throw itemsError;

      const outItems = validItems.map(item => ({
        product_id: item.product_id,
        godown_id: form.from_godown_id,
        quantity: parseFloat(item.quantity),
      }));
      const inItems = validItems.map(item => ({
        product_id: item.product_id,
        godown_id: form.to_godown_id,
        quantity: parseFloat(item.quantity),
      }));

      await processStockMovement({
        type: 'transfer_out',
        items: outItems,
        reference_type: 'godown_transfer',
        reference_id: transfer.id,
        reference_number: transferNumber,
        notes: `Transfer out to ${toGodown?.name} (${transferNumber})`,
      });
      await processStockMovement({
        type: 'transfer_in',
        items: inItems,
        reference_type: 'godown_transfer',
        reference_id: transfer.id,
        reference_number: transferNumber,
        notes: `Transfer in from ${fromGodown?.name} (${transferNumber})`,
      });
    }

    setShowModal(false);
    setForm({ transfer_date: new Date().toISOString().split('T')[0], from_godown_id: '', to_godown_id: '', reason: '', notes: '' });
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', available_qty: 0 }]);
    setGodownStockMap({});
    setSaving(false);
    loadData();
  };

  const handleExport = () => {
    exportToCSV(
      filtered.map(t => ({
        'Transfer #': t.transfer_number,
        'Date': t.transfer_date,
        'From': t.from_godown_name,
        'To': t.to_godown_name,
        'Items': t.total_items,
        'Reason': t.reason || '',
        'Status': t.status,
      })),
      'godown-transfers'
    );
  };

  const filtered = transfers.filter(t =>
    !search ||
    t.transfer_number.toLowerCase().includes(search.toLowerCase()) ||
    t.from_godown_name.toLowerCase().includes(search.toLowerCase()) ||
    t.to_godown_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalTransfers = filtered.length;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Stock Transfers</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Move stock between godowns with a full audit trail</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transfers..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExport} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New Transfer
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {tablesMissing && (
          <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-warning-800 mb-1">Database setup required</p>
            <p className="text-xs text-warning-700 mb-3">
              The Stock Transfers module needs two new tables. Please run the following SQL in your{' '}
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline font-medium">Supabase Dashboard → SQL Editor</a>:
            </p>
            <pre className="bg-warning-100 rounded p-3 text-[10px] text-warning-900 overflow-x-auto whitespace-pre-wrap">{`create table if not exists godown_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_number text not null unique,
  transfer_date date not null,
  from_godown_id uuid references godowns(id),
  from_godown_name text not null default '',
  to_godown_id uuid references godowns(id),
  to_godown_name text not null default '',
  reason text, notes text,
  status text not null default 'completed',
  total_items integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists godown_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references godown_transfers(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  unit text not null default 'pcs',
  quantity numeric not null default 0,
  created_at timestamptz default now()
);
alter table godown_transfers enable row level security;
alter table godown_transfer_items enable row level security;
create policy "Allow all for authenticated" on godown_transfers for all to authenticated using (true) with check (true);
create policy "Allow all for authenticated" on godown_transfer_items for all to authenticated using (true) with check (true);`}</pre>
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Transfers</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{totalTransfers}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Active Godowns</p>
            <p className="text-2xl font-bold text-primary-700 mt-1">{godowns.length}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Products Transferred</p>
            <p className="text-2xl font-bold text-accent-600 mt-1">{filtered.reduce((s, t) => s + t.total_items, 0)}</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header w-8" />
                <th className="table-header text-left">Transfer #</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">From Godown</th>
                <th className="table-header text-left">To Godown</th>
                <th className="table-header text-center">Items</th>
                <th className="table-header text-left">Reason</th>
                <th className="table-header text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <>
                  <tr key={t.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="table-cell w-8">
                      <button onClick={() => toggleExpand(t.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-200">
                        {expandedRows.has(t.id) ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
                      </button>
                    </td>
                    <td className="table-cell font-medium text-primary-700">{t.transfer_number}</td>
                    <td className="table-cell text-neutral-500">{formatDate(t.transfer_date)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <Warehouse className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-sm font-medium text-neutral-800">{t.from_godown_name}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-primary-500" />
                        <Warehouse className="w-3.5 h-3.5 text-primary-400" />
                        <span className="text-sm font-medium text-primary-700">{t.to_godown_name}</span>
                      </div>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-xs bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-medium">{t.total_items}</span>
                    </td>
                    <td className="table-cell text-neutral-500 max-w-[160px]">
                      <p className="truncate text-xs">{t.reason || '—'}</p>
                    </td>
                    <td className="table-cell">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success-700 bg-success-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Completed
                      </span>
                    </td>
                  </tr>
                  {expandedRows.has(t.id) && (
                    <tr key={`${t.id}-items`} className="bg-neutral-50 border-b border-neutral-100">
                      <td colSpan={8} className="px-10 py-3">
                        {rowDetails[t.id] ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-400 uppercase text-[10px]">
                                <th className="text-left pb-1 font-semibold tracking-wider">Product</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-20">Unit</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-24">Qty Transferred</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowDetails[t.id].map((d, idx) => (
                                <tr key={idx} className="border-t border-neutral-200">
                                  <td className="py-1.5 font-medium text-neutral-700 flex items-center gap-1.5">
                                    <Package className="w-3 h-3 text-neutral-400" /> {d.product_name}
                                  </td>
                                  <td className="py-1.5 text-right text-neutral-500">{d.unit}</td>
                                  <td className="py-1.5 text-right font-bold text-primary-700">{d.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-neutral-400">Loading...</p>
                        )}
                        {t.notes && <p className="mt-2 text-xs text-neutral-500 italic">Note: {t.notes}</p>}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <EmptyState icon={ArrowRight} title="No transfers yet" description="Create a transfer to move stock between godowns." />
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Stock Transfer" size="xl"
        footer={
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Complete Transfer'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Transfer Date</label>
              <input type="date" value={form.transfer_date} onChange={e => setForm(f => ({ ...f, transfer_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">From Godown <span className="text-error-500">*</span></label>
              <select value={form.from_godown_id} onChange={e => handleFromGodownChange(e.target.value)} className="input">
                <option value="">Select source...</option>
                {godowns.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">To Godown <span className="text-error-500">*</span></label>
              <select value={form.to_godown_id} onChange={e => setForm(f => ({ ...f, to_godown_id: e.target.value }))} className="input">
                <option value="">Select destination...</option>
                {godowns.filter(g => g.id !== form.from_godown_id).map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Reason</label>
              <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="input" placeholder="e.g. Replenish shop stock" />
            </div>
            <div>
              <label className="label">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Transfer Items <span className="text-error-500">*</span></label>
              <button onClick={addItem} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-center w-24">Available</th>
                    <th className="table-header text-center w-32">Qty to Transfer</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <select
                          value={item.product_id}
                          onChange={e => updateItem(i, 'product_id', e.target.value)}
                          className="input text-xs py-1"
                        >
                          <option value="">Select product...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {item.product_id ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${item.available_qty <= 0 ? 'bg-error-50 text-error-600' : item.available_qty <= 5 ? 'bg-warning-50 text-warning-700' : 'bg-success-50 text-success-700'}`}>
                            {item.available_qty} {item.unit}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="1"
                          max={item.available_qty}
                          value={item.quantity}
                          onChange={e => updateItem(i, 'quantity', e.target.value)}
                          className="input text-xs py-1 text-center w-full"
                          placeholder="Qty"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(i)} className="text-neutral-300 hover:text-error-500 transition-colors text-xs">✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {form.from_godown_id && form.to_godown_id && (
            <div className="bg-primary-50 rounded-lg p-3 flex items-center gap-3 text-xs text-primary-700">
              <Warehouse className="w-4 h-4 shrink-0" />
              <span>
                Stock will move from <strong>{godowns.find(g => g.id === form.from_godown_id)?.name}</strong>
                {' → '}
                <strong>{godowns.find(g => g.id === form.to_godown_id)?.name}</strong>.
                Total product stock will remain unchanged.
              </span>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmCancel}
        title="Cancel Transfer"
        message="This action cannot be undone."
        onClose={() => setConfirmCancel(null)}
        onConfirm={() => setConfirmCancel(null)}
        onCancel={() => setConfirmCancel(null)}
      />
    </div>
  );
}
