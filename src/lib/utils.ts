export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (date: string | Date): string => {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
};

export const formatDateInput = (date: string | Date): string => {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

export const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convert = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart) + ' Rupees';
  if (decPart > 0) result += ' and ' + convert(decPart) + ' Paise';
  return result + ' Only';
};

export const generateId = (prefix: string): string => {
  // Legacy fallback — used only where supabase RPC is not available (e.g. courier dispatch_number)
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${year}${month}-${random}`;
};

/** Calls the DB atomic sequence — returns format PREFIX/YYMM/001 */
export async function nextDocNumber(prefix: 'SO' | 'DC' | 'INV' | 'EXP' | 'PO' | 'DSP' | 'TRF' | 'DS' | 'RET', supabaseClient: import('@supabase/supabase-js').SupabaseClient): Promise<string> {
  const { data, error } = await supabaseClient.rpc('next_document_number', { p_prefix: prefix });
  if (error || !data) {
    return generateId(prefix);
  }
  return data as string;
}

export const getStatusColor = (status: string): string => {
  const map: Record<string, string> = {
    draft: 'bg-neutral-100 text-neutral-600',
    sent: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-blue-100 text-blue-700',
    partial: 'bg-warning-50 text-warning-600',
    paid: 'bg-success-50 text-success-600',
    received: 'bg-success-50 text-success-600',
    delivered: 'bg-success-50 text-success-600',
    completed: 'bg-success-50 text-success-600',
    overdue: 'bg-error-50 text-error-600',
    cancelled: 'bg-error-50 text-error-600',
    unpaid: 'bg-error-50 text-error-600',
    created: 'bg-amber-50 text-amber-700',
    invoiced: 'bg-green-50 text-green-700',
    issued: 'bg-blue-50 text-blue-600',
    dispatched: 'bg-blue-100 text-blue-700',
    scheduled: 'bg-blue-100 text-blue-700',
    in_transit: 'bg-blue-100 text-blue-700',
    booked: 'bg-neutral-100 text-neutral-600',
    returned: 'bg-error-50 text-error-600',
    rescheduled: 'bg-warning-50 text-warning-600',
  };
  return map[status] || 'bg-neutral-100 text-neutral-600';
};

export const truncate = (str: string, len = 30): string => {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
};

export const getDefaultGodownId = (godowns: Array<{ id: string; is_default?: boolean }>): string => {
  const defaultGodown = godowns.find(g => g.is_default);
  return defaultGodown?.id || godowns[0]?.id || '';
};

export const daysBetween = (date1: string, date2: string = new Date().toISOString()): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
};

export const getAgingBucket = (dueDate: string): string => {
  const days = daysBetween(dueDate);
  if (days <= 0) return 'current';
  if (days <= 30) return '0-30';
  if (days <= 60) return '30-60';
  return '60+';
};

export const exportToCSV = (data: Record<string, unknown>[], filename: string): void => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h];
    const str = val === null || val === undefined ? '' : String(val);
    return `"${str.replace(/"/g, '""')}"`;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const EMAIL_DOMAIN = import.meta.env.VITE_EMAIL_DOMAIN || 'prachifulagar.app';

export const usernameToEmail = (username: string): string => {
  return `${username.toLowerCase().replace(/\s+/g, '.')}@${EMAIL_DOMAIN}`;
};

import { useEffect, useRef } from 'react';

/**
 * Calls `reload` when the browser tab becomes visible again after being hidden
 * for more than `idleMs` milliseconds (default 60 s). This ensures stale data
 * is refreshed when the user returns to the tab after being idle.
 */
export function useVisibilityReload(reload: () => void, idleMs = 60_000) {
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
      } else {
        if (hiddenAt.current !== null && Date.now() - hiddenAt.current > idleMs) {
          reload();
        }
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [reload, idleMs]);
}
