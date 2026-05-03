import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, AlertCircle, Truck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatError, formatCurrency } from '../lib/utils';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { useToast } from '../components/ui/Toast';

interface Rate {
  id: string;
  label: string;
  min_weight_grams: number;
  max_weight_grams: number;
  rate_inr: number;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_FORM = {
  label: '', min_weight_grams: '', max_weight_grams: '',
  rate_inr: '', is_active: true, sort_order: '0',
};

export default function ShippingRates() {
  const toast = useToast();
  const [rates, setRates] = useState<Rate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Rate | null>(null);
  const [confirmDel, setConfirmDel] = useState<Rate | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('shipping_rates')
      .select('*')
      .order('sort_order', { ascending: true });
    if (err) { setError(formatError(err)); setLoading(false); return; }
    setRates((data || []) as Rate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    // Default new sort_order to (max + 10) so new rows land at the bottom
    // without forcing the admin to think about ordering.
    const nextSort = rates.length ? Math.max(...rates.map(r => r.sort_order)) + 10 : 10;
    setForm({ ...EMPTY_FORM, sort_order: String(nextSort) });
    setShowModal(true);
  };

  const openEdit = (r: Rate) => {
    setEditing(r);
    setForm({
      label: r.label,
      min_weight_grams: String(r.min_weight_grams),
      max_weight_grams: String(r.max_weight_grams),
      rate_inr: String(r.rate_inr),
      is_active: r.is_active,
      sort_order: String(r.sort_order),
    });
    setShowModal(true);
  };

  const save = async () => {
    setError('');
    const min = parseInt(form.min_weight_grams, 10);
    const max = parseInt(form.max_weight_grams, 10);
    const rate = parseFloat(form.rate_inr);
    const sort = parseInt(form.sort_order, 10) || 0;
    if (!form.label.trim()) { toast.error('Label required'); return; }
    if (Number.isNaN(min) || min < 0) { toast.error('Min weight must be ≥ 0'); return; }
    if (Number.isNaN(max) || max <= min) { toast.error('Max weight must be greater than min'); return; }
    if (Number.isNaN(rate) || rate < 0) { toast.error('Rate must be ≥ 0'); return; }
    setSaving(true);
    const payload = {
      label: form.label.trim(),
      min_weight_grams: min,
      max_weight_grams: max,
      rate_inr: rate,
      is_active: form.is_active,
      sort_order: sort,
      updated_at: new Date().toISOString(),
    };
    const op = editing
      ? supabase.from('shipping_rates').update(payload).eq('id', editing.id)
      : supabase.from('shipping_rates').insert(payload);
    const { error: err } = await op;
    setSaving(false);
    if (err) { setError(formatError(err)); return; }
    toast.success(editing ? 'Rate updated' : 'Rate added');
    setShowModal(false);
    await load();
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    const { error: err } = await supabase.from('shipping_rates').delete().eq('id', confirmDel.id);
    if (err) { toast.error(formatError(err)); return; }
    toast.success('Rate removed');
    setConfirmDel(null);
    await load();
  };

  const toggleActive = async (r: Rate) => {
    const { error: err } = await supabase
      .from('shipping_rates')
      .update({ is_active: !r.is_active, updated_at: new Date().toISOString() })
      .eq('id', r.id);
    if (err) { toast.error(formatError(err)); return; }
    await load();
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-neutral-900">Shipping Rates</h1>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Slab pricing for the website cart. Weights in grams, rates in INR.
          </p>
        </div>
        <button onClick={openNew} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Slab
        </button>
      </div>

      <div className="p-5">
        {error && (
          <div className="flex items-start gap-2 bg-error-50 border border-error-200 text-error-700 text-xs rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : rates.length === 0 ? (
          <EmptyState icon={Truck} title="No shipping rates yet" description="Add your first slab to enable weight-based shipping." />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px] w-12">#</th>
                  <th className="text-left px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Label</th>
                  <th className="text-right px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Min (g)</th>
                  <th className="text-right px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Max (g)</th>
                  <th className="text-right px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Rate (₹)</th>
                  <th className="text-center px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Active</th>
                  <th className="text-right px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rates.map(r => (
                  <tr key={r.id} className={`border-b border-neutral-50 ${!r.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-neutral-400">{r.sort_order}</td>
                    <td className="px-3 py-2 font-medium text-neutral-800">{r.label}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{r.min_weight_grams.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right text-neutral-600">{r.max_weight_grams.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(r.rate_inr)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggleActive(r)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${r.is_active ? 'bg-primary-600' : 'bg-neutral-300'}`}
                        aria-pressed={r.is_active}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${r.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-primary-600" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDel(r)} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-error-600" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={editing ? `Edit Slab — ${editing.label}` : 'Add Shipping Slab'}
          size="md"
          footer={
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary text-xs">
                {saving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Slab')}
              </button>
            </div>
          }
        >
          <div className="space-y-3 p-4">
            <div>
              <label className="label">Label</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} className="input text-xs" placeholder="e.g. 1 – 2 kg" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Min Weight (g)</label>
                <input type="number" min="0" value={form.min_weight_grams} onChange={e => setForm(f => ({ ...f, min_weight_grams: e.target.value }))} className="input text-xs text-right" />
              </div>
              <div>
                <label className="label">Max Weight (g)</label>
                <input type="number" min="0" value={form.max_weight_grams} onChange={e => setForm(f => ({ ...f, max_weight_grams: e.target.value }))} className="input text-xs text-right" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Rate (₹)</label>
                <input type="number" min="0" step="0.01" value={form.rate_inr} onChange={e => setForm(f => ({ ...f, rate_inr: e.target.value }))} className="input text-xs text-right" />
              </div>
              <div>
                <label className="label">Sort Order</label>
                <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} className="input text-xs text-right" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-700">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              Active (shown on website)
            </label>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <ConfirmDialog
          isOpen={!!confirmDel}
          onClose={() => setConfirmDel(null)}
          onConfirm={doDelete}
          title="Delete Shipping Slab"
          message={`Remove "${confirmDel.label}"? This affects the website's shipping calculation immediately.`}
          confirmText="Delete"
          variant="danger"
        />
      )}
    </div>
  );
}
