import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, DollarSign, CreditCard, BarChart2, ShoppingCart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useDateRange } from '../../contexts/DateRangeContext';
import { useAuth } from '../../contexts/AuthContext';
import type { ActivePage } from '../../types';

interface FinanceOverviewProps {
  onNavigate: (page: ActivePage) => void;
}

interface MonthData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface KpiItem {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  show: boolean;
  isPercent?: boolean;
}

export default function FinanceOverview({ onNavigate }: FinanceOverviewProps) {
  const { dateRange } = useDateRange();
  const { isAdmin } = useAuth();

  const [stats, setStats] = useState({
    totalRevenue: 0, totalExpenses: 0, totalProfit: 0,
    totalReceivable: 0, totalPayable: 0, courierCost: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [agingBuckets, setAgingBuckets] = useState({ current: 0, '0-30': 0, '30-60': 0, '60+': 0 });

  useEffect(() => {
    loadFinanceData();
  }, [dateRange]);

  const loadFinanceData = async () => {
    const fromDate = dateRange.from;
    const toDate = dateRange.to;

    const [invoicesRes, expensesRes, courierRes, payableRes] = await Promise.all([
      supabase.from('invoices').select('total_amount, paid_amount, outstanding_amount, status, invoice_date, due_date').gte('invoice_date', fromDate).lte('invoice_date', toDate).neq('status', 'cancelled'),
      supabase.from('expenses').select('amount, expense_date').gte('expense_date', fromDate).lte('expense_date', toDate),
      supabase.from('courier_entries').select('charges').gte('courier_date', fromDate).lte('courier_date', toDate),
      supabase.from('purchase_entries').select('outstanding_amount').neq('status', 'paid'),
    ]);

    const invoices = invoicesRes.data || [];
    const expenses = expensesRes.data || [];
    const courier = courierRes.data || [];

    const totalRevenue = invoices.reduce((s, i) => s + i.paid_amount, 0);
    const totalReceivable = invoices.reduce((s, i) => s + (i.outstanding_amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const courierCost = courier.reduce((s, c) => s + c.charges, 0);
    const totalPayable = (payableRes.data || []).reduce((s, p) => s + (p.outstanding_amount || 0), 0);

    setStats({
      totalRevenue,
      totalExpenses,
      totalProfit: totalRevenue - totalExpenses - courierCost,
      totalReceivable,
      totalPayable,
      courierCost,
    });

    const today = new Date();
    const aging = { current: 0, '0-30': 0, '30-60': 0, '60+': 0 };
    invoices.filter(i => i.outstanding_amount > 0).forEach(inv => {
      if (!inv.due_date) { aging.current += inv.outstanding_amount; return; }
      const days = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 0) aging.current += inv.outstanding_amount;
      else if (days <= 30) aging['0-30'] += inv.outstanding_amount;
      else if (days <= 60) aging['30-60'] += inv.outstanding_amount;
      else aging['60+'] += inv.outstanding_amount;
    });
    setAgingBuckets(aging);

    const now = new Date();
    const months: MonthData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleString('en-IN', { month: 'short' });
      const rev = invoices.filter(inv => inv.invoice_date?.startsWith(monthStr)).reduce((s, inv) => s + inv.paid_amount, 0);
      const exp = expenses.filter(e => e.expense_date?.startsWith(monthStr)).reduce((s, e) => s + e.amount, 0);
      months.push({ month: monthLabel, revenue: rev, expenses: exp, profit: rev - exp });
    }
    setMonthlyData(months);
  };

  const maxRevenue = Math.max(...monthlyData.map(m => m.revenue), 1);

  const kpiItems: KpiItem[] = [
    { label: 'Total Revenue Collected', value: stats.totalRevenue, icon: TrendingUp, color: 'text-success-600', bg: 'bg-success-50', show: true },
    { label: 'Total Profit', value: stats.totalProfit, icon: DollarSign, color: stats.totalProfit >= 0 ? 'text-success-600' : 'text-error-600', bg: stats.totalProfit >= 0 ? 'bg-success-50' : 'bg-error-50', show: isAdmin },
    { label: 'Total Expenses', value: stats.totalExpenses, icon: TrendingDown, color: 'text-error-600', bg: 'bg-error-50', show: true },
    { label: 'Receivable', value: stats.totalReceivable, icon: CreditCard, color: 'text-warning-600', bg: 'bg-warning-50', show: true },
    { label: 'Total Payable (Suppliers)', value: stats.totalPayable, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50', show: isAdmin },
    { label: 'Courier Costs', value: stats.courierCost, icon: BarChart2, color: 'text-blue-600', bg: 'bg-blue-50', show: true },
    { label: 'Profit Margin', value: stats.totalRevenue > 0 ? ((stats.totalProfit / stats.totalRevenue) * 100) : 0, icon: TrendingUp, color: 'text-primary-600', bg: 'bg-primary-50', isPercent: true, show: isAdmin },
  ].filter(k => k.show);

  const plRows = [
    { label: 'Total Sales Revenue', value: stats.totalRevenue, cls: 'text-success-600', show: true },
    { label: 'Less: Expenses', value: -stats.totalExpenses, cls: 'text-error-600', show: true },
    { label: 'Less: Courier Cost', value: -stats.courierCost, cls: 'text-error-600', show: true },
  ].filter(r => r.show);

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <h1 className="text-xl font-semibold text-neutral-900">Finance Overview</h1>
        <p className="text-xs text-neutral-500 mt-0.5">Profit & Loss, Cash Flow, and Financial Health</p>
      </div>

      <div className="p-6 space-y-5">
        <div className="grid grid-cols-3 gap-4">
          {kpiItems.map(kpi => (
            <div key={kpi.label} className="card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{kpi.label}</p>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`w-3.5 h-3.5 ${kpi.color}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>
                {kpi.isPercent ? `${kpi.value.toFixed(1)}%` : formatCurrency(kpi.value)}
              </p>
            </div>
          ))}
        </div>

        <div className="card">
          <p className="text-sm font-semibold text-neutral-800 mb-4">Revenue vs Expenses - Selected Period (Monthly Breakdown)</p>
          <div className="flex items-end gap-3 h-40">
            {monthlyData.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: '120px' }}>
                  <div
                    className="w-5 bg-primary-500 rounded-t-sm transition-all"
                    style={{ height: `${(m.revenue / maxRevenue) * 100}%`, minHeight: m.revenue > 0 ? '4px' : '0' }}
                    title={`Revenue: ${formatCurrency(m.revenue)}`}
                  />
                  <div
                    className="w-5 bg-error-400 rounded-t-sm transition-all"
                    style={{ height: `${(m.expenses / maxRevenue) * 100}%`, minHeight: m.expenses > 0 ? '4px' : '0' }}
                    title={`Expenses: ${formatCurrency(m.expenses)}`}
                  />
                </div>
                <p className="text-[10px] text-neutral-500 font-medium">{m.month}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-primary-500 rounded-sm" /><p className="text-xs text-neutral-500">Revenue</p></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-error-400 rounded-sm" /><p className="text-xs text-neutral-500">Expenses</p></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {isAdmin && (
            <div className="card">
              <p className="text-sm font-semibold text-neutral-800 mb-3">P&L Summary</p>
              <div className="space-y-2">
                {plRows.map(row => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-neutral-50">
                    <span className="text-sm text-neutral-600">{row.label}</span>
                    <span className={`text-sm font-semibold ${row.cls}`}>
                      {row.value >= 0 ? '' : '-'}{formatCurrency(Math.abs(row.value))}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2 bg-neutral-50 rounded-lg px-3">
                  <span className="text-sm font-bold text-neutral-800">Net Profit</span>
                  <span className={`text-base font-bold ${stats.totalProfit >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                    {formatCurrency(stats.totalProfit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className={isAdmin ? '' : 'col-span-2'}>
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-neutral-800">Receivable Aging</p>
                <button onClick={() => onNavigate('invoices')} className="text-xs text-primary-600 hover:underline">View Invoices</button>
              </div>
              <div className="space-y-2">
                {Object.entries(agingBuckets).map(([bucket, amount]) => (
                  <div key={bucket} className="flex items-center gap-3">
                    <div className="w-20 text-xs font-medium text-neutral-600">{bucket === 'current' ? 'Current' : `${bucket} days`}</div>
                    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${bucket === 'current' ? 'bg-success-500' : bucket === '0-30' ? 'bg-warning-500' : bucket === '30-60' ? 'bg-orange-500' : 'bg-error-500'}`}
                        style={{ width: `${stats.totalReceivable > 0 ? (amount / stats.totalReceivable) * 100 : 0}%` }}
                      />
                    </div>
                    <span className={`text-xs font-semibold w-20 text-right ${bucket === '60+' ? 'text-error-600' : 'text-neutral-700'}`}>{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
