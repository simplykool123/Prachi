import { useState, useEffect } from 'react';
import { Package, AlertTriangle, Search, BarChart2, ArrowLeft, TrendingUp, TrendingDown, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../lib/utils';
import type { Godown, GodownStock, StockMovement } from '../../types';

interface ProductWithStock {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  low_stock_alert: number;
  selling_price: number;
  purchase_price: number;
  total_quantity: number;
  godown_quantities: Record<string, number>;
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
  const [drillProduct, setDrillProduct] = useState<ProductWithStock | null>(null);
  const [movements, setMovements] = useState<MovementWithProduct[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (activeTab !== 'overall') {
      loadGodownStock(activeTab);
    }
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    const [godownsRes, stockRes] = await Promise.all([
      supabase.from('godowns').select('*').eq('is_active', true).order('name'),
      supabase.from('godown_stock')
        .select('*, products(id, name, sku, unit, low_stock_alert, selling_price, purchase_price)')
        .gt('quantity', 0)
        .order('quantity', { ascending: false }),
    ]);
    setGodowns(godownsRes.data || []);
    setAllStock((stockRes.data || []) as GodownStock[]);
    setLoading(false);
  };

  const loadGodownStock = async (godownId: string) => {
    const { data } = await supabase
      .from('godown_stock')
      .select('*, products(id, name, sku, unit, low_stock_alert, selling_price, purchase_price)')
      .eq('godown_id', godownId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false });
    setGodownStock((data || []) as GodownStock[]);
  };

  const openDrillDown = async (product: ProductWithStock) => {
    setDrillProduct(product);
    setMovementsLoading(true);
    const { data } = await supabase
      .from('stock_movements')
      .select('*, products(name, sku)')
      .eq('product_id', product.product_id)
      .order('created_at', { ascending: false })
      .limit(50);
    setMovements((data || []) as MovementWithProduct[]);
    setMovementsLoading(false);
  };

  const overallProducts = (): ProductWithStock[] => {
    const map: Record<string, ProductWithStock> = {};
    for (const s of allStock) {
      const p = s.products;
      if (!p) continue;
      if (!map[s.product_id]) {
        map[s.product_id] = {
          product_id: s.product_id,
          product_name: p.name,
          sku: p.sku,
          unit: p.unit,
          low_stock_alert: p.low_stock_alert,
          selling_price: p.selling_price,
          purchase_price: p.purchase_price,
          total_quantity: 0,
          godown_quantities: {},
        };
      }
      map[s.product_id].total_quantity += s.quantity;
      map[s.product_id].godown_quantities[s.godown_id] = s.quantity;
    }
    return Object.values(map);
  };

  const currentGodownProducts = (): ProductWithStock[] => {
    return godownStock.map(s => ({
      product_id: s.product_id,
      product_name: s.products?.name || '',
      sku: s.products?.sku || '',
      unit: s.products?.unit || '',
      low_stock_alert: s.products?.low_stock_alert || 0,
      selling_price: s.products?.selling_price || 0,
      purchase_price: s.products?.purchase_price || 0,
      total_quantity: s.quantity,
      godown_quantities: { [s.godown_id]: s.quantity },
    }));
  };

  const displayProducts = activeTab === 'overall' ? overallProducts() : currentGodownProducts();

  const filtered = displayProducts.filter(p =>
    !stockSearch ||
    p.product_name.toLowerCase().includes(stockSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const totalValue = displayProducts.reduce((s, p) => s + (p.total_quantity * p.selling_price), 0);
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

  if (drillProduct) {
    return (
      <div className="flex-1 overflow-y-auto bg-neutral-50">
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => setDrillProduct(null)} className="p-1.5 rounded-lg hover:bg-neutral-200 transition-colors">
              <ArrowLeft className="w-4 h-4 text-neutral-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-neutral-900">{drillProduct.product_name}</h1>
              <p className="text-xs text-neutral-500">{drillProduct.sku} · Stock movements history</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-neutral-500 mb-1">Total Stock</p>
              <p className="text-2xl font-bold text-neutral-900">{drillProduct.total_quantity}</p>
              <p className="text-[10px] text-neutral-400 mt-0.5">{drillProduct.unit}</p>
            </div>
            {activeTab === 'overall' && godowns.map(g => (
              <div key={g.id} className="card">
                <p className="text-xs text-neutral-500 mb-1 truncate">{g.name}</p>
                <p className="text-2xl font-bold text-neutral-900">{drillProduct.godown_quantities[g.id] || 0}</p>
                <p className="text-[10px] text-neutral-400 mt-0.5">{drillProduct.unit}</p>
              </div>
            ))}
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-neutral-800 mb-4">Movement History</h3>
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
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Stock</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Godown-wise inventory levels · Click any product to see movement history</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-neutral-500">Stock Value</p>
              <p className="text-sm font-bold text-neutral-800">{formatCurrency(totalValue)}</p>
            </div>
            {lowCount > 0 && (
              <div className="flex items-center gap-1.5 bg-warning-50 text-warning-700 px-3 py-1.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{lowCount} low stock</span>
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
                    const isLow = p.low_stock_alert > 0 && p.total_quantity <= p.low_stock_alert;
                    const stockPct = p.low_stock_alert > 0 ? Math.min(100, (p.total_quantity / (p.low_stock_alert * 3)) * 100) : 80;

                    return (
                      <tr
                        key={p.product_id}
                        className="border-b border-neutral-50 hover:bg-primary-50/40 transition-colors cursor-pointer"
                        onClick={() => openDrillDown(p)}
                      >
                        <td className="table-cell font-medium text-neutral-800 text-primary-700 hover:underline">{p.product_name}</td>
                        <td className="table-cell text-xs text-neutral-500">{p.sku || '—'}</td>
                        <td className="table-cell text-right">
                          <span className={`font-bold ${isLow ? 'text-warning-600' : 'text-neutral-900'}`}>
                            {p.total_quantity}
                          </span>
                        </td>
                        <td className="table-cell text-xs text-neutral-500">{p.unit}</td>
                        {activeTab === 'overall' && godowns.map(g => (
                          <td key={g.id} className="table-cell text-right text-xs text-neutral-600">
                            {p.godown_quantities[g.id] || 0}
                          </td>
                        ))}
                        <td className="table-cell text-right text-xs text-neutral-600">
                          {formatCurrency(p.total_quantity * p.selling_price)}
                        </td>
                        <td className="table-cell">
                          {isLow ? (
                            <span className="badge bg-warning-50 text-warning-700">Low Stock</span>
                          ) : (
                            <span className="badge bg-success-50 text-success-700">In Stock</span>
                          )}
                        </td>
                        <td className="table-cell w-20">
                          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isLow ? 'bg-warning-500' : 'bg-success-500'}`}
                              style={{ width: `${stockPct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
