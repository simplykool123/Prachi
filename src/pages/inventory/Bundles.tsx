import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Package, Pencil, Trash2 } from 'lucide-react';
import { supabase, runQueryWithGlobalRecovery } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ProductCombobox from '../../components/ui/ProductCombobox';
import { useToast } from '../../components/ui/Toast';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import type { Product, ProductBundle, ProductBundleItem } from '../../types';

type BundleRow = ProductBundle & { items: (ProductBundleItem & { product?: Pick<Product, 'id' | 'name' | 'selling_price' | 'unit'> })[] };

interface ItemForm {
  product_id: string;
  quantity: string;
}

// Build the bundle's display name from its items, e.g. "Crystal + Yantra (+1)"
const buildBundleName = (
  items: { product_id: string; quantity: number }[],
  productMap: Record<string, Product>
): string => {
  const names = items
    .map(it => productMap[it.product_id]?.name)
    .filter((n): n is string => !!n);
  if (names.length === 0) return 'Combo';
  if (names.length <= 2) return names.join(' + ');
  return `${names.slice(0, 2).join(' + ')} (+${names.length - 2})`;
};

export default function Bundles() {
  const toast = useToast();
  const { saving, run: runSave } = useAsyncAction();
  const { saving: deleting, run: runDelete } = useAsyncAction();

  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BundleRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BundleRow | null>(null);

  // Slim form: just price, active flag, and the items list.
  const [bundlePrice, setBundlePrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [items, setItems] = useState<ItemForm[]>([{ product_id: '', quantity: '1' }]);

  const productMap = useMemo(() => {
    const m: Record<string, Product> = {};
    for (const p of products) m[p.id] = p;
    return m;
  }, [products]);

  const loadData = async () => {
    setLoading(true);
    const [bundlesRes, productsRes] = await Promise.all([
      runQueryWithGlobalRecovery(
        () => supabase
          .from('product_bundles')
          .select('*, items:product_bundle_items(*)')
          .order('created_at', { ascending: false }),
        { label: 'bundles-list' }
      ),
      runQueryWithGlobalRecovery(
        () => supabase.from('products').select('id, name, selling_price, unit, image_url').eq('is_active', true).order('name'),
        { label: 'bundles-products' }
      ),
    ]);
    if (bundlesRes.error) {
      console.error('Failed to load bundles', bundlesRes.error);
      toast.error('Could not load bundles');
    } else {
      const rows = (bundlesRes.data || []) as BundleRow[];
      rows.forEach(b => {
        b.items = (b.items || []).slice().sort((a, c) => (a.sort_order || 0) - (c.sort_order || 0));
      });
      setBundles(rows);
    }
    if (productsRes.data) setProducts(productsRes.data as Product[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return bundles;
    const q = search.toLowerCase();
    return bundles.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.items.some(it => productMap[it.product_id]?.name?.toLowerCase().includes(q))
    );
  }, [bundles, search, productMap]);

  const openAdd = () => {
    setEditing(null);
    setBundlePrice('');
    setIsActive(true);
    setItems([{ product_id: '', quantity: '1' }, { product_id: '', quantity: '1' }]);
    setShowModal(true);
  };

  const openEdit = (b: BundleRow) => {
    setEditing(b);
    setBundlePrice(String(b.bundle_price ?? ''));
    setIsActive(b.is_active);
    setItems(
      (b.items && b.items.length > 0)
        ? b.items.map(it => ({ product_id: it.product_id, quantity: String(it.quantity) }))
        : [{ product_id: '', quantity: '1' }]
    );
    setShowModal(true);
  };

  const addItemRow = () => setItems(prev => [...prev, { product_id: '', quantity: '1' }]);
  const updateItem = (idx: number, key: keyof ItemForm, value: string) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  };
  const removeItem = (idx: number) => {
    setItems(prev => prev.length === 1 ? prev : prev.filter((_, i) => i !== idx));
  };

  // Auto-computed values shown live as the user picks products
  const validItemsPreview = useMemo(
    () => items
      .map(it => ({ product_id: it.product_id, quantity: parseFloat(it.quantity) || 0 }))
      .filter(it => it.product_id && it.quantity > 0),
    [items]
  );
  const previewName = useMemo(() => buildBundleName(validItemsPreview, productMap), [validItemsPreview, productMap]);
  const computedOriginal = useMemo(() => validItemsPreview.reduce(
    (sum, it) => sum + ((productMap[it.product_id]?.selling_price || 0) * it.quantity),
    0,
  ), [validItemsPreview, productMap]);
  const previewSavings = (parseFloat(bundlePrice) || 0) > 0 ? computedOriginal - (parseFloat(bundlePrice) || 0) : 0;

  const handleSave = async () => {
    const priceNum = parseFloat(bundlePrice);
    if (!isFinite(priceNum) || priceNum <= 0) {
      toast.error('Combo price must be greater than 0');
      return;
    }
    if (validItemsPreview.length < 2) {
      toast.error('Pick at least 2 products for a combo');
      return;
    }
    // Schema has UNIQUE(bundle_id, product_id) — same product can't appear twice; bump qty instead.
    const seen = new Set<string>();
    for (const it of validItemsPreview) {
      if (seen.has(it.product_id)) {
        toast.error('Each product can only appear once. Increase its quantity instead.');
        return;
      }
      seen.add(it.product_id);
    }

    await runSave(async () => {
      // Auto-derived from constituent products. Re-derived on every save so
      // renaming a product flows through next time the combo is edited.
      const name = buildBundleName(validItemsPreview, productMap);

      const payload = {
        name,
        bundle_price: priceNum,
        is_active: isActive,
        // Default the website-visible flag ON so the customer site picks it up
        // automatically. Staff don't need to think about it.
        show_on_website: true,
      };

      let bundleId: string;
      if (editing) {
        const { error } = await supabase.from('product_bundles').update(payload).eq('id', editing.id);
        if (error) throw error;
        bundleId = editing.id;
      } else {
        const { data, error } = await supabase.from('product_bundles').insert(payload).select('id').single();
        if (error) throw error;
        bundleId = (data as { id: string }).id;
      }

      const rows = validItemsPreview.map((it, idx) => ({
        bundle_id: bundleId,
        product_id: it.product_id,
        quantity: it.quantity,
        sort_order: idx,
      }));
      const { error: upsertErr } = await supabase
        .from('product_bundle_items')
        .upsert(rows, { onConflict: 'bundle_id,product_id' });
      if (upsertErr) throw upsertErr;

      const keepIds = validItemsPreview.map(it => it.product_id);
      const { error: delErr } = await supabase
        .from('product_bundle_items')
        .delete()
        .eq('bundle_id', bundleId)
        .not('product_id', 'in', `(${keepIds.map(id => `"${id}"`).join(',')})`);
      if (delErr) throw delErr;

      setShowModal(false);
      setEditing(null);
      await loadData();
    }, { success: editing ? 'Combo updated' : 'Combo created', errorPrefix: 'Save failed' });
  };

  const toggleActive = async (b: BundleRow) => {
    const newVal = !b.is_active;
    setBundles(prev => prev.map(x => x.id === b.id ? { ...x, is_active: newVal } : x));
    const { error } = await supabase.from('product_bundles').update({ is_active: newVal }).eq('id', b.id);
    if (error) {
      setBundles(prev => prev.map(x => x.id === b.id ? { ...x, is_active: !newVal } : x));
      toast.error('Could not update active status');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await runDelete(async () => {
      const { error } = await supabase.from('product_bundles').delete().eq('id', confirmDelete.id);
      if (error) throw error;
      setConfirmDelete(null);
      await loadData();
    }, { success: 'Combo deleted', errorPrefix: 'Delete failed' });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-neutral-800">Combos</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Pick 2+ products and set one combo price. The name is auto-built from the products.</p>
        </div>
        <button onClick={openAdd} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> New Combo
        </button>
      </div>

      <div className="card mb-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search combos by product name..."
            className="input text-xs pl-8"
          />
        </div>
        <p className="text-[11px] text-neutral-400">{filtered.length} combo{filtered.length === 1 ? '' : 's'}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Package} title="No combos yet" description="Create your first combo offer to bundle products at a discount." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr className="text-left text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
                <th className="px-3 py-2">Combo</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2 text-right">MRP</th>
                <th className="px-3 py-2 text-right">Combo Price</th>
                <th className="px-3 py-2 text-right">Save</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => {
                const original = b.items.reduce((s, it) => {
                  const p = productMap[it.product_id];
                  return s + (p ? (p.selling_price || 0) * (it.quantity || 0) : 0);
                }, 0);
                const savings = original - (b.bundle_price || 0);
                return (
                  <tr key={b.id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                    <td className="px-3 py-2 font-medium text-neutral-800">{b.name}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {b.items.map(it => {
                        const p = productMap[it.product_id];
                        return (p?.name || '?') + (it.quantity > 1 ? ` ×${it.quantity}` : '');
                      }).join(', ')}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-400 line-through">
                      {original > 0 ? formatCurrency(original) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-neutral-900">
                      {formatCurrency(b.bundle_price || 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {savings > 0 ? (
                        <span className="text-[10px] font-semibold text-success-700 bg-success-50 px-1.5 py-0.5 rounded">
                          {formatCurrency(savings)}
                        </span>
                      ) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={b.is_active} onChange={() => toggleActive(b)} className="h-3.5 w-3.5" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(b)} className="p-1 rounded hover:bg-neutral-100 text-neutral-400 hover:text-primary-600" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(b)} className="p-1 rounded hover:bg-error-50 text-neutral-400 hover:text-error-600" title="Delete">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? `Edit Combo` : 'New Combo'}
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Products in this combo</label>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProductCombobox
                      products={products}
                      value={it.product_id}
                      onSelect={(p) => updateItem(idx, 'product_id', p.id)}
                    />
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={it.quantity}
                    onChange={e => updateItem(idx, 'quantity', e.target.value)}
                    className="input w-16 text-xs text-center"
                    title="Quantity"
                  />
                  <button
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                    className="p-1.5 rounded hover:bg-error-50 text-neutral-400 hover:text-error-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addItemRow} className="btn-ghost text-xs mt-2">
              <Plus className="w-3 h-3" /> Add another product
            </button>
          </div>

          <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">Combo name (auto):</span>
              <span className="font-semibold text-neutral-800">{previewName}</span>
            </div>
            {computedOriginal > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Items total (MRP):</span>
                <span className="font-medium text-neutral-700">{formatCurrency(computedOriginal)}</span>
              </div>
            )}
            {previewSavings > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Customer saves:</span>
                <span className="font-semibold text-success-700">{formatCurrency(previewSavings)}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Combo Price (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={bundlePrice}
                onChange={e => setBundlePrice(e.target.value)}
                className="input text-xs"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer pb-2">
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-3.5 w-3.5" />
                Active (sells on website)
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="btn-ghost text-xs">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
              {saving ? 'Saving...' : (editing ? 'Update Combo' : 'Create Combo')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete combo?"
        message={confirmDelete ? `"${confirmDelete.name}" will be removed. Existing sales orders that referenced it stay intact.` : ''}
        confirmLabel={deleting ? 'Deleting...' : 'Delete'}
        variant="danger"
      />
    </div>
  );
}
