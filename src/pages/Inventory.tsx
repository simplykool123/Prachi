import React, { useState, useEffect, useRef } from 'react';
import { Plus, ArrowUpDown, Search, BarChart2, AlertTriangle, ImagePlus, Download, History, Pencil, Trash2, Eye, X, MoreVertical, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { formatCurrency, generateId, exportToCSV, formatDate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Product, ProductUnit, ProductVariant, ProductType, StockMovement, Godown } from '../types';
import { fetchCompanies } from '../lib/companiesService';
import type { Company } from '../lib/companiesService';
import { processStockMovement } from '../services/stockService';

const CATEGORIES = ['All', 'Astro Products', 'Vastu Items', 'Healing Items'] as const;
const UNITS = ['pcs', 'grams', 'kg', 'sets', 'ml', 'liters'];

export default function Inventory() {
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('All');
  const [stockStatus, setStockStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [linkedDocs, setLinkedDocs] = useState<{ soCount: number; dcCount: number; invCount: number; soNumbers: string[]; dcNumbers: string[]; invNumbers: string[] } | null>(null);
  const [deleteStockInfo, setDeleteStockInfo] = useState<{ godownBreakdown: { godown_id: string; godown_name: string; quantity: number; variant_id: string | null; variant_name: string | null }[]; totalStock: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [openingStocks, setOpeningStocks] = useState<Record<string, any>>({});

  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [productUnitsMap, setProductUnitsMap] = useState<Record<string, ProductUnit[]>>({});

  const [variantsMap, setVariantsMap] = useState<Record<string, ProductVariant[]>>({});
  const [expandedVariantProduct, setExpandedVariantProduct] = useState<string | null>(null);
  const [editingVariants, setEditingVariants] = useState<(ProductVariant & { godown_id?: string })[]>([]);

  const [form, setForm] = useState({
    name: '', category: 'Astro Products' as Product['category'], unit: 'pcs',
    product_type: 'simple' as ProductType,
    purchase_price: '', selling_price: '', low_stock_alert: '5',
    description: '', sku: '', image_url: '',
    direction: '', is_gemstone: false, weight_grams: '',
    total_weight: '', weight_unit: 'grams' as 'grams' | 'carats' | 'kg',
    low_stock_enabled: true,
    company_id: '',
  });
  const [stockForm, setStockForm] = useState({ type: 'adjustment', quantity: '', notes: '', movement_label: 'adjustment', godown_id: '', piece_weights: '' });
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
  const [pieceEdits, setPieceEdits] = useState<Record<string, string>>({});
  const [pieceDeletes, setPieceDeletes] = useState<Set<string>>(new Set());
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => { loadData(); fetchCompanies().then(setCompanies); }, []);
  useEffect(() => {
    if (!openRowMenu) return;
    const handler = () => setOpenRowMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openRowMenu]);

  useEffect(() => {
    let data = products;
    if (category !== 'All') data = data.filter(p => p.category === category);
    if (stockStatus === 'In Stock') data = data.filter(p => p.stock_quantity > p.low_stock_alert);
    if (stockStatus === 'Low Alert') data = data.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert);
    if (stockStatus === 'Out of Stock') data = data.filter(p => p.stock_quantity <= 0);
    if (search) data = data.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
    setFiltered(data);
  }, [products, category, stockStatus, search]);

  const loadData = async () => {
    setLoading(true);
    const [productsRes, godownsRes, godownStockRes, unitsRes, variantsRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('name', { ascending: true }),
      supabase.from('godowns').select('*').eq('is_active', true).order('name'),
      supabase.from('godown_stock').select('product_id, quantity'),
      supabase.from('product_units').select('*').order('created_at', { ascending: false }),
      supabase.from('product_variants').select('*').eq('is_active', true).order('name'),
    ]);
    const rawProducts = productsRes.data || [];
    const stockRows = godownStockRes.data || [];
    const stockTotals: Record<string, number> = {};
    for (const row of stockRows) {
      stockTotals[row.product_id] = (stockTotals[row.product_id] || 0) + (row.quantity || 0);
    }
    const byProduct: Record<string, ProductUnit[]> = {};
    for (const unit of ((unitsRes.data || []) as ProductUnit[])) {
      byProduct[unit.product_id] = byProduct[unit.product_id] || [];
      byProduct[unit.product_id].push(unit);
    }
    const byVariant: Record<string, ProductVariant[]> = {};
    for (const v of ((variantsRes.data || []) as ProductVariant[])) {
      byVariant[v.product_id] = byVariant[v.product_id] || [];
      byVariant[v.product_id].push(v);
    }
    const merged = rawProducts.map(p => {
      if (p.is_gemstone || p.product_type === 'gemstone') {
        const inStockCount = (byProduct[p.id] || []).filter(u => u.status === 'in_stock').length;
        return { ...p, stock_quantity: inStockCount };
      }
      if (p.product_type === 'variant') {
        const variantTotal = (byVariant[p.id] || []).reduce((s, v) => s + (v.stock_quantity || 0), 0);
        return { ...p, stock_quantity: variantTotal };
      }
      return { ...p, stock_quantity: stockTotals[p.id] ?? p.stock_quantity };
    });
    setProducts(merged);
    setProductUnitsMap(byProduct);
    setVariantsMap(byVariant);
    setGodowns(godownsRes.data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setPendingImageFile(null);
    setImagePreview('');
    const stocks: Record<string, any> = {};
    (godowns).forEach(g => { stocks[g.id] = '0'; });
    setOpeningStocks(stocks);
    const defaultCompany = companies.find(c => c.sort_order === 2) || companies[0];
    setEditingVariants([]);
    setForm({
      name: '', category: 'Astro Products', unit: 'pcs',
      product_type: 'simple',
      purchase_price: '', selling_price: '', low_stock_alert: '5',
      description: '', sku: generateId('SKU'), image_url: '',
      direction: '', is_gemstone: false, weight_grams: '',
      total_weight: '', weight_unit: 'grams',
      low_stock_enabled: true,
      company_id: defaultCompany?.id || '',
    });
    setShowModal(true);
  };

  const [editGodownStocks, setEditGodownStocks] = useState<Record<string, any>>({});

  const openEdit = async (p: Product) => {
    setEditing(p);
    setPendingImageFile(null);
    setImagePreview(p.image_url || '');
    setOpeningStocks({});
    const { data: stocks } = await supabase.from('godown_stock').select('godown_id, quantity').eq('product_id', p.id);
    const stocksMap: Record<string, any> = {};
    (stocks || []).forEach(s => { stocksMap[s.godown_id] = String(s.quantity); });
    godowns.forEach(g => { if (!stocksMap[g.id]) stocksMap[g.id] = '0'; });
    setEditGodownStocks(stocksMap);
    const pType: ProductType = (p.product_type as ProductType) || (p.is_gemstone ? 'gemstone' : 'simple');
    if (pType === 'variant') {
      const { data: vRows } = await supabase.from('product_variants').select('*').eq('product_id', p.id).eq('is_active', true).order('name');
      const { data: vStock } = await supabase.from('godown_stock').select('variant_id, godown_id, quantity').eq('product_id', p.id);
      const byVariant: Record<string, { godown_id: string; quantity: number }> = {};
      for (const s of (vStock || [])) {
        if (!s.variant_id) continue;
        const prev = byVariant[s.variant_id];
        if (!prev || (s.quantity || 0) > prev.quantity) byVariant[s.variant_id] = { godown_id: s.godown_id, quantity: s.quantity || 0 };
      }
      setEditingVariants(((vRows || []) as ProductVariant[]).map(v => ({ ...v, godown_id: byVariant[v.id]?.godown_id || (godowns[0]?.id || '') })));
    } else {
      setEditingVariants([]);
    }
    setForm({
      name: p.name, category: p.category, unit: p.unit,
      product_type: pType,
      purchase_price: String(p.purchase_price), selling_price: String(p.selling_price),
      low_stock_alert: String(p.low_stock_alert),
      description: p.description || '', sku: p.sku, image_url: p.image_url || '',
      direction: p.direction || '', is_gemstone: p.is_gemstone || false,
      weight_grams: p.weight_grams ? String(p.weight_grams) : '',
      total_weight: p.total_weight ? String(p.total_weight) : '',
      weight_unit: (p.weight_unit as 'grams' | 'carats' | 'kg') || 'grams',
      low_stock_enabled: p.low_stock_alert > 0,
      company_id: p.company_id || '',
    });
    setShowModal(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    let imageUrl = form.image_url;
    if (pendingImageFile) {
      setImageUploading(true);
      const tempId = editing?.id || generateId('IMG');
      const uploaded = await uploadProductImage(pendingImageFile, tempId);
      if (uploaded) imageUrl = uploaded;
      setImageUploading(false);
    }
    const isGemstone = form.product_type === 'gemstone';
    const totalW = isGemstone && form.total_weight ? parseFloat(form.total_weight) || 0 : 0;
    const basePayload = {
      name: form.name, category: form.category, unit: form.unit, sku: form.sku,
      product_type: form.product_type,
      purchase_price: parseFloat(form.purchase_price) || 0,
      selling_price: parseFloat(form.selling_price) || 0,
      low_stock_alert: form.low_stock_enabled ? (parseFloat(form.low_stock_alert) || 5) : 0,
      description: form.description,
      image_url: imageUrl || null,
      direction: form.direction || null,
      is_gemstone: isGemstone,
      weight_grams: isGemstone && form.weight_grams ? parseFloat(form.weight_grams) || null : null,
      total_weight: totalW,
      weight_unit: (isGemstone || form.product_type === 'weight') ? form.weight_unit : null,
      company_id: form.company_id || null,
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing) {
        const { error: productErr } = await supabase.from('products').update(basePayload).eq('id', editing.id);
        if (productErr) throw productErr;

        // Save variants (upsert by id)
        if (form.product_type === 'variant') {
          for (const v of editingVariants) {
            let variantId = v.id;
            if (v.id && !v.id.startsWith('new-')) {
              await supabase.from('product_variants').update({
                name: v.name, sku: v.sku,
                purchase_price: v.purchase_price, selling_price: v.selling_price,
                stock_quantity: v.stock_quantity, updated_at: new Date().toISOString(),
              }).eq('id', v.id);
            } else {
              const { data: ins } = await supabase.from('product_variants').insert({
                product_id: editing.id, name: v.name, sku: v.sku || generateId('VAR'),
                purchase_price: v.purchase_price, selling_price: v.selling_price,
                stock_quantity: v.stock_quantity,
              }).select('id').maybeSingle();
              if (ins?.id) variantId = ins.id;
            }
            if (v.godown_id && variantId) {
              await supabase.from('godown_stock').delete().eq('product_id', editing.id).eq('variant_id', variantId);
              if ((v.stock_quantity || 0) > 0) {
                await supabase.from('godown_stock').insert({
                  product_id: editing.id, variant_id: variantId, godown_id: v.godown_id, quantity: v.stock_quantity,
                });
              }
            }
          }
        }

        if (form.product_type !== 'variant') {
          const { data: currentStocks, error: currentErr } = await supabase
            .from('godown_stock').select('godown_id, quantity').eq('product_id', editing.id);
          if (currentErr) throw currentErr;
          const currentMap: Record<string, number> = {};
          (currentStocks || []).forEach(s => { currentMap[s.godown_id] = s.quantity || 0; });
          const adjustItems = Object.entries(editGodownStocks)
            .map(([godown_id, qtyStr]) => {
              const target = parseFloat(qtyStr) || 0;
              const current = currentMap[godown_id] || 0;
              return { product_id: editing.id, godown_id, quantity: target - current };
            })
            .filter(i => i.quantity !== 0);
          if (adjustItems.length > 0) {
            await processStockMovement({
              type: 'adjustment', items: adjustItems,
              reference_type: 'stock_edit', reference_id: editing.id, notes: 'Manual stock edit',
            });
          }
        }
      } else {
        const createPayload = { ...basePayload, remaining_weight: totalW };
        const { data: newProduct, error: insertErr } = await supabase.from('products').insert(createPayload).select().maybeSingle();
        if (insertErr) throw insertErr;
        if (newProduct) {
          // Save new variants
          if (form.product_type === 'variant' && editingVariants.length > 0) {
            const { data: insertedVariants } = await supabase.from('product_variants').insert(
              editingVariants.map(v => ({
                product_id: newProduct.id, name: v.name, sku: v.sku || generateId('VAR'),
                purchase_price: v.purchase_price, selling_price: v.selling_price,
                stock_quantity: v.stock_quantity,
              }))
            ).select('id, sku');
            const stockRows: Array<{ product_id: string; variant_id: string; godown_id: string; quantity: number }> = [];
            for (const v of editingVariants) {
              if (!v.godown_id || !v.stock_quantity) continue;
              const match = (insertedVariants || []).find(r => r.sku === (v.sku || ''));
              if (match) stockRows.push({ product_id: newProduct.id, variant_id: match.id, godown_id: v.godown_id, quantity: v.stock_quantity });
            }
            if (stockRows.length) await supabase.from('godown_stock').insert(stockRows);
          }
          if (form.product_type !== 'variant') {
            const openingItems = Object.entries(openingStocks)
              .map(([godown_id, qtyStr]) => ({
                product_id: newProduct.id, godown_id, quantity: parseFloat(qtyStr) || 0,
              }))
              .filter(i => i.quantity > 0);
            if (openingItems.length > 0) {
              await processStockMovement({
                type: 'adjustment', items: openingItems,
                reference_type: 'opening_stock', reference_id: newProduct.id, notes: 'Opening stock',
              });
            }
          }
        }
      }
      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Save failed: ${msg}`);
    }
  };

  const initiateDelete = async (p: Product) => {
    setDeleteLoading(true);
    const [soRes, dcRes, invRes, stockRes] = await Promise.all([
      supabase.from('sales_order_items').select('sales_order_id, sales_orders!inner(so_number, status)').eq('product_id', p.id).neq('sales_orders.status', 'cancelled'),
      supabase.from('delivery_challan_items').select('delivery_challan_id, delivery_challans!inner(challan_number, status)').eq('product_id', p.id).neq('delivery_challans.status', 'cancelled'),
      supabase.from('invoice_items').select('invoice_id, invoices!inner(invoice_number, status)').eq('product_id', p.id).neq('invoices.status', 'cancelled'),
      supabase.from('godown_stock').select('godown_id, quantity, variant_id, product_variants(name), godowns(name)').eq('product_id', p.id),
    ]);
    setDeleteLoading(false);

    const soNumbers = (soRes.data || []).map((r: any) => r.sales_orders?.so_number).filter(Boolean);
    const dcNumbers = (dcRes.data || []).map((r: any) => r.delivery_challans?.challan_number).filter(Boolean);
    const invNumbers = (invRes.data || []).map((r: any) => r.invoices?.invoice_number).filter(Boolean);

    const godownBreakdown = (stockRes.data || [])
      .filter((r: any) => (r.quantity || 0) > 0)
      .map((r: any) => ({
        godown_id: r.godown_id,
        godown_name: (r.godowns as any)?.name || r.godown_id,
        quantity: r.quantity || 0,
        variant_id: r.variant_id || null,
        variant_name: (r.product_variants as any)?.name || null,
      }));
    const totalStock = godownBreakdown.reduce((s: number, r: any) => s + r.quantity, 0);
    setDeleteStockInfo({ godownBreakdown, totalStock });

    if (soNumbers.length || dcNumbers.length || invNumbers.length) {
      setLinkedDocs({ soCount: soNumbers.length, dcCount: dcNumbers.length, invCount: invNumbers.length, soNumbers, dcNumbers, invNumbers });
    } else {
      setLinkedDocs(null);
    }
    setConfirmProduct(p);
  };

  const handleDelete = async (p: Product) => {
    try {
      const { error } = await supabase.rpc('safe_delete_product', { p_product_id: p.id });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Delete failed: ${msg}`);
      return;
    }
    setConfirmProduct(null);
    setLinkedDocs(null);
    setDeleteStockInfo(null);
    loadData();
  };

  const openStockModal = (p: Product) => {
    setSelectedProduct(p);
    setStockForm({ type: 'in', quantity: '', notes: '', movement_label: 'purchase', godown_id: godowns[0]?.id || '', piece_weights: '' });
    setSelectedPieceIds(new Set());
    setPieceEdits({});
    setPieceDeletes(new Set());
    setShowStockModal(true);
  };

  const openLedgerModal = async (p: Product) => {
    setLedgerProduct(p);
    setShowLedgerModal(true);
    const { data } = await supabase.from('stock_movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(50);
    setStockMovements(data || []);
  };

  const handleStockUpdate = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(stockForm.quantity) || 0;
    const mvType = stockForm.movement_label;
    const godownId = stockForm.godown_id;
    if (!godownId) return;

    const isIn = ['purchase', 'return'].includes(mvType);

    try {
      if (selectedProduct.is_gemstone) {
        const parsedWeights = stockForm.piece_weights
          .split('\n')
          .map(w => Number(w.trim()))
          .filter(w => Number.isFinite(w) && w > 0);

        if (['purchase', 'return'].includes(mvType)) {
          if (parsedWeights.length === 0) {
            alert('Please enter one weight per line for gemstone pieces.');
            return;
          }
          const weightUnit: 'kg' | 'g' | 'carat' =
            selectedProduct.weight_unit === 'carats' ? 'carat' : selectedProduct.weight_unit === 'kg' ? 'kg' : 'g';
          const rows = parsedWeights.map(weight => ({
            product_id: selectedProduct.id,
            weight,
            weight_unit: weightUnit,
            status: 'in_stock' as const,
            godown_id: godownId,
          }));
          const { error: insErr } = await supabase.from('product_units').insert(rows);
          if (insErr) throw insErr;
          await processStockMovement({
            type: mvType === 'purchase' ? 'purchase' : 'return',
            items: [{ product_id: selectedProduct.id, godown_id: godownId, quantity: parsedWeights.length }],
            reference_type: 'manual_stock_update',
            notes: stockForm.notes,
          });
        } else if (mvType === 'sale') {
          const toSell = Array.from(selectedPieceIds);
          if (toSell.length === 0) {
            alert('Select at least one piece to mark as sold.');
            return;
          }
          const { error: upErr } = await supabase.from('product_units').update({
            status: 'sold',
            sold_at: new Date().toISOString(),
            sold_reference_type: 'manual_stock_update',
          }).in('id', toSell);
          if (upErr) throw upErr;
          await processStockMovement({
            type: 'dispatch',
            items: [{ product_id: selectedProduct.id, godown_id: godownId, quantity: toSell.length }],
            reference_type: 'manual_stock_update',
            notes: stockForm.notes,
          });
        } else if (mvType === 'edit') {
          const editEntries = Object.entries(pieceEdits).filter(([id, val]) => {
            if (pieceDeletes.has(id)) return false;
            const orig = (productUnitsMap[selectedProduct.id] || []).find(u => u.id === id);
            const num = Number(val);
            return orig && Number.isFinite(num) && num > 0 && num !== orig.weight;
          });
          for (const [id, val] of editEntries) {
            const { error: upErr } = await supabase.from('product_units').update({ weight: Number(val) }).eq('id', id);
            if (upErr) throw upErr;
          }
          const toRemove = Array.from(pieceDeletes);
          if (toRemove.length > 0) {
            const { error: delErr } = await supabase.from('product_units').delete().in('id', toRemove);
            if (delErr) throw delErr;
            await processStockMovement({
              type: 'adjustment',
              items: [{ product_id: selectedProduct.id, godown_id: godownId, quantity: -toRemove.length }],
              reference_type: 'manual_stock_update',
              notes: `Removed ${toRemove.length} piece(s). ${stockForm.notes || ''}`.trim(),
            });
          }
          if (editEntries.length === 0 && toRemove.length === 0) {
            alert('No changes to save.');
            return;
          }
        } else {
          alert('Use Purchase/Return/Sale for gemstone piece tracking.');
          return;
        }

        await loadData();
        setShowStockModal(false);
        setSelectedProduct(null);
        return;
      }

      if (qty <= 0) return;

      if (mvType === 'adjustment') {
        const { data: row } = await supabase
          .from('godown_stock')
          .select('quantity')
          .eq('product_id', selectedProduct.id)
          .eq('godown_id', godownId)
          .maybeSingle();
        const current = row?.quantity || 0;
        const delta = qty - current;
        if (delta !== 0) {
          await processStockMovement({
            type: 'adjustment',
            items: [{ product_id: selectedProduct.id, godown_id: godownId, quantity: delta }],
            reference_type: 'manual_adjustment',
            notes: stockForm.notes,
          });
        }
      } else {
        const type = mvType === 'purchase' ? 'purchase' : mvType === 'return' ? 'return' : 'dispatch';
        await processStockMovement({
          type,
          items: [{ product_id: selectedProduct.id, godown_id: godownId, quantity: qty }],
          reference_type: 'manual_stock_update',
          notes: stockForm.notes,
        });
      }

      if (selectedProduct.is_gemstone && selectedProduct.total_weight) {
        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (isIn) {
          updates.remaining_weight = (selectedProduct.remaining_weight || 0) + qty;
          updates.total_weight = (selectedProduct.total_weight || 0) + (mvType === 'purchase' ? qty : 0);
        } else if (mvType !== 'adjustment') {
          updates.remaining_weight = Math.max(0, (selectedProduct.remaining_weight || 0) - qty);
        }
        await supabase.from('products').update(updates).eq('id', selectedProduct.id);
      }

      await loadData();
      setShowStockModal(false);
      setSelectedProduct(null);
    } catch (error) {
      console.error('Error updating stock:', error);
      alert('Failed to update stock. Please try again.');
    }
  };

  const handleExport = () => {
    exportToCSV(filtered.map(p => ({
      sku: p.sku, name: p.name, category: p.category, unit: p.unit,
      purchase_price: p.purchase_price, selling_price: p.selling_price,
      stock_quantity: p.stock_quantity, low_stock_alert: p.low_stock_alert,
    })), 'products');
  };

  const totalValuation = products.reduce((s, p) => s + p.stock_quantity * p.purchase_price, 0);
  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert).length;

  const getStockBar = (p: Product) => {
    const ratio = p.low_stock_alert > 0 ? p.stock_quantity / (p.low_stock_alert * 3) : 1;
    const pct = Math.min(100, ratio * 100);
    const color = p.stock_quantity <= 0 ? 'bg-error-500' : p.stock_quantity <= p.low_stock_alert ? 'bg-warning-500' : 'bg-success-500';
    return { pct, color };
  };

  const getCategoryColor = (cat: string) => {
    const map: Record<string, any> = {
      'Astro Products': 'bg-primary-100 text-primary-700',
      'Vastu Items': 'bg-blue-100 text-blue-700',
      'Healing Items': 'bg-green-100 text-green-700',
    };
    return map[cat] || 'bg-neutral-100 text-neutral-600';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Products</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Curating divine inventory for earthly prosperity.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 card">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Category</p>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${category === c ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Stock</p>
                <div className="flex gap-1.5">
                  {['All', 'In Stock', 'Low Alert', 'Out of Stock'].map(s => (
                    <button key={s} onClick={() => setStockStatus(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${stockStatus === s ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-8 w-44 text-xs" />
                </div>
              </div>
            </div>
          </div>
          <div className="card flex flex-col justify-center">
            <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">{isAdmin ? 'Inventory Valuation' : 'Total Products'}</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{isAdmin ? formatCurrency(totalValuation) : products.length}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {lowStockCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-warning-600 bg-warning-50 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {lowStockCount} low
                </span>
              )}
              <span className="text-xs text-neutral-400">{products.length} products</span>
            </div>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Product</th>
                <th className="table-header text-left">Category</th>
                <th className="table-header text-left">Unit</th>
                <th className="table-header text-left">Price</th>
                <th className="table-header text-left">Stock</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const bar = getStockBar(p);
                const pType: ProductType = (p.product_type as ProductType) || (p.is_gemstone ? 'gemstone' : 'simple');
                const isVariant = pType === 'variant';
                const isExpanded = expandedVariantProduct === p.id;
                const pVariants = variantsMap[p.id] || [];
                const typeColors: Record<ProductType, string> = {
                  simple: 'bg-neutral-100 text-neutral-500',
                  variant: 'bg-blue-100 text-blue-700',
                  weight: 'bg-amber-100 text-amber-700',
                  gemstone: 'bg-primary-100 text-primary-700',
                };
                return (
                  <React.Fragment key={p.id}>
                  <tr className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => setViewProduct(p)}>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        {isVariant && (
                          <button onClick={e => { e.stopPropagation(); setExpandedVariantProduct(isExpanded ? null : p.id); }}
                            className="p-0.5 text-neutral-400 hover:text-primary-600 transition-colors">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-neutral-100" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                            <ImagePlus className="w-3.5 h-3.5 text-neutral-300" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-neutral-900 text-sm leading-tight">{p.name}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${typeColors[pType]}`}>{pType}</span>
                          </div>
                          <p className="text-[10px] text-neutral-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`badge text-[10px] font-semibold uppercase tracking-wider ${getCategoryColor(p.category)}`}>{p.category}</span>
                      {p.company_id && companies.find(c => c.id === p.company_id) && (
                        <span className="badge text-[10px] bg-blue-50 text-blue-700 ml-1">{companies.find(c => c.id === p.company_id)!.name}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-neutral-500">{p.unit}</td>
                    <td className="py-3 px-3">
                      {isAdmin && <p className="text-[10px] text-neutral-400">P: {formatCurrency(p.purchase_price)}</p>}
                      <p className="text-xs font-semibold text-primary-700">S: {formatCurrency(p.selling_price)}</p>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {isVariant ? (
                          <span className="text-xs text-neutral-500">{pVariants.length} variants</span>
                        ) : (
                          <>
                            <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${p.stock_quantity <= 0 ? 'text-error-600' : p.stock_quantity <= p.low_stock_alert ? 'text-warning-600' : 'text-neutral-700'}`}>
                              {p.stock_quantity}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} title="Edit" className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {pType !== 'variant' && (
                          <button onClick={() => openStockModal(p)} title={p.is_gemstone ? 'Add / Remove Pieces' : 'Stock In/Out'} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-600 text-[10px] font-semibold transition-colors">
                            <ArrowUpDown className="w-3 h-3" /> {p.is_gemstone ? 'Pieces' : 'Stock'}
                          </button>
                        )}
                        <button onClick={() => openLedgerModal(p)} title="Movement Ledger" className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-blue-600 transition-colors">
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => initiateDelete(p)} title="Delete" className="p-1.5 rounded-lg hover:bg-error-50 text-neutral-400 hover:text-error-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isVariant && isExpanded && pVariants.map(v => (
                    <tr key={v.id} className="bg-blue-50/50 border-b border-blue-100">
                      <td className="py-2 pl-16 pr-3">
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-3 h-3 text-blue-400" />
                          <p className="text-xs font-medium text-neutral-700">{v.name}</p>
                          <p className="text-[10px] text-neutral-400">{v.sku}</p>
                        </div>
                      </td>
                      <td className="py-2 px-3" />
                      <td className="py-2 px-3 text-xs text-neutral-500">{p.unit}</td>
                      <td className="py-2 px-3">
                        {isAdmin && <p className="text-[10px] text-neutral-400">P: {formatCurrency(v.purchase_price)}</p>}
                        <p className="text-xs font-semibold text-primary-700">S: {formatCurrency(v.selling_price)}</p>
                      </td>
                      <td className="py-2 px-3">
                        <span className={`text-xs font-medium ${v.stock_quantity <= 0 ? 'text-error-600' : 'text-neutral-700'}`}>{v.stock_quantity}</span>
                      </td>
                      <td className="py-2 px-3" />
                    </tr>
                  ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <EmptyState icon={BarChart2} title="No products found" description="Add your first product or adjust filters." />
          )}
        </div>

        {lowStockCount > 0 && (
          <div className="card border-l-4 border-warning-500 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning-600" />
              <p className="text-xs font-semibold text-warning-700">Low Stock Alerts</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert).map(p => (
                <div key={p.id} className="flex items-center justify-between bg-warning-50 px-2.5 py-1.5 rounded-lg">
                  <span className="text-xs text-neutral-700 truncate">{p.name}</span>
                  <span className="text-xs font-bold text-warning-700 ml-2 shrink-0">{p.stock_quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Product' : 'Add Product'}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={imageUploading} className="btn-primary">
              {imageUploading ? 'Uploading...' : editing ? 'Update Product' : 'Add Product'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center cursor-pointer hover:border-primary-400 transition-colors overflow-hidden flex-shrink-0"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-5 h-5 text-neutral-300" />
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="label">Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g., Natural Citrine Point" />
              </div>
              <div>
                <label className="label">SKU</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="input text-xs" placeholder="SKU..." />
              </div>
              <div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs mt-4 w-full">
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Product['category'] }))} className="input text-xs">
                <option>Astro Products</option>
                <option>Vastu Items</option>
                <option>Healing Items</option>
              </select>
            </div>
            {form.product_type === 'weight' || form.product_type === 'gemstone' ? (
              <div>
                <label className="label">{form.product_type === 'weight' ? 'Weight Unit' : 'Piece Weight Unit'}</label>
                <select value={form.weight_unit} onChange={e => {
                  const wu = e.target.value as 'grams' | 'carats' | 'kg';
                  setForm(f => ({ ...f, weight_unit: wu, unit: form.product_type === 'weight' ? (wu === 'kg' ? 'kg' : wu === 'carats' ? 'carats' : 'grams') : 'pcs' }));
                }} className="input text-xs">
                  <option value="grams">Grams (g)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="carats">Carats (ct)</option>
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Unit</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="input text-xs">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Vastu Direction</label>
              <input value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} className="input text-xs" placeholder="N, S, NE..." />
            </div>
          </div>

          {/* Product Type Selector */}
          <div>
            <label className="label">Product Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                { value: 'simple', label: 'Simple', desc: 'Qty-based' },
                { value: 'variant', label: 'Variant', desc: 'Size / colour' },
                { value: 'weight', label: 'Weight', desc: 'Sold by weight' },
                { value: 'gemstone', label: 'Gemstone', desc: 'Piece tracking' },
              ] as { value: ProductType; label: string; desc: string }[]).map(t => (
                <button key={t.value} type="button"
                  onClick={() => setForm(f => {
                    let unit = f.unit;
                    if (t.value === 'gemstone') unit = 'pcs';
                    else if (t.value === 'weight') unit = f.weight_unit === 'kg' ? 'kg' : f.weight_unit === 'carats' ? 'carats' : 'grams';
                    return { ...f, product_type: t.value, is_gemstone: t.value === 'gemstone', unit };
                  })}
                  className={`px-2 py-2 rounded-lg border text-left transition-colors ${form.product_type === t.value ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 hover:border-neutral-300'}`}>
                  <p className={`text-xs font-semibold ${form.product_type === t.value ? 'text-primary-700' : 'text-neutral-700'}`}>{t.label}</p>
                  <p className="text-[10px] text-neutral-400">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div onClick={() => setForm(f => ({ ...f, low_stock_enabled: !f.low_stock_enabled }))}
                className={`w-8 h-4 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.low_stock_enabled ? 'bg-primary-600' : 'bg-neutral-200'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform border border-neutral-200 ${form.low_stock_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-neutral-600">Low stock alert</span>
            </div>
            {form.low_stock_enabled && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-neutral-500">Alert at</label>
                <input type="number" value={form.low_stock_alert} onChange={e => setForm(f => ({ ...f, low_stock_alert: e.target.value }))} className="input text-xs py-1.5 w-20" />
              </div>
            )}
          </div>

          {form.product_type === 'weight' && (
            <div>
              <label className="label">Total Stock ({form.weight_unit === 'carats' ? 'ct' : form.weight_unit === 'kg' ? 'kg' : 'g'})</label>
              <input type="number" value={form.total_weight} onChange={e => setForm(f => ({ ...f, total_weight: e.target.value }))} className="input text-xs" placeholder="0" />
            </div>
          )}

          {/* Prices — hidden for variant (each variant has own price) */}
          {form.product_type !== 'variant' && (
            <div className="grid grid-cols-2 gap-2">
              {isAdmin && (
                <div>
                  <label className="label">Purchase Price (₹)</label>
                  <input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} className="input" placeholder="0" />
                </div>
              )}
              <div>
                <label className="label">Selling Price (₹)</label>
                <input type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} className="input" placeholder="0" />
              </div>
            </div>
          )}

          {/* Variant rows */}
          {form.product_type === 'variant' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Variants</label>
                <button type="button" onClick={() => setEditingVariants(v => {
                  const nextIdx = v.length + 1;
                  const baseSku = form.sku?.trim();
                  const autoSku = baseSku ? `${baseSku}-${nextIdx}` : generateId('VAR');
                  return [...v, {
                    id: `new-${Date.now()}`, product_id: editing?.id || '',
                    name: '', sku: autoSku, stock_quantity: 0,
                    purchase_price: 0, selling_price: 0, is_active: true,
                    godown_id: godowns[0]?.id || '',
                  }];
                })} className="btn-ghost text-xs py-1">
                  <Plus className="w-3 h-3" /> Add Variant
                </button>
              </div>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="table-header text-left">Name</th>
                      <th className="table-header text-left w-28">SKU</th>
                      {isAdmin && <th className="table-header text-right w-24">Buy (₹)</th>}
                      <th className="table-header text-right w-24">Sell (₹)</th>
                      <th className="table-header text-right w-20">Stock</th>
                      <th className="table-header text-left w-36">Warehouse</th>
                      <th className="table-header w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {editingVariants.map((v, vi) => (
                      <tr key={v.id} className="border-t border-neutral-100">
                        <td className="px-2 py-1.5"><input value={v.name} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],name:e.target.value}; return n; })} className="input text-xs py-1" placeholder='e.g. 4 inch' /></td>
                        <td className="px-2 py-1.5"><input value={v.sku} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],sku:e.target.value}; return n; })} className="input text-xs py-1 font-mono" /></td>
                        {isAdmin && <td className="px-2 py-1.5"><input type="number" value={v.purchase_price} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],purchase_price:parseFloat(e.target.value)||0}; return n; })} className="input text-xs py-1 text-right" /></td>}
                        <td className="px-2 py-1.5"><input type="number" value={v.selling_price} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],selling_price:parseFloat(e.target.value)||0}; return n; })} className="input text-xs py-1 text-right" /></td>
                        <td className="px-2 py-1.5"><input type="number" value={v.stock_quantity} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],stock_quantity:parseFloat(e.target.value)||0}; return n; })} className="input text-xs py-1 text-right" /></td>
                        <td className="px-2 py-1.5">
                          <select value={v.godown_id || ''} onChange={e => setEditingVariants(vs => { const n=[...vs]; n[vi]={...n[vi],godown_id:e.target.value}; return n; })} className="input text-xs py-1">
                            {godowns.length === 0 && <option value="">(no godowns)</option>}
                            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><button onClick={() => setEditingVariants(vs => vs.filter((_,i)=>i!==vi))} className="text-neutral-400 hover:text-error-500"><X className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                    {editingVariants.length === 0 && (
                      <tr><td colSpan={isAdmin ? 7 : 6} className="px-3 py-4 text-center text-xs text-neutral-400">No variants yet. Click "Add Variant" to create one.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Opening stock per godown — simple and weight types */}
          {godowns.length > 0 && form.product_type !== 'gemstone' && form.product_type !== 'variant' && (
            <div className="col-span-2">
              <label className="label">{editing ? 'Stock per Godown' : 'Opening Stock per Godown'}</label>
              <div className="grid grid-cols-2 gap-2">
                {godowns.map(g => (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600 flex-1 truncate">{g.name}</span>
                    <input
                      type="number"
                      min="0"
                      value={editing ? (editGodownStocks[g.id] || '0') : (openingStocks[g.id] || '0')}
                      onChange={e => editing
                        ? setEditGodownStocks(s => ({ ...s, [g.id]: e.target.value }))
                        : setOpeningStocks(s => ({ ...s, [g.id]: e.target.value }))
                      }
                      className="input text-xs py-1.5 w-20 shrink-0"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {editing && <p className="text-[10px] text-neutral-400 mt-1">Updating these values will directly set the stock quantity per godown</p>}
            </div>
          )}
          {form.product_type === 'gemstone' && (
            <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-800 mb-0.5">How to add gemstone stock</p>
              <p className="text-xs text-amber-700">
                {editing
                  ? 'To add pieces, close this dialog and click the Pieces button next to this product. Enter one weight per line.'
                  : 'After saving, click the Pieces button next to this product to add individual pieces with their weights.'}
              </p>
            </div>
          )}
          <div className="col-span-2">
            <label className="label">Billing Entity (for invoices)</label>
            <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} className="input text-xs">
              <option value="">-- Select Company --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-[10px] text-neutral-400 mt-0.5">Which entity's name appears on invoices for this product?</p>
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input resize-none h-16" placeholder="Optional description..." />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showStockModal && !!selectedProduct}
        onClose={() => setShowStockModal(false)}
        title={selectedProduct?.is_gemstone ? `Piece Stock — ${selectedProduct?.name || ''}` : `Update Stock — ${selectedProduct?.name || ''}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowStockModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleStockUpdate} className="btn-primary">Update Stock</button>
          </>
        }
      >
        <div className="space-y-3">
          {godowns.length > 0 && (
            <div>
              <label className="label">Godown</label>
              <select value={stockForm.godown_id} onChange={e => { setStockForm(f => ({ ...f, godown_id: e.target.value })); setSelectedPieceIds(new Set()); setPieceEdits({}); setPieceDeletes(new Set()); }} className="input text-xs">
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">Movement Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: 'purchase', label: 'Purchase (In)' },
                { value: 'sale', label: 'Sale (Out)' },
                { value: 'return', label: 'Return (In)' },
                ...(selectedProduct?.is_gemstone ? [{ value: 'edit', label: 'Edit Pieces' }] : [{ value: 'adjustment', label: 'Adjustment' }]),
              ].map(t => (
                <button key={t.value} onClick={() => { setStockForm(f => ({ ...f, movement_label: t.value, type: ['purchase', 'return'].includes(t.value) ? 'in' : t.value === 'sale' ? 'out' : 'adjustment' })); setSelectedPieceIds(new Set()); setPieceEdits({}); setPieceDeletes(new Set()); }}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors text-left ${stockForm.movement_label === t.value ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {selectedProduct?.is_gemstone ? (() => {
            const wLabel = selectedProduct.weight_unit === 'carats' ? 'ct' : 'g';
            const availablePieces = (productUnitsMap[selectedProduct.id] || []).filter(u =>
              u.status === 'in_stock' && (!stockForm.godown_id || !u.godown_id || u.godown_id === stockForm.godown_id)
            );
            if (stockForm.movement_label === 'sale') {
              const selTotal = Array.from(selectedPieceIds).reduce((s, id) => {
                const p = availablePieces.find(u => u.id === id);
                return s + (p?.weight || 0);
              }, 0);
              return (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Select Pieces to Sell</label>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setSelectedPieceIds(new Set(availablePieces.map(u => u.id)))} className="text-[10px] text-primary-600 hover:underline">All</button>
                      <span className="text-neutral-300 text-[10px]">|</span>
                      <button type="button" onClick={() => setSelectedPieceIds(new Set())} className="text-[10px] text-neutral-500 hover:underline">None</button>
                    </div>
                  </div>
                  {availablePieces.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-4 text-center">No in-stock pieces in this godown</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                      {availablePieces.map((u, idx) => {
                        const checked = selectedPieceIds.has(u.id);
                        return (
                          <label key={u.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-neutral-50 transition-colors ${checked ? 'bg-primary-50' : ''}`}>
                            <input type="checkbox" checked={checked} onChange={() => {
                              setSelectedPieceIds(prev => {
                                const next = new Set(prev);
                                if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                                return next;
                              });
                            }} className="w-3.5 h-3.5 accent-primary-600" />
                            <span className="text-xs font-medium text-neutral-700">Piece #{idx + 1}</span>
                            <span className="text-xs text-neutral-500 ml-auto font-mono">{u.weight} {u.weight_unit === 'carat' ? 'ct' : wLabel}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedPieceIds.size > 0 && (
                    <p className="text-[10px] text-primary-700 mt-1.5 font-medium">
                      {selectedPieceIds.size} piece{selectedPieceIds.size > 1 ? 's' : ''} selected &bull; {selTotal.toFixed(2)} {wLabel} total
                    </p>
                  )}
                </div>
              );
            }
            if (stockForm.movement_label === 'edit') {
              return (
                <div>
                  <label className="label">Edit / Remove In-Stock Pieces</label>
                  {availablePieces.length === 0 ? (
                    <p className="text-xs text-neutral-400 py-4 text-center">No in-stock pieces in this godown</p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                      {availablePieces.map((u, idx) => {
                        const marked = pieceDeletes.has(u.id);
                        const current = pieceEdits[u.id] ?? String(u.weight);
                        return (
                          <div key={u.id} className={`flex items-center gap-2 px-2.5 py-1.5 ${marked ? 'bg-error-50 line-through opacity-60' : ''}`}>
                            <span className="text-xs font-medium text-neutral-600 w-14 shrink-0">Piece #{idx + 1}</span>
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              disabled={marked}
                              value={current}
                              onChange={e => setPieceEdits(prev => ({ ...prev, [u.id]: e.target.value }))}
                              className="input text-xs flex-1 h-7 !py-0.5"
                            />
                            <span className="text-[10px] text-neutral-400 w-5 shrink-0">{u.weight_unit === 'carat' ? 'ct' : wLabel}</span>
                            <button
                              type="button"
                              onClick={() => setPieceDeletes(prev => {
                                const next = new Set(prev);
                                if (next.has(u.id)) next.delete(u.id); else next.add(u.id);
                                return next;
                              })}
                              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${marked ? 'border-neutral-300 text-neutral-600 hover:bg-neutral-50' : 'border-error-300 text-error-700 hover:bg-error-50'}`}
                            >
                              {marked ? 'Undo' : 'Remove'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-neutral-400 mt-1.5">Edit weights inline. Click Remove to mark a piece for deletion, then click Update Stock to save.</p>
                </div>
              );
            }
            return (
              <div>
                <label className="label">
                  Piece Weights — one per line ({wLabel})
                </label>
                <textarea
                  value={stockForm.piece_weights}
                  onChange={e => setStockForm(f => ({ ...f, piece_weights: e.target.value }))}
                  className="input h-28 text-xs resize-none font-mono"
                  placeholder={'2.3\n4.1\n1.8'}
                />
                <p className="text-[10px] text-neutral-400 mt-0.5">Each line = one piece. 3 lines = 3 pieces added to stock.</p>
              </div>
            );
          })() : (
            <div>
              <label className="label">Quantity</label>
              <input type="number" step="1" min={0} value={stockForm.quantity} onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))} className="input" placeholder="0" />
            </div>
          )}
          <div>
            <label className="label">Notes / Reference</label>
            <input value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Invoice #, supplier name, reason..." />
          </div>
          {selectedProduct && (
            <div className="bg-neutral-50 px-3 py-2 rounded-lg">
              {selectedProduct.is_gemstone ? (
                <p className="text-xs text-neutral-500">
                  In stock: <strong>{(productUnitsMap[selectedProduct.id] || []).filter(u => u.status === 'in_stock').length} pcs</strong>
                  {' · '}<strong>{(productUnitsMap[selectedProduct.id] || []).filter(u => u.status === 'in_stock').reduce((s, u) => s + (u.weight || 0), 0).toFixed(2)} {selectedProduct.weight_unit === 'carats' ? 'ct' : 'g'} total</strong>
                </p>
              ) : (
                <p className="text-xs text-neutral-500">Total stock: <strong>{selectedProduct.stock_quantity} {selectedProduct.unit}</strong></p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showLedgerModal}
        onClose={() => setShowLedgerModal(false)}
        title={`Stock Ledger — ${ledgerProduct?.name || ''}`}
        size="lg"
        footer={<button onClick={() => setShowLedgerModal(false)} className="btn-secondary">Close</button>}
      >
        <div>
          {ledgerProduct && (
            <div className="flex items-center gap-4 mb-3 p-3 bg-neutral-50 rounded-xl">
              <div>
                <p className="text-xs text-neutral-400">Current Stock</p>
                <p className="text-lg font-bold text-neutral-800">{ledgerProduct.stock_quantity} {ledgerProduct.unit}</p>
              </div>
            </div>
          )}
          {stockMovements.length === 0 ? (
            <EmptyState icon={History} title="No movements yet" description="Stock movements will appear here after purchases, sales, and adjustments." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="table-header text-left">Date</th>
                    <th className="table-header text-left">Type</th>
                    <th className="table-header text-right">Qty In</th>
                    <th className="table-header text-right">Qty Out</th>
                    <th className="table-header text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {stockMovements.map(mv => {
                    const isIn = ['in', 'purchase', 'return'].includes(mv.movement_type);
                    const typeColors: Record<string, any> = {
                      purchase: 'bg-success-50 text-success-700',
                      sale: 'bg-error-50 text-error-700',
                      return: 'bg-blue-50 text-blue-700',
                      adjustment: 'bg-neutral-100 text-neutral-600',
                      in: 'bg-success-50 text-success-700',
                      out: 'bg-error-50 text-error-700',
                    };
                    return (
                      <tr key={mv.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="table-cell text-xs text-neutral-500">{formatDate(mv.created_at)}</td>
                        <td className="table-cell">
                          <span className={`badge text-[10px] capitalize ${typeColors[mv.movement_type] || 'bg-neutral-100 text-neutral-600'}`}>{mv.movement_type}</span>
                        </td>
                        <td className="table-cell text-right font-medium text-success-600 text-xs">
                          {isIn ? `+${mv.quantity}` : '—'}
                        </td>
                        <td className="table-cell text-right font-medium text-error-600 text-xs">
                          {!isIn && mv.movement_type !== 'adjustment' ? `-${mv.quantity}` : mv.movement_type === 'adjustment' ? `=${mv.quantity}` : '—'}
                        </td>
                        <td className="table-cell text-xs text-neutral-500 max-w-[160px] truncate">{mv.notes || mv.reference_number || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Product Detail View */}
      {viewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setViewProduct(null)} />
          <div className="relative bg-white rounded-xl shadow-card-lg w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-900">{viewProduct.name}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewProduct(null); openEdit(viewProduct); }} className="btn-secondary text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => setViewProduct(null)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                  <X className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Image */}
              <div className="flex gap-4 items-start">
                {viewProduct.image_url ? (
                  <img src={viewProduct.image_url} alt={viewProduct.name} className="w-28 h-28 rounded-xl object-cover border border-neutral-100 shrink-0" />
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                    <ImagePlus className="w-8 h-8 text-neutral-300" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`badge text-[10px] font-semibold uppercase tracking-wider ${viewProduct.category === 'Astro Products' ? 'bg-primary-50 text-primary-700' : viewProduct.category === 'Vastu Items' ? 'bg-accent-50 text-accent-700' : 'bg-blue-50 text-blue-700'}`}>{viewProduct.category}</span>
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{viewProduct.name}</p>
                  {viewProduct.description && <p className="text-xs text-neutral-500">{viewProduct.description}</p>}
                  <p className="text-[10px] text-neutral-400 font-mono">{viewProduct.sku}</p>
                </div>
              </div>
              {/* Details grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Sell Price</p>
                  <p className="text-sm font-bold text-primary-700">{formatCurrency(viewProduct.selling_price)}</p>
                </div>
                {isAdmin && (
                  <div className="bg-neutral-50 rounded-lg p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Buy Price</p>
                    <p className="text-sm font-bold text-neutral-700">{formatCurrency(viewProduct.purchase_price)}</p>
                  </div>
                )}
                <div className={`rounded-lg p-3 ${viewProduct.stock_quantity <= 0 ? 'bg-error-50' : viewProduct.stock_quantity <= viewProduct.low_stock_alert ? 'bg-warning-50' : 'bg-success-50'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">In Stock</p>
                  <p className={`text-sm font-bold ${viewProduct.stock_quantity <= 0 ? 'text-error-700' : viewProduct.stock_quantity <= viewProduct.low_stock_alert ? 'text-warning-700' : 'text-success-700'}`}>
                    {viewProduct.stock_quantity} {viewProduct.unit}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Unit</p>
                  <p className="text-xs font-semibold text-neutral-700">{viewProduct.unit}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Low Stock Alert</p>
                  <p className="text-xs font-semibold text-neutral-700">{viewProduct.low_stock_alert}</p>
                </div>
              <div className={`rounded-lg p-3 ${viewProduct.is_active ? 'bg-success-50' : 'bg-neutral-100'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Status</p>
                  <p className={`text-xs font-bold ${viewProduct.is_active ? 'text-success-700' : 'text-neutral-500'}`}>{viewProduct.is_active ? 'Active' : 'Inactive'}</p>
                </div>
              </div>
              {/* Quick actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setViewProduct(null); openStockModal(viewProduct); }} className="btn-secondary text-xs flex-1 justify-center">
                  <ArrowUpDown className="w-3 h-3" /> {viewProduct.is_gemstone ? 'Add / Remove Pieces' : 'Stock In/Out'}
                </button>
                <button onClick={() => { setViewProduct(null); openLedgerModal(viewProduct); }} className="btn-secondary text-xs flex-1 justify-center">
                  <History className="w-3 h-3" /> View Movements
                </button>
              </div>
              {viewProduct.is_gemstone && (
                <div className="col-span-3 bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Available Pieces</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(productUnitsMap[viewProduct.id] || []).filter(u => u.status === 'in_stock').map(u => (
                      <span key={u.id} className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 text-[10px] font-semibold">
                        {u.weight} {u.weight_unit}
                      </span>
                    ))}
                    {(productUnitsMap[viewProduct.id] || []).filter(u => u.status === 'in_stock').length === 0 && (
                      <span className="text-xs text-neutral-400">No in-stock pieces</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rich Delete Modal */}
      {confirmProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setConfirmProduct(null); setLinkedDocs(null); setDeleteStockInfo(null); }} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className={`px-5 py-4 flex items-start gap-3 ${linkedDocs ? 'bg-error-50 border-b border-error-100' : 'bg-neutral-50 border-b border-neutral-100'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${linkedDocs ? 'bg-error-100' : 'bg-warning-100'}`}>
                <AlertTriangle className={`w-4 h-4 ${linkedDocs ? 'text-error-600' : 'text-warning-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-neutral-900">{linkedDocs ? 'Cannot Delete Product' : 'Delete Product'}</h3>
                <p className="text-xs text-neutral-500 mt-0.5 truncate">{confirmProduct.name}</p>
              </div>
              <button onClick={() => { setConfirmProduct(null); setLinkedDocs(null); setDeleteStockInfo(null); }}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-neutral-200 transition-colors shrink-0">
                <X className="w-3.5 h-3.5 text-neutral-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Product info row */}
              <div className="flex items-center gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                  confirmProduct.product_type === 'variant' ? 'bg-blue-100 text-blue-700' :
                  confirmProduct.product_type === 'weight' ? 'bg-amber-100 text-amber-700' :
                  confirmProduct.product_type === 'gemstone' ? 'bg-primary-100 text-primary-700' :
                  'bg-neutral-100 text-neutral-500'
                }`}>{confirmProduct.product_type || 'simple'}</span>
                <span className="text-xs text-neutral-400 font-mono">{confirmProduct.sku}</span>
              </div>

              {deleteLoading ? (
                <div className="text-center py-4 text-xs text-neutral-400">Loading stock information...</div>
              ) : deleteStockInfo && (
                <>
                  {/* Stock summary */}
                  <div className={`rounded-lg px-3 py-2.5 ${deleteStockInfo.totalStock > 0 ? 'bg-warning-50 border border-warning-200' : 'bg-neutral-50 border border-neutral-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Total Stock</p>
                    <p className={`text-lg font-bold ${deleteStockInfo.totalStock > 0 ? 'text-warning-700' : 'text-neutral-400'}`}>
                      {deleteStockInfo.totalStock} {confirmProduct.unit}
                    </p>
                    {deleteStockInfo.totalStock > 0 && (
                      <p className="text-[10px] text-warning-600 mt-0.5">All stock entries will be permanently deleted.</p>
                    )}
                  </div>

                  {/* Per-godown breakdown */}
                  {deleteStockInfo.godownBreakdown.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Stock per Godown</p>
                      <div className="border border-neutral-100 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <tbody className="divide-y divide-neutral-50">
                            {deleteStockInfo.godownBreakdown.map((row, i) => (
                              <tr key={i} className="hover:bg-neutral-50">
                                <td className="px-3 py-2">
                                  <p className="text-xs font-medium text-neutral-700">{row.godown_name}</p>
                                  {row.variant_name && (
                                    <p className="text-[10px] text-blue-600">{row.variant_name}</p>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <span className="text-xs font-semibold text-neutral-800">{row.quantity}</span>
                                  <span className="text-[10px] text-neutral-400 ml-1">{confirmProduct.unit}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Variants list */}
              {confirmProduct.product_type === 'variant' && variantsMap[confirmProduct.id]?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5">Variants ({variantsMap[confirmProduct.id].length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {variantsMap[confirmProduct.id].map(v => (
                      <span key={v.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium">{v.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked documents — blocking */}
              {linkedDocs && (
                <div className="space-y-1.5">
                  <p className="text-xs text-neutral-700 font-medium">This product is linked to active documents:</p>
                  {linkedDocs.soNumbers.length > 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-0.5">Sales Orders ({linkedDocs.soNumbers.length})</p>
                      <p className="text-xs text-blue-800 font-medium leading-relaxed">{linkedDocs.soNumbers.join(', ')}</p>
                    </div>
                  )}
                  {linkedDocs.dcNumbers.length > 0 && (
                    <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-0.5">Delivery Notes ({linkedDocs.dcNumbers.length})</p>
                      <p className="text-xs text-orange-800 font-medium leading-relaxed">{linkedDocs.dcNumbers.join(', ')}</p>
                    </div>
                  )}
                  {linkedDocs.invNumbers.length > 0 && (
                    <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider mb-0.5">Invoices ({linkedDocs.invNumbers.length})</p>
                      <p className="text-xs text-green-800 font-medium leading-relaxed">{linkedDocs.invNumbers.join(', ')}</p>
                    </div>
                  )}
                  <p className="text-xs text-neutral-500 pt-1">Remove this product from all linked documents before deleting.</p>
                </div>
              )}

              {/* Safe delete warning */}
              {!linkedDocs && (
                <div className="bg-error-50 border border-error-200 rounded-lg px-3 py-2.5">
                  <p className="text-xs font-semibold text-error-700 mb-0.5">This action is permanent and cannot be undone.</p>
                  <p className="text-xs text-error-600">
                    Deletes the product, all variants, all stock entries, and movement history.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-2">
              <button onClick={() => { setConfirmProduct(null); setLinkedDocs(null); setDeleteStockInfo(null); }} className="btn-secondary text-xs">
                {linkedDocs ? 'Got it' : 'Cancel'}
              </button>
              {!linkedDocs && (
                <button onClick={() => handleDelete(confirmProduct)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-error-600 hover:bg-error-700 text-white text-xs font-medium transition-colors">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Permanently
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}