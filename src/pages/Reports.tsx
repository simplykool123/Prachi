import { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, Users, Package, Download, IndianRupee, ShoppingCart, Clock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, exportToCSV } from '../lib/utils';
import { useDateRange } from '../contexts/DateRangeContext';

type ReportTab = 'sales' | 'pnl' | 'stock' | 'buysell' | 'aging' | 'payables';

export default function Reports() {
  const { dateRange } = useDateRange();
  const [activeTab, setActiveTab] = useState<ReportTab>('sales');
  const [loading, setLoading] = useState(true);

  const [salesByMonth, setSalesByMonth] = useState<{ month: string; revenue: number; invoiceCount: number }[]>([]);
  const [topCustomers, setTopCustomers] = useState<{ name: string; revenue: number; invoiceCount: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number; quantity: number }[]>([]);

  const [pnl, setPnl] = useState({ revenue: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0 });
  const [monthlyPnl, setMonthlyPnl] = useState<{ month: string; revenue: number; purchases: number; expenses: number; profit: number }[]>([]);

  const [stockVal, setStockVal] = useState<{ name: string; sku: string; unit: string; qty: number; purchase_price: number; value: number }[]>([]);
  const [stockByGodown, setStockByGodown] = useState<{ godown: string; value: number; items: number }[]>([]);

  const [buySell, setBuySell] = useState<{ name: string; bought: number; sold: number; bought_val: number; sold_val: number }[]>([]);

  const [agingBuckets, setAgingBuckets] = useState({ current: 0, '0_30': 0, '30_60': 0, '60plus': 0 });
  const [agingInvoices, setAgingInvoices] = useState<{ invoice_number: string; customer_name: string; due_date: string; outstanding: number; days: number }[]>([]);

  const [payables, setPayables] = useState<{ name: string; balance: number; entry_count: number }[]>([]);
  const [totalPayable, setTotalPayable] = useState(0);

  useEffect(() => { loadAll(); }, [dateRange]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadSales(), loadPnl(), loadStock(), loadBuySell(), loadAging(), loadPayables()]);
    setLoading(false);
  };

  const loadSales = async () => {
    const [invoicesRes, itemsRes] = await Promise.all([
      supabase.from('invoices').select('invoice_date, total_amount, customer_name')
        .gte('invoice_date', dateRange.from).lte('invoice_date', dateRange.to).neq('status', 'cancelled'),
      supabase.from('invoice_items').select('product_name, total_price, quantity, created_at')
        .gte('created_at', dateRange.from + 'T00:00:00').lte('created_at', dateRange.to + 'T23:59:59'),
    ]);
    const invoices = invoicesRes.data || [];
    const items = itemsRes.data || [];

    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const monthMap = new Map<string, { revenue: number; count: number; label: string }>();
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur <= to) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, { revenue: 0, count: 0, label: cur.toLocaleString('en-IN', { month: 'short', year: '2-digit' }) });
      cur.setMonth(cur.getMonth() + 1);
    }
    invoices.forEach(inv => {
      const key = inv.invoice_date.slice(0, 7);
      const e = monthMap.get(key);
      if (e) { e.revenue += inv.total_amount; e.count++; }
    });
    setSalesByMonth(Array.from(monthMap.values()).map(v => ({ month: v.label, revenue: v.revenue, invoiceCount: v.count })));

    const custMap = new Map<string, { revenue: number; count: number }>();
    invoices.forEach(inv => {
      const e = custMap.get(inv.customer_name) || { revenue: 0, count: 0 };
      e.revenue += inv.total_amount; e.count++;
      custMap.set(inv.customer_name, e);
    });
    setTopCustomers(
      Array.from(custMap.entries()).map(([name, v]) => ({ name, revenue: v.revenue, invoiceCount: v.count }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    );

    const prodMap = new Map<string, { revenue: number; qty: number }>();
    items.forEach((item: { product_name: string; total_price: number; quantity: number }) => {
      const e = prodMap.get(item.product_name) || { revenue: 0, qty: 0 };
      e.revenue += item.total_price; e.qty += item.quantity;
      prodMap.set(item.product_name, e);
    });
    setTopProducts(
      Array.from(prodMap.entries()).map(([name, v]) => ({ name, revenue: v.revenue, quantity: v.qty }))
        .sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    );
  };

  const loadPnl = async () => {
    const [invoicesRes, purchasesRes, expensesRes] = await Promise.all([
      supabase.from('invoices').select('total_amount, paid_amount, invoice_date')
        .gte('invoice_date', dateRange.from).lte('invoice_date', dateRange.to).neq('status', 'cancelled'),
      supabase.from('purchase_entries').select('total_amount, entry_date')
        .gte('entry_date', dateRange.from).lte('entry_date', dateRange.to),
      supabase.from('expenses').select('amount, expense_date')
        .gte('expense_date', dateRange.from).lte('expense_date', dateRange.to),
    ]);

    const invoices = invoicesRes.data || [];
    const purchases = purchasesRes.data || [];
    const expenses = expensesRes.data || [];

    const revenue = invoices.reduce((s, i) => s + i.total_amount, 0);
    const purchaseTotal = purchases.reduce((s, p) => s + p.total_amount, 0);
    const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
    const grossProfit = revenue - purchaseTotal;
    const netProfit = grossProfit - expenseTotal;
    setPnl({ revenue, purchases: purchaseTotal, expenses: expenseTotal, grossProfit, netProfit });

    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const months: { key: string; label: string }[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    while (cur <= to) {
      months.push({ key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`, label: cur.toLocaleString('en-IN', { month: 'short', year: '2-digit' }) });
      cur.setMonth(cur.getMonth() + 1);
    }
    const mp = months.map(m => {
      const rev = invoices.filter(i => i.invoice_date.startsWith(m.key)).reduce((s, i) => s + i.total_amount, 0);
      const pur = purchases.filter(p => p.entry_date.startsWith(m.key)).reduce((s, p) => s + p.total_amount, 0);
      const exp = expenses.filter(e => e.expense_date.startsWith(m.key)).reduce((s, e) => s + e.amount, 0);
      return { month: m.label, revenue: rev, purchases: pur, expenses: exp, profit: rev - pur - exp };
    });
    setMonthlyPnl(mp);
  };

  const loadStock = async () => {
    const [productsRes, godownStockRes, godownsRes] = await Promise.all([
      supabase.from('products').select('id, name, sku, unit, purchase_price, stock_quantity').eq('is_active', true).order('name'),
      supabase.from('godown_stock').select('product_id, godown_id, quantity'),
      supabase.from('godowns').select('id, name').eq('is_active', true),
    ]);
    const prods = productsRes.data || [];
    const rows = godownStockRes.data || [];
    const godownList = godownsRes.data || [];

    const qtyMap: Record<string, number> = {};
    rows.forEach(r => { qtyMap[r.product_id] = (qtyMap[r.product_id] || 0) + (r.quantity || 0); });

    const sv = prods.map(p => ({
      name: p.name,
      sku: p.sku || '',
      unit: p.unit,
      qty: qtyMap[p.id] || p.stock_quantity || 0,
      purchase_price: p.purchase_price || 0,
      value: (qtyMap[p.id] || p.stock_quantity || 0) * (p.purchase_price || 0),
    })).sort((a, b) => b.value - a.value);
    setStockVal(sv);

    const godownValMap: Record<string, { value: number; items: number; godown: string }> = {};
    godownList.forEach(g => { godownValMap[g.id] = { value: 0, items: 0, godown: g.name }; });
    rows.forEach(r => {
      const prod = prods.find(p => p.id === r.product_id);
      if (prod && godownValMap[r.godown_id]) {
        godownValMap[r.godown_id].value += (r.quantity || 0) * (prod.purchase_price || 0);
        if (r.quantity > 0) godownValMap[r.godown_id].items++;
      }
    });
    setStockByGodown(
      Object.values(godownValMap).filter(g => g.value > 0 || g.items > 0)
        .sort((a, b) => b.value - a.value)
    );
  };

  const loadBuySell = async () => {
    const [purchaseItemsRes, saleItemsRes] = await Promise.all([
      supabase.from('purchase_entry_items').select('product_name, quantity, unit_price'),
      supabase.from('invoice_items').select('product_name, quantity, total_price')
        .gte('created_at', dateRange.from + 'T00:00:00').lte('created_at', dateRange.to + 'T23:59:59'),
    ]);

    const buyMap = new Map<string, { qty: number; val: number }>();
    (purchaseItemsRes.data || []).forEach((i: { product_name: string; quantity: number; unit_price: number }) => {
      const e = buyMap.get(i.product_name) || { qty: 0, val: 0 };
      e.qty += i.quantity; e.val += i.quantity * i.unit_price;
      buyMap.set(i.product_name, e);
    });
    const sellMap = new Map<string, { qty: number; val: number }>();
    (saleItemsRes.data || []).forEach((i: { product_name: string; quantity: number; total_price: number }) => {
      const e = sellMap.get(i.product_name) || { qty: 0, val: 0 };
      e.qty += i.quantity; e.val += i.total_price;
      sellMap.set(i.product_name, e);
    });

    const allNames = new Set([...buyMap.keys(), ...sellMap.keys()]);
    const result = Array.from(allNames).map(name => ({
      name,
      bought: buyMap.get(name)?.qty || 0,
      sold: sellMap.get(name)?.qty || 0,
      bought_val: buyMap.get(name)?.val || 0,
      sold_val: sellMap.get(name)?.val || 0,
    })).sort((a, b) => (b.sold_val + b.bought_val) - (a.sold_val + a.bought_val)).slice(0, 20);
    setBuySell(result);
  };

  const loadAging = async () => {
    const today = new Date();
    const { data } = await supabase.from('invoices')
      .select('invoice_number, customer_name, due_date, outstanding_amount')
      .gt('outstanding_amount', 0).neq('status', 'cancelled').neq('status', 'paid');

    const invoices = data || [];
    const buckets = { current: 0, '0_30': 0, '30_60': 0, '60plus': 0 };
    const detail: typeof agingInvoices = [];

    invoices.forEach(inv => {
      const days = inv.due_date
        ? Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24))
        : -999;
      detail.push({ invoice_number: inv.invoice_number, customer_name: inv.customer_name, due_date: inv.due_date || '', outstanding: inv.outstanding_amount, days });
      if (days <= 0) buckets.current += inv.outstanding_amount;
      else if (days <= 30) buckets['0_30'] += inv.outstanding_amount;
      else if (days <= 60) buckets['30_60'] += inv.outstanding_amount;
      else buckets['60plus'] += inv.outstanding_amount;
    });

    setAgingBuckets(buckets);
    setAgingInvoices(detail.sort((a, b) => b.days - a.days));
  };

  const loadPayables = async () => {
    const { data } = await supabase.from('suppliers').select('name, balance').gt('balance', 0).eq('is_active', true).order('balance', { ascending: false });
    const { data: entries } = await supabase.from('purchase_entries').select('supplier_name, outstanding_amount').gt('outstanding_amount', 0);
    const countMap: Record<string, number> = {};
    (entries || []).forEach((e: { supplier_name: string }) => { countMap[e.supplier_name] = (countMap[e.supplier_name] || 0) + 1; });
    const sups = (data || []).map((s: { name: string; balance: number }) => ({ name: s.name, balance: s.balance, entry_count: countMap[s.name] || 0 }));
    setPayables(sups);
    setTotalPayable(sups.reduce((s, p) => s + p.balance, 0));
  };

  const TABS: { id: ReportTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'sales', label: 'Sales Analysis', icon: TrendingUp },
    { id: 'pnl', label: 'Profit & Loss', icon: IndianRupee },
    { id: 'stock', label: 'Stock Valuation', icon: Package },
    { id: 'buysell', label: 'Buy vs Sell', icon: ShoppingCart },
    { id: 'aging', label: 'Customer Aging', icon: Clock },
    { id: 'payables', label: 'Outstanding Payables', icon: AlertTriangle },
  ];

  const maxRevenue = Math.max(...salesByMonth.map(m => m.revenue), 1);
  const maxCustRevenue = topCustomers[0]?.revenue || 1;
  const maxProdRevenue = topProducts[0]?.revenue || 1;
  const totalStockValue = stockVal.reduce((s, p) => s + p.value, 0);
  const maxStockVal = stockVal[0]?.value || 1;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <h1 className="text-xl font-semibold text-neutral-900">Reports & Analytics</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Business insights for the selected date range</p>
      </div>

      <div className="bg-white border-b border-neutral-100 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'sales' && (
              <div className="space-y-5">
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-neutral-800 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary-600" /> Sales Trend</p>
                    <button onClick={() => exportToCSV(salesByMonth.map(m => ({ Month: m.month, Revenue: m.revenue, Invoices: m.invoiceCount })), 'sales-by-month')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <div className="flex items-end gap-4" style={{ height: '160px' }}>
                    {salesByMonth.map(m => (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <p className="text-[10px] font-semibold text-neutral-700">{m.revenue > 0 ? formatCurrency(m.revenue) : ''}</p>
                        <div className="w-full flex flex-col justify-end" style={{ height: '120px' }}>
                          <div className="w-full bg-primary-500 hover:bg-primary-600 rounded-t-lg transition-colors cursor-default"
                            style={{ height: `${(m.revenue / maxRevenue) * 100}%`, minHeight: m.revenue > 0 ? '8px' : '2px' }}
                            title={`${m.month}: ${formatCurrency(m.revenue)}`}
                          />
                        </div>
                        <p className="text-[10px] text-neutral-500 font-medium">{m.month}</p>
                        <p className="text-[9px] text-neutral-400">{m.invoiceCount} inv</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-neutral-800 flex items-center gap-2"><Users className="w-4 h-4 text-primary-600" /> Top Customers</p>
                      <button onClick={() => exportToCSV(topCustomers.map((c, i) => ({ Rank: i + 1, Customer: c.name, Revenue: c.revenue, Invoices: c.invoiceCount })), 'top-customers')} className="btn-ghost text-xs py-1 px-2">
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                    {topCustomers.length === 0 ? <p className="text-xs text-neutral-400 text-center py-4">No data</p> : (
                      <div className="space-y-2.5">
                        {topCustomers.map((c, i) => (
                          <div key={c.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-neutral-400 w-4">#{i + 1}</span><span className="text-xs font-medium text-neutral-800 truncate max-w-[140px]">{c.name}</span></div>
                              <div className="text-right"><span className="text-xs font-bold text-neutral-900">{formatCurrency(c.revenue)}</span><span className="text-[9px] text-neutral-400 ml-1">({c.invoiceCount} inv)</span></div>
                            </div>
                            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-primary-400 rounded-full" style={{ width: `${(c.revenue / maxCustRevenue) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm font-semibold text-neutral-800 flex items-center gap-2"><Package className="w-4 h-4 text-accent-600" /> Top Products by Value</p>
                      <button onClick={() => exportToCSV(topProducts.map((p, i) => ({ Rank: i + 1, Product: p.name, Revenue: p.revenue, Quantity: p.quantity })), 'top-products')} className="btn-ghost text-xs py-1 px-2">
                        <Download className="w-3 h-3" /> CSV
                      </button>
                    </div>
                    {topProducts.length === 0 ? <p className="text-xs text-neutral-400 text-center py-4">No data</p> : (
                      <div className="space-y-2.5">
                        {topProducts.map((p, i) => (
                          <div key={p.name}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2"><span className="text-[10px] font-bold text-neutral-400 w-4">#{i + 1}</span><span className="text-xs font-medium text-neutral-800 truncate max-w-[140px]">{p.name}</span></div>
                              <div className="text-right"><span className="text-xs font-bold text-neutral-900">{formatCurrency(p.revenue)}</span><span className="text-[9px] text-neutral-400 ml-1">(qty: {p.quantity})</span></div>
                            </div>
                            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden"><div className="h-full bg-accent-400 rounded-full" style={{ width: `${(p.revenue / maxProdRevenue) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'pnl' && (
              <div className="space-y-5">
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { label: 'Total Revenue', value: pnl.revenue, color: 'text-primary-700', bg: 'bg-primary-50' },
                    { label: 'Total Purchases', value: pnl.purchases, color: 'text-neutral-700', bg: 'bg-neutral-50' },
                    { label: 'Gross Profit', value: pnl.grossProfit, color: pnl.grossProfit >= 0 ? 'text-success-700' : 'text-error-600', bg: pnl.grossProfit >= 0 ? 'bg-success-50' : 'bg-error-50' },
                    { label: 'Expenses', value: pnl.expenses, color: 'text-warning-700', bg: 'bg-warning-50' },
                    { label: 'Net Profit', value: pnl.netProfit, color: pnl.netProfit >= 0 ? 'text-success-700' : 'text-error-600', bg: pnl.netProfit >= 0 ? 'bg-success-50' : 'bg-error-50' },
                  ].map(s => (
                    <div key={s.label} className={`card ${s.bg}`}>
                      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">{s.label}</p>
                      <p className={`text-lg font-bold mt-1 ${s.color}`}>{formatCurrency(s.value)}</p>
                    </div>
                  ))}
                </div>
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-neutral-800">Monthly P&amp;L Breakdown</p>
                    <button onClick={() => exportToCSV(monthlyPnl.map(m => ({ Month: m.month, Revenue: m.revenue, Purchases: m.purchases, Expenses: m.expenses, 'Net Profit': m.profit })), 'pnl-monthly')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-100">
                          <th className="text-left py-2 text-neutral-500 font-semibold">Month</th>
                          <th className="text-right py-2 text-neutral-500 font-semibold">Revenue</th>
                          <th className="text-right py-2 text-neutral-500 font-semibold">Purchases</th>
                          <th className="text-right py-2 text-neutral-500 font-semibold">Expenses</th>
                          <th className="text-right py-2 text-neutral-500 font-semibold">Net Profit</th>
                          <th className="text-right py-2 text-neutral-500 font-semibold">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyPnl.map(m => (
                          <tr key={m.month} className="border-b border-neutral-50 hover:bg-neutral-50">
                            <td className="py-2.5 font-medium text-neutral-700">{m.month}</td>
                            <td className="py-2.5 text-right font-semibold text-primary-700">{formatCurrency(m.revenue)}</td>
                            <td className="py-2.5 text-right text-neutral-600">{formatCurrency(m.purchases)}</td>
                            <td className="py-2.5 text-right text-warning-600">{formatCurrency(m.expenses)}</td>
                            <td className={`py-2.5 text-right font-bold ${m.profit >= 0 ? 'text-success-700' : 'text-error-600'}`}>{formatCurrency(m.profit)}</td>
                            <td className={`py-2.5 text-right text-xs ${m.profit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                              {m.revenue > 0 ? `${((m.profit / m.revenue) * 100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                          <td className="py-2.5 font-bold text-neutral-800">Total</td>
                          <td className="py-2.5 text-right font-bold text-primary-700">{formatCurrency(pnl.revenue)}</td>
                          <td className="py-2.5 text-right font-bold text-neutral-700">{formatCurrency(pnl.purchases)}</td>
                          <td className="py-2.5 text-right font-bold text-warning-700">{formatCurrency(pnl.expenses)}</td>
                          <td className={`py-2.5 text-right font-bold ${pnl.netProfit >= 0 ? 'text-success-700' : 'text-error-600'}`}>{formatCurrency(pnl.netProfit)}</td>
                          <td className={`py-2.5 text-right font-bold ${pnl.netProfit >= 0 ? 'text-success-600' : 'text-error-500'}`}>
                            {pnl.revenue > 0 ? `${((pnl.netProfit / pnl.revenue) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'stock' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="card">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Stock Value (at Cost)</p>
                    <p className="text-2xl font-bold text-primary-700 mt-1">{formatCurrency(totalStockValue)}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{stockVal.length} active products</p>
                  </div>
                  <div className="card">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">By Godown</p>
                    <div className="mt-2 space-y-1">
                      {stockByGodown.slice(0, 4).map(g => (
                        <div key={g.godown} className="flex items-center justify-between text-xs">
                          <span className="text-neutral-600">{g.godown}</span>
                          <span className="font-semibold text-neutral-800">{formatCurrency(g.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">Product-wise Stock Valuation</p>
                    <button onClick={() => exportToCSV(stockVal.map(p => ({ Product: p.name, SKU: p.sku, Unit: p.unit, Qty: p.qty, 'Cost Price': p.purchase_price, 'Total Value': p.value })), 'stock-valuation')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="table-header text-left">#</th>
                        <th className="table-header text-left">Product</th>
                        <th className="table-header text-left">SKU</th>
                        <th className="table-header text-right">In Stock</th>
                        <th className="table-header text-right">Cost/Unit</th>
                        <th className="table-header text-right">Total Value</th>
                        <th className="table-header" style={{ width: '100px' }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockVal.map((p, i) => (
                        <tr key={p.name} className="border-t border-neutral-50 hover:bg-neutral-50">
                          <td className="table-cell text-neutral-400 font-medium">{i + 1}</td>
                          <td className="table-cell font-medium text-neutral-800">{p.name}</td>
                          <td className="table-cell text-neutral-400">{p.sku || '—'}</td>
                          <td className="table-cell text-right text-neutral-700">{p.qty} {p.unit}</td>
                          <td className="table-cell text-right text-neutral-600">{formatCurrency(p.purchase_price)}</td>
                          <td className="table-cell text-right font-bold text-primary-700">{formatCurrency(p.value)}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary-400 rounded-full" style={{ width: `${(p.value / maxStockVal) * 100}%` }} />
                              </div>
                              <span className="text-[9px] text-neutral-400 w-7 text-right">{totalStockValue > 0 ? `${((p.value / totalStockValue) * 100).toFixed(0)}%` : '0%'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                        <td colSpan={5} className="table-cell font-bold text-neutral-800">Total</td>
                        <td className="table-cell text-right font-bold text-primary-700">{formatCurrency(totalStockValue)}</td>
                        <td className="table-cell" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'buysell' && (
              <div className="space-y-5">
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-neutral-100">
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">Purchase vs Sales by Product</p>
                      <p className="text-xs text-neutral-400 mt-0.5">For selected date range</p>
                    </div>
                    <button onClick={() => exportToCSV(buySell.map(b => ({ Product: b.name, 'Bought Qty': b.bought, 'Sold Qty': b.sold, 'Buy Value': b.bought_val, 'Sell Value': b.sold_val, 'Margin': b.sold_val - b.bought_val })), 'buy-vs-sell')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="table-header text-left">Product</th>
                        <th className="table-header text-right">Purchased (Qty)</th>
                        <th className="table-header text-right">Purchase Value</th>
                        <th className="table-header text-right">Sold (Qty)</th>
                        <th className="table-header text-right">Sales Value</th>
                        <th className="table-header text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buySell.map(b => {
                        const margin = b.sold_val - b.bought_val;
                        return (
                          <tr key={b.name} className="border-t border-neutral-50 hover:bg-neutral-50">
                            <td className="table-cell font-medium text-neutral-800">{b.name}</td>
                            <td className="table-cell text-right text-neutral-600">{b.bought > 0 ? b.bought : '—'}</td>
                            <td className="table-cell text-right text-neutral-600">{b.bought_val > 0 ? formatCurrency(b.bought_val) : '—'}</td>
                            <td className="table-cell text-right text-neutral-700 font-medium">{b.sold > 0 ? b.sold : '—'}</td>
                            <td className="table-cell text-right font-semibold text-primary-700">{b.sold_val > 0 ? formatCurrency(b.sold_val) : '—'}</td>
                            <td className={`table-cell text-right font-bold ${margin > 0 ? 'text-success-700' : margin < 0 ? 'text-error-600' : 'text-neutral-400'}`}>
                              {b.sold_val > 0 ? formatCurrency(margin) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {buySell.length === 0 && <p className="text-xs text-neutral-400 text-center py-8">No data for selected period</p>}
                </div>
              </div>
            )}

            {activeTab === 'aging' && (
              <div className="space-y-5">
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Not Yet Due', value: agingBuckets.current, color: 'text-success-700', bg: 'bg-success-50' },
                    { label: 'Overdue 1–30 days', value: agingBuckets['0_30'], color: 'text-warning-700', bg: 'bg-warning-50' },
                    { label: 'Overdue 31–60 days', value: agingBuckets['30_60'], color: 'text-orange-700', bg: 'bg-orange-50' },
                    { label: 'Overdue 60+ days', value: agingBuckets['60plus'], color: 'text-error-700', bg: 'bg-error-50' },
                  ].map(b => (
                    <div key={b.label} className={`card ${b.bg}`}>
                      <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">{b.label}</p>
                      <p className={`text-xl font-bold mt-1 ${b.color}`}>{formatCurrency(b.value)}</p>
                    </div>
                  ))}
                </div>
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">Outstanding Invoice Details</p>
                    <button onClick={() => exportToCSV(agingInvoices.map(i => ({ Invoice: i.invoice_number, Customer: i.customer_name, 'Due Date': i.due_date, Outstanding: i.outstanding, 'Days Overdue': i.days > 0 ? i.days : 0 })), 'customer-aging')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="table-header text-left">Invoice #</th>
                        <th className="table-header text-left">Customer</th>
                        <th className="table-header text-left">Due Date</th>
                        <th className="table-header text-right">Outstanding</th>
                        <th className="table-header text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingInvoices.map(inv => (
                        <tr key={inv.invoice_number} className="border-t border-neutral-50 hover:bg-neutral-50">
                          <td className="table-cell font-medium text-primary-700">{inv.invoice_number}</td>
                          <td className="table-cell font-medium text-neutral-800">{inv.customer_name}</td>
                          <td className="table-cell text-neutral-500">{inv.due_date || '—'}</td>
                          <td className="table-cell text-right font-bold text-neutral-900">{formatCurrency(inv.outstanding)}</td>
                          <td className="table-cell text-center">
                            {inv.days <= 0 ? (
                              <span className="text-[10px] bg-success-50 text-success-700 px-2 py-0.5 rounded-full font-medium">Not due</span>
                            ) : inv.days <= 30 ? (
                              <span className="text-[10px] bg-warning-50 text-warning-700 px-2 py-0.5 rounded-full font-medium">{inv.days}d overdue</span>
                            ) : inv.days <= 60 ? (
                              <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium">{inv.days}d overdue</span>
                            ) : (
                              <span className="text-[10px] bg-error-50 text-error-700 px-2 py-0.5 rounded-full font-medium">{inv.days}d overdue</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {agingInvoices.length === 0 && <p className="text-xs text-success-700 text-center py-8 font-medium">No outstanding invoices. All clear!</p>}
                </div>
              </div>
            )}

            {activeTab === 'payables' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="card bg-error-50">
                    <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Total Outstanding Payables</p>
                    <p className="text-2xl font-bold text-error-700 mt-1">{formatCurrency(totalPayable)}</p>
                    <p className="text-xs text-neutral-400 mt-0.5">{payables.length} suppliers with balance</p>
                  </div>
                  <div className="card">
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Largest Payable</p>
                    {payables[0] ? (
                      <>
                        <p className="text-sm font-bold text-neutral-800 mt-1">{payables[0].name}</p>
                        <p className="text-xl font-bold text-error-700 mt-0.5">{formatCurrency(payables[0].balance)}</p>
                      </>
                    ) : <p className="text-xs text-neutral-400 mt-1">No payables</p>}
                  </div>
                </div>
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-neutral-100">
                    <p className="text-sm font-semibold text-neutral-800">Supplier-wise Outstanding Payables</p>
                    <button onClick={() => exportToCSV(payables.map((p, i) => ({ Rank: i + 1, Supplier: p.name, Balance: p.balance, Entries: p.entry_count })), 'outstanding-payables')} className="btn-ghost text-xs py-1 px-2">
                      <Download className="w-3 h-3" /> CSV
                    </button>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="table-header text-left">#</th>
                        <th className="table-header text-left">Supplier</th>
                        <th className="table-header text-right">Outstanding Balance</th>
                        <th className="table-header text-right">Open Entries</th>
                        <th className="table-header">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payables.map((p, i) => (
                        <tr key={p.name} className="border-t border-neutral-50 hover:bg-neutral-50">
                          <td className="table-cell text-neutral-400 font-medium">{i + 1}</td>
                          <td className="table-cell font-semibold text-neutral-800">{p.name}</td>
                          <td className="table-cell text-right font-bold text-error-700">{formatCurrency(p.balance)}</td>
                          <td className="table-cell text-right text-neutral-500">{p.entry_count}</td>
                          <td className="table-cell">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                <div className="h-full bg-error-400 rounded-full" style={{ width: `${totalPayable > 0 ? (p.balance / totalPayable) * 100 : 0}%` }} />
                              </div>
                              <span className="text-[9px] text-neutral-400 w-7 text-right">{totalPayable > 0 ? `${((p.balance / totalPayable) * 100).toFixed(0)}%` : '0%'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-neutral-200 bg-neutral-50">
                        <td colSpan={2} className="table-cell font-bold text-neutral-800">Total</td>
                        <td className="table-cell text-right font-bold text-error-700">{formatCurrency(totalPayable)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                  {payables.length === 0 && <p className="text-xs text-success-700 text-center py-8 font-medium">No outstanding payables. All suppliers settled!</p>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
