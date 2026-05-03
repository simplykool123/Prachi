import { useEffect, useMemo, useState } from 'react';
import { Save, Search, Upload, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/utils';
import { useToast } from '../../components/ui/Toast';
import EmptyState from '../../components/ui/EmptyState';
import type { Product } from '../../types';

type Row = Pick<Product, 'id' | 'sku' | 'name' | 'category' | 'sub_category'> & {
  weight_grams: number | null;
  // Working copy that the user is editing in the grid; flushed to DB on Save.
  draft: string;
  dirty: boolean;
};

export default function BulkWeightEditor() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'missing' | 'fallback'>('all');
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('products')
      .select('id, sku, name, category, sub_category, weight_grams')
      .order('name', { ascending: true });
    if (err) {
      setError(formatError(err));
      setLoading(false);
      return;
    }
    setRows((data || []).map(p => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.category,
      sub_category: p.sub_category,
      weight_grams: p.weight_grams ?? null,
      draft: p.weight_grams != null ? String(p.weight_grams) : '',
      dirty: false,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      // 500g is the seeded fallback applied by migration 20260503000001 to
      // every product that didn't have a weight. The "Fallback only" filter
      // surfaces exactly those rows so the admin can refine them.
      if (filter === 'missing'  && r.weight_grams != null && r.weight_grams !== 0) return false;
      if (filter === 'fallback' && r.weight_grams !== 500) return false;
      if (!q) return true;
      return (r.name || '').toLowerCase().includes(q)
          || (r.sku  || '').toLowerCase().includes(q)
          || (r.category || '').toLowerCase().includes(q)
          || (r.sub_category || '').toLowerCase().includes(q);
    });
  }, [rows, search, filter]);

  const setDraft = (id: string, value: string) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, draft: value, dirty: true } : r));
  };

  const dirtyCount = rows.filter(r => r.dirty).length;

  const saveAll = async () => {
    const dirty = rows.filter(r => r.dirty);
    if (dirty.length === 0) {
      toast.info('Nothing to save');
      return;
    }
    setSaving(true);
    setError('');
    let ok = 0;
    let fail = 0;
    // One UPDATE per row keeps the SQL trivial and lets us continue past
    // a single bad value rather than aborting the whole batch.
    for (const r of dirty) {
      const parsed = r.draft.trim() === '' ? null : Math.max(0, Math.round(Number(r.draft)));
      if (r.draft.trim() !== '' && (parsed === null || Number.isNaN(parsed))) {
        fail++;
        continue;
      }
      const { error: err } = await supabase
        .from('products')
        .update({ weight_grams: parsed, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (err) { fail++; continue; }
      ok++;
    }
    setSaving(false);
    setSavedCount(ok);
    if (fail > 0) toast.error(`${ok} saved, ${fail} failed — check the highlighted rows`);
    else toast.success(`Saved ${ok} product weight${ok === 1 ? '' : 's'}`);
    await load();
  };

  // CSV format: sku,weight_grams. Header row optional. Unknown SKUs ignored
  // (with a count in the toast) so a partial SKU file doesn't throw.
  const onCsvUpload = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const bySku: Record<string, number> = {};
    let parsed = 0;
    for (const line of lines) {
      const [skuRaw, wRaw] = line.split(',').map(s => (s || '').trim());
      if (!skuRaw || !wRaw) continue;
      if (skuRaw.toLowerCase() === 'sku') continue; // skip header
      const w = Math.max(0, Math.round(Number(wRaw)));
      if (Number.isNaN(w)) continue;
      bySku[skuRaw] = w;
      parsed++;
    }
    if (parsed === 0) {
      toast.error('No valid sku,weight rows found in CSV');
      return;
    }
    let matched = 0;
    setRows(rs => rs.map(r => {
      if (r.sku && bySku[r.sku] !== undefined) {
        matched++;
        return { ...r, draft: String(bySku[r.sku]), dirty: true };
      }
      return r;
    }));
    toast.success(`Matched ${matched} of ${parsed} rows — review and Save All`);
  };

  const exportCsv = () => {
    const header = 'sku,name,weight_grams\n';
    const body = rows.map(r =>
      `${(r.sku || '').replace(/,/g, ' ')},${(r.name || '').replace(/,/g, ' ')},${r.weight_grams ?? ''}`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-weights-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-neutral-900">Bulk Weight Editor</h1>
          <p className="text-[11px] text-neutral-400 mt-0.5">
            Set shipping weight (in grams) for products in bulk. Used by the website cart to compute courier charges.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="btn-secondary text-xs cursor-pointer flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) { onCsvUpload(f); e.target.value = ''; } }}
            />
          </label>
          <button onClick={exportCsv} className="btn-secondary text-xs flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : `Save All${dirtyCount ? ` (${dirtyCount})` : ''}`}
          </button>
        </div>
      </div>

      <div className="p-5">
        {error && (
          <div className="flex items-start gap-2 bg-error-50 border border-error-200 text-error-700 text-xs rounded-lg px-3 py-2 mb-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}
        {savedCount > 0 && !saving && (
          <div className="flex items-center gap-2 text-xs text-success-700 mb-3">
            <CheckCircle className="w-3.5 h-3.5" /> Last save: {savedCount} row{savedCount === 1 ? '' : 's'}
          </div>
        )}

        <div className="card p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, SKU or category..."
                className="input text-xs pl-8 w-full"
              />
            </div>
            {(['all', 'missing', 'fallback'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  filter === f
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                }`}
              >
                {f === 'all' ? `All (${rows.length})` :
                 f === 'missing' ? 'Missing only' :
                 'Fallback (500 g) only'}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No products match" description="Adjust the filter or search." />
          ) : (
            <div className="overflow-x-auto -mx-3">
              <table className="w-full text-xs">
                <thead className="bg-neutral-50 border-y border-neutral-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">SKU</th>
                    <th className="text-left px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Product</th>
                    <th className="text-left px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Category</th>
                    <th className="text-right px-3 py-2 font-semibold text-neutral-500 uppercase tracking-wider text-[10px]">Weight (g)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} className={`border-b border-neutral-50 ${r.dirty ? 'bg-warning-50/40' : ''}`}>
                      <td className="px-3 py-1.5 text-neutral-500 font-mono text-[10px]">{r.sku}</td>
                      <td className="px-3 py-1.5 text-neutral-800 font-medium">{r.name}</td>
                      <td className="px-3 py-1.5 text-neutral-500">
                        {r.category}{r.sub_category ? ` / ${r.sub_category}` : ''}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={r.draft}
                          onChange={e => setDraft(r.id, e.target.value)}
                          className="input text-xs py-1 text-right w-24 inline-block"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
