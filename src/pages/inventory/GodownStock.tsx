import React, { useState, useEffect } from 'react';
import { Package, AlertTriangle, Search, TrendingUp, TrendingDown, RefreshCw, X, ChevronRight, ChevronDown } from 'lucide-react';
import { supabase, getSessionWithRetry, runQueryWithGlobalRecovery } from '../../lib/supabase';
import { formatCurrency, formatDate, useVisibilityReload } from '../../lib/utils';
import type { Godown, GodownStock, StockMovement } from '../../types';

interface VariantStockRow {
  variant_id: string;
  variant_name: string;
  variant_sku: string;
  selling_price: number;
  purchase_price: number;
  total_quantity: number;
  godown_quantities: Record<string, number>;
}

interface ProductWithStock {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  low_stock_alert: number;
  selling_price: number;
  purchase_price: number;
  product_type: string;
  weight_unit?: string;
  total_quantity: number;
  godown_quantities: Record<string, number>;
  variants?: VariantStockRow[];
  piece_count?: number;
  total_weight_grams?: number;
  pieces_by_godown?: Record<string, { count: number; weight: number }>;
}

interface MovementWithProduct extends StockMovement {
  products?: { name: string; sku: string };
}

export default function GodownStockPage() {
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [activeTab, setActiveTab] = useState<string>('overall');
  const [godownStock, setGodownStock] = useState<GodownStock[]>([]);
  const [allStock, setAllStock] = useState<GodownStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [drillProduct, setDrillProduct] = useState<ProductWithStock | null>(null);
  const [movements, setMovements] = useState<MovementWithProduct[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [gemPieces, setGemPieces] = useState<any[]>([]);

  useEffect(() => { loadData(); }, []);
  useVisibilityReload(loadData);
  useEffect(() => {
    if (activeTab !== 'overall') {
      loadGodownStock(activeTab);
    }
  }, [activeTab]);

  async function loadData() {
    setLoading(true);
    const session = await getSessionWithRetry();
    if (!session) {
      setLoading(false);
      return;
    }

    const [godownsRes, stockRes, piecesRes] = await Promise.all([
      runQueryWithGlobalRecovery(() => supabase.from('godowns').select('*').eq('is_active', true).order('name'), { label: 'godown-stock-godowns' }),
      runQueryWithGlobalRecovery(() => supabase.from('godown_stock')
        .select('*, products(id, name, sku, unit, low_stock_alert, selling_price, purchase_price, product_type, weight_unit), product_variants(id, name, sku, selling_price, purchase_price)')
        .gte('quantity', 0)
        .order('quantity', { ascending: false }), { allowEmpty: true, label: 'godown-stock-rows' }),
      runQueryWithGlobalRecovery(() => supabase.from('product_units').select('id, product_id, weight, weight_unit, godown_id, status').eq('status', 'in_stock'), { allowEmpty: true, label: 'godown-stock-pieces' }),
    ]);
    if (godownsRes.error) {
      console.error(godownsRes.error);
      setLoading(false);
      return;
    }
    if (stockRes.error) {
      console.error(stockRes.error);
      setLoading(false);
      return;
    }
    if (piecesRes.error) {
      console.error(piecesRes.error);
      setLoading(false);
      return;
    }
    if (!godownsRes.data || !stockRes.data || !piecesRes.data) {
      setLoading(false);
      return;
    }

    setGodowns(godownsRes.data);
    setAllStock(stockRes.data as GodownStock[]);
    setGemPieces(piecesRes.data);
    setLoading(false);
  };

  const loadGodownStock = async (godownId: string) => {
    const { data, error } = await supabase
      .from('godown_stock')
      .select('*, products(id, name, sku, unit, low_stock_alert, selling_price, purchase_price, product_type, weight_unit), product_variants(id, name, sku, selling_price, purchase_price)')
      .eq('godown_id', godownId)
      .gte('quantity', 0)
      .order('quantity', { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    if (!data) return;
    setGodownStock(data as GodownStock[]);
  };

  const openDrillDown = async (product: ProductWithStock) => {
    if (product.product_type === 'variant') return;
    setDrillProduct(product);
    setMovementsLoading(true);
    const { data, error } = await supabase
      .from('stock_movements')
      .select('*, products(name, sku)')
      .eq('product_id', product.product_id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.error(error);
      setMovementsLoading(false);
      return;
    }
    if (!data) {
      setMovementsLoading(false);
      return;
    }
    setMovements(data as MovementWithProduct[]);
    setMovementsLoading(false);
  };

  const toggleExpand = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  // Single aggregation function used for both Overall and per-godown views.
  // When godownId is provided, gemstone piece counts are scoped to that godown.
  const buildProducts = (stock: GodownStock[], godownId?: string): ProductWithStock[] => {
    const productMap: Record<string, ProductWithStock> = {};

    for (const s of stock) {
      const p = s.products as any;
      const v = (s as any).product_variants as any;
      if (!p) continue;

      if (!productMap[s.product_id]) {
        productMap[s.product_id] = {
          product_id: s.product_id,
          product_name: p.name,
          sku: p.sku,
          unit: p.unit,
          low_stock_alert: p.low_stock_alert,
          selling_price: p.selling_price,
          purchase_price: p.purchase_price,
          product_type: p.product_type || 'simple',
          weight_unit: p.weight_unit,
          total_quantity: 0,
          godown_quantities: {},
          variants: [],
        };
      }

      const row = productMap[s.product_id];

      if (v && s.variant_id) {
        let variantRow = row.variants!.find(vr => vr.variant_id === s.variant_id);
        if (!variantRow) {
          variantRow = {
            variant_id: s.variant_id,
            variant_name: v.name,
            variant_sku: v.sku,
            selling_price: v.selling_price,
            purchase_price: v.purchase_price,
            total_quantity: 0,
            godown_quantities: {},
          };
          row.variants!.push(variantRow);
        }
        variantRow.total_quantity += s.quantity;
        variantRow.godown_quantities[s.godown_id] = (variantRow.godown_quantities[s.godown_id] || 0) + s.quantity;
        row.total_quantity += s.quantity;
        row.godown_quantities[s.godown_id] = (row.godown_quantities[s.godown_id] || 0) + s.quantity;
      } else {
        row.total_quantity += s.quantity;
        row.godown_quantities[s.godown_id] = (row.godown_quantities[s.godown_id] || 0) + s.quantity;
      }
    }

    // Enrich gemstone products with piece data from product_units.
    // When godownId is set, scope counts to that godown so per-godown totals match.
    for (const row of Object.values(productMap)) {
      if (row.product_type !== 'gemstone') continue;
      const allPieces = gemPieces.filter(u => u.product_id === row.product_id);
      const pieces = godownId
        ? allPieces.filter(u => u.godown_id === godownId)
        : allPieces;
      row.piece_count = pieces.length;
      row.total_weight_grams = pieces.reduce((s: number, u: any) => s + (u.weight || 0), 0);
      row.total_quantity = pieces.length;
      const byGodown: Record<string, { count: number; weight: number }> = {};
      for (const u of allPieces) {
        const gid = u.godown_id || 'unassigned';
        if (!byGodown[gid]) byGodown[gid] = { count: 0, weight: 0 };
        byGodown[gid].count++;
        byGodown[gid].weight += u.weight || 0;
      }
      row.pieces_by_godown = byGodown;
    }

    return Object.values(productMap);
  };

  const displayProducts = activeTab === 'overall'
    ? buildProducts(allStock)
    : buildProducts(godownStock, activeTab);

  const filtered = displayProducts.filter(p =>
    !stockSearch ||
    p.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const totalValue = displayProducts.reduce((s, p) => {
    if (p.product_type === 'variant' && p.variants?.length) {
      return s + p.variants.reduce((vs, v) => vs + v.total_quantity * v.selling_price, 0);
    }
    return s + p.total_quantity * p.selling_price;
  }, 0);
  const lowCount = displayProducts.filter(p => p.low_stock_alert > 0 && p.total_quantity <= p.low_stock_alert).length;

  const movementIcon = (type: string) => {
    if (type === 'purchase' || type === 'in' || type === 'return') return <TrendingUp className="w-3.5 h-3.5 text-success-600" />;
    if (type === 'sale' || type === 'out') return <TrendingDown className="w-3.5 h-3.5 text-error-600" />;
    return <RefreshCw className="w-3.5 h-3.5 text-blue-500" />;
  };

  const movementSign = (type: string) => {
    if (type === 'purchase' || type === 'in' || type === 'return') return '+';
    if (type === 'sale' || type === 'out') return '-';
    return '±';
  };

  const movementColor = (type: string) => {
    if (type === 'purchase' || type === 'in' || type === 'return') return 'text-success-700';
    if (type === 'sale' || type === 'out') return 'text-error-700';
    return 'text-blue-600';
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Stock</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Godown-wise inventory · Click any product to expand details</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right px-3 py-1.5 bg-neutral-50 rounded-lg">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Stock Value</p>
              <p className="text-sm font-bold text-neutral-800">{formatCurrency(totalValue)}</p>
            </div>
            <div className="text-right px-3 py-1.5 bg-neutral-50 rounded-lg">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Products</p>
              <p className="text-sm font-bold text-neutral-800">{displayProducts.length}</p>
            </div>
            {lowCount > 0 && (
              <div className="flex items-center gap-1.5 bg-warning-50 border border-warning-100 text-warning-700 px-3 py-1.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                <div>
                  <p className="text-xs font-semibold">{lowCount} Low Stock</p>
                  <p className="text-[9px]">Need restocking</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 mt-4 border-b border-neutral-100 -mb-px">
          <button
            onClick={() => setActiveTab('overall')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === 'overall'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
            }`}
          >
            Overall
          </button>
          {godowns.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveTab(g.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === g.id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-neutral-800">
              {filtered.length} product{filtered.length !== 1 ? 's' : ''} with stock
            </p>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
                className="input pl-8 py-1.5 text-xs w-52"
              />
              {stockSearch && (
                <button onClick={() => setStockSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-neutral-400" />
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No stock recorded</p>
              <p className="text-xs text-neutral-400 mt-1">Stock updates automatically from purchases and invoices</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left">SKU</th>
                    <th className="table-header text-right">Qty</th>
                    <th className="table-header text-left">Unit</th>
                    {activeTab === 'overall' && godowns.map(g => (
                      <th key={g.id} className="table-header text-right">{g.name}</th>
                    ))}
                    <th className="table-header text-right">Value</th>
                    <th className="table-header text-left">Status</th>
                    <th className="table-header text-left">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const isVariant = p.product_type === 'variant' && (p.variants?.length || 0) > 0;
                    const isGemstone = p.product_type === 'gemstone';
                    const isWeight = p.product_type === 'weight';
                    const isExpanded = expandedProducts.has(p.product_id);
                    const isLow = p.low_stock_alert > 0 && p.total_quantity <= p.low_stock_alert;
                    const isOut = p.total_quantity === 0;
                    const stockPct = p.low_stock_alert > 0 ? Math.min(100, (p.total_quantity / (p.low_stock_alert * 3)) * 100) : 80;
                    const rowValue = isVariant
                      ? (p.variants || []).reduce((s, v) => s + v.total_quantity * v.selling_price, 0)
                      : p.total_quantity * p.selling_price;
                    const wLabel = p.weight_unit === 'carats' ? 'ct' : 'g';
                    const colSpan = 7 + (activeTab === 'overall' ? godowns.length : 0);
                    // Pieces for this product scoped to the active godown (or all for overall)
                    const productPieces = isGemstone
                      ? gemPieces.filter(u => u.product_id === p.product_id && (activeTab === 'overall' || u.godown_id === activeTab))
                      : [];

                    return (
                      <React.Fragment key={p.product_id}>
                        <tr
                          className={`border-b border-neutral-50 transition-colors cursor-pointer ${
                            isVariant ? 'hover:bg-blue-50/40' : 'hover:bg-primary-50/40'
                          } ${isLow ? 'bg-warning-50/30' : ''}`}
                          onClick={() => toggleExpand(p.product_id)}
                        >
                          <td className="table-cell">
                            <div className="flex items-center gap-2">
                              {isExpanded
                                ? <ChevronDown className={`w-3.5 h-3.5 shrink-0 ${isVariant ? 'text-blue-500' : 'text-neutral-400'}`} />
                                : <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isVariant ? 'text-blue-500' : 'text-neutral-300'}`} />
                              }
                              {!isExpanded && isLow && <AlertTriangle className="w-3.5 h-3.5 text-warning-500 shrink-0" />}
                              <span className="font-medium text-neutral-800 hover:text-primary-700">
                                {p.product_name}
                              </span>
                              {isVariant && (
                                <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                  {p.variants!.length} variants
                                </span>
                              )}
                              {isGemstone && (
                                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">gem</span>
                              )}
                            </div>
                          </td>
                          <td className="table-cell text-xs text-neutral-500 font-mono">{p.sku || '—'}</td>
                          <td className="table-cell text-right">
                            {isGemstone ? (
                              <>
                                <span className={`font-bold text-sm ${isOut ? 'text-error-600' : isLow ? 'text-warning-600' : 'text-neutral-900'}`}>
                                  {p.piece_count ?? p.total_quantity} pcs
                                </span>
                                {(p.total_weight_grams || 0) > 0 && (
                                  <p className="text-[10px] text-neutral-500">{(p.total_weight_grams || 0).toFixed(2)} {wLabel}</p>
                                )}
                              </>
                            ) : isWeight ? (
                              <>
                                <span className={`font-bold text-sm ${isOut ? 'text-error-600' : isLow ? 'text-warning-600' : 'text-neutral-900'}`}>
                                  {Number(p.total_quantity).toFixed(3)} {p.unit}
                                </span>
                                {p.low_stock_alert > 0 && (
                                  <p className="text-[9px] text-neutral-400">min: {p.low_stock_alert}</p>
                                )}
                              </>
                            ) : (
                              <>
                                <span className={`font-bold text-sm ${isOut ? 'text-error-600' : isLow ? 'text-warning-600' : 'text-neutral-900'}`}>
                                  {p.total_quantity}
                                </span>
                                {p.low_stock_alert > 0 && (
                                  <p className="text-[9px] text-neutral-400">min: {p.low_stock_alert}</p>
                                )}
                              </>
                            )}
                          </td>
                          <td className="table-cell text-xs text-neutral-500">{p.unit}</td>
                          {activeTab === 'overall' && godowns.map(g => (
                            <td key={g.id} className="table-cell text-right text-xs text-neutral-600">
                              {isGemstone ? (
                                <span className={p.pieces_by_godown?.[g.id]?.count ? 'font-medium' : 'text-neutral-300'}>
                                  {p.pieces_by_godown?.[g.id]?.count
                                    ? `${p.pieces_by_godown[g.id].count} pcs`
                                    : '—'}
                                </span>
                              ) : isWeight ? (
                                <span className={p.godown_quantities[g.id] ? 'font-medium' : 'text-neutral-300'}>
                                  {p.godown_quantities[g.id] ? Number(p.godown_quantities[g.id]).toFixed(3) : '—'}
                                </span>
                              ) : (
                                <span className={p.godown_quantities[g.id] ? 'font-medium' : 'text-neutral-300'}>
                                  {p.godown_quantities[g.id] || 0}
                                </span>
                              )}
                            </td>
                          ))}
                          <td className="table-cell text-right text-xs font-medium text-neutral-600">
                            {formatCurrency(rowValue)}
                          </td>
                          <td className="table-cell">
                            {isOut ? (
                              <span className="badge bg-error-50 text-error-700 border border-error-100">Out of Stock</span>
                            ) : isLow ? (
                              <span className="badge bg-warning-50 text-warning-700 border border-warning-100">Low Stock</span>
                            ) : (
                              <span className="badge bg-success-50 text-success-700">In Stock</span>
                            )}
                          </td>
                          <td className="table-cell w-20">
                            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${isOut ? 'bg-error-500' : isLow ? 'bg-warning-500' : 'bg-success-500'}`}
                                style={{ width: `${isOut ? 0 : stockPct}%` }}
                              />
                            </div>
                          </td>
                        </tr>

                        {/* Expandable detail row */}
                        {isExpanded && (
                          <tr className="border-b border-neutral-100 bg-neutral-50/60">
                            <td colSpan={colSpan} className="px-6 py-3">
                              {isVariant ? (
                                /* Variant breakdown */
                                <div className="space-y-1">
                                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Variant breakdown</p>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-neutral-400">
                                        <th className="text-left font-medium pb-1">Variant</th>
                                        <th className="text-left font-medium pb-1">SKU</th>
                                        <th className="text-right font-medium pb-1">Total Qty</th>
                                        {godowns.map(g => (
                                          <th key={g.id} className="text-right font-medium pb-1">{g.name}</th>
                                        ))}
                                        <th className="text-right font-medium pb-1">Value</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(p.variants || []).map(v => {
                                        const vIsOut = v.total_quantity === 0;
                                        return (
                                          <tr key={v.variant_id} className="border-t border-neutral-100">
                                            <td className="py-1 font-medium text-neutral-700">{v.variant_name}</td>
                                            <td className="py-1 text-neutral-400 font-mono">{v.variant_sku || '—'}</td>
                                            <td className={`py-1 text-right font-bold ${vIsOut ? 'text-error-600' : 'text-neutral-800'}`}>{v.total_quantity}</td>
                                            {godowns.map(g => (
                                              <td key={g.id} className={`py-1 text-right ${v.godown_quantities[g.id] ? 'text-neutral-700 font-medium' : 'text-neutral-300'}`}>
                                                {v.godown_quantities[g.id] || '—'}
                                              </td>
                                            ))}
                                            <td className="py-1 text-right text-neutral-600">{formatCurrency(v.total_quantity * v.selling_price)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : isGemstone ? (
                                /* Gemstone piece list */
                                <div>
                                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                    Individual pieces · {productPieces.length} in stock
                                    {(productPieces.reduce((s, u) => s + (u.weight || 0), 0)) > 0 && (
                                      <span className="ml-2 normal-case font-normal">
                                        {productPieces.reduce((s, u) => s + (u.weight || 0), 0).toFixed(2)} {wLabel} total
                                      </span>
                                    )}
                                  </p>
                                  {productPieces.length === 0 ? (
                                    <p className="text-xs text-neutral-400">No pieces in stock{activeTab !== 'overall' ? ' in this godown' : ''}.</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {productPieces.map((u, i) => {
                                        const gName = godowns.find(g => g.id === u.godown_id)?.name;
                                        return (
                                          <span key={u.id} className="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                            <span className="font-mono text-amber-500">#{i + 1}</span>
                                            {u.weight?.toFixed(2)} {wLabel}
                                            {gName && <span className="text-amber-400">· {gName}</span>}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                /* Simple / weight product — godown breakdown + history link */
                                <div className="flex items-start gap-6">
                                  <div>
                                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Godown breakdown</p>
                                    <div className="flex flex-wrap gap-3">
                                      {godowns.map(g => {
                                        const qty = p.godown_quantities[g.id] || 0;
                                        return (
                                          <div key={g.id} className={`text-xs px-3 py-1.5 rounded-lg border ${qty > 0 ? 'bg-white border-neutral-200 text-neutral-700' : 'bg-neutral-50 border-neutral-100 text-neutral-300'}`}>
                                            <span className="font-medium">{g.name}</span>
                                            <span className="ml-2 font-bold">
                                              {isWeight ? Number(qty).toFixed(3) : qty} {p.unit}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <button
                                    className="text-xs text-primary-600 hover:text-primary-800 underline underline-offset-2 mt-4 shrink-0"
                                    onClick={e => { e.stopPropagation(); openDrillDown(p); }}
                                  >
                                    View movement history
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>

    {drillProduct && (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrillProduct(null)} />
        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900">{drillProduct.product_name}</h2>
              <p className="text-xs text-neutral-500">{drillProduct.sku} · Stock movements history</p>
            </div>
            <button onClick={() => setDrillProduct(null)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {(() => {
              const isDrillGem = drillProduct.product_type === 'gemstone';
              const dWLabel = drillProduct.weight_unit === 'carats' ? 'ct' : 'g';
              if (isDrillGem) {
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="card !p-3">
                      <p className="text-xs text-neutral-500 mb-1">Total Pieces</p>
                      <p className="text-xl font-bold text-neutral-900">{drillProduct.piece_count ?? drillProduct.total_quantity}</p>
                      {(drillProduct.total_weight_grams || 0) > 0 && (
                        <p className="text-[10px] text-neutral-400 mt-0.5">{(drillProduct.total_weight_grams || 0).toFixed(2)} {dWLabel} total</p>
                      )}
                    </div>
                    {godowns.map(g => {
                      const gData = drillProduct.pieces_by_godown?.[g.id];
                      return (
                        <div key={g.id} className="card !p-3">
                          <p className="text-xs text-neutral-500 mb-1 truncate">{g.name}</p>
                          <p className="text-xl font-bold text-neutral-900">{gData?.count ?? 0} pcs</p>
                          {(gData?.weight || 0) > 0 && (
                            <p className="text-[10px] text-neutral-400 mt-0.5">{(gData?.weight || 0).toFixed(2)} {dWLabel}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              }
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="card !p-3">
                    <p className="text-xs text-neutral-500 mb-1">Total Stock</p>
                    <p className="text-xl font-bold text-neutral-900">{drillProduct.total_quantity}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{drillProduct.unit}</p>
                  </div>
                  {godowns.map(g => (
                    <div key={g.id} className="card !p-3">
                      <p className="text-xs text-neutral-500 mb-1 truncate">{g.name}</p>
                      <p className="text-xl font-bold text-neutral-900">{drillProduct.godown_quantities[g.id] || 0}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{drillProduct.unit}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div>
              <h3 className="text-sm font-semibold text-neutral-800 mb-3">Movement History</h3>
              {movementsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : movements.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500">No movements recorded yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-neutral-100">
                        <th className="table-header text-left">Date</th>
                        <th className="table-header text-left">Type</th>
                        <th className="table-header text-right">Qty</th>
                        <th className="table-header text-left">Reference</th>
                        <th className="table-header text-left">Godown</th>
                        <th className="table-header text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map(m => (
                        <tr key={m.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                          <td className="table-cell text-xs text-neutral-500">{formatDate(m.created_at)}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              {movementIcon(m.movement_type)}
                              <span className="text-xs capitalize text-neutral-700">{m.movement_type}</span>
                            </div>
                          </td>
                          <td className={`table-cell text-right font-bold text-sm ${movementColor(m.movement_type)}`}>
                            {movementSign(m.movement_type)}{m.quantity}
                          </td>
                          <td className="table-cell">
                            {m.reference_number ? (
                              <span className="text-xs font-medium text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">
                                {m.reference_number}
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                          <td className="table-cell text-xs text-neutral-500">
                            {m.godown_id ? (godowns.find(g => g.id === m.godown_id)?.name || '—') : '—'}
                          </td>
                          <td className="table-cell text-xs text-neutral-500">{m.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
