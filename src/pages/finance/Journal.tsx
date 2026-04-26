import { useState, useEffect } from 'react';
import { Plus, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, generateId } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import { required, positiveNumber } from '../../lib/validate';
import type { JournalEntry } from '../../types';

const ACCOUNTS = [
  'Sales Revenue', 'Service Revenue', 'Cash', 'Bank Account',
  'Accounts Receivable', 'Accounts Payable', 'Rent Expense',
  'Travel Expense', 'Marketing Expense', 'Courier Expense',
  'Salary Expense', 'Supplies Expense', 'Miscellaneous Expense',
];

export default function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    journal_date: new Date().toISOString().split('T')[0],
    description: '', debit_account: 'Accounts Receivable', credit_account: 'Sales Revenue',
    amount: '', notes: '',
  });
  const { saving, run } = useAsyncAction();

  useEffect(() => { loadEntries(); }, []);

  const loadEntries = async () => {
    const { data } = await supabase.from('journal_entries').select('*').order('journal_date', { ascending: false });
    setEntries(data || []);
  };

  const isFormValid = required(form.description) && positiveNumber(form.amount);

  const handleSave = () => run(
    async () => {
      const { error } = await supabase.from('journal_entries').insert({
        journal_number: generateId('JE'),
        journal_date: form.journal_date,
        description: form.description,
        debit_account: form.debit_account,
        credit_account: form.credit_account,
        amount: parseFloat(form.amount),
        notes: form.notes,
      });
      if (error) throw error;
      setShowModal(false);
      loadEntries();
    },
    { success: 'Journal entry saved' }
  );

  const totalDebits = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Journal Entries</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Manual accounting adjustments</p>
        </div>
        <button onClick={() => { setForm({ journal_date: new Date().toISOString().split('T')[0], description: '', debit_account: 'Accounts Receivable', credit_account: 'Sales Revenue', amount: '', notes: '' }); setShowModal(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> New Entry
        </button>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Entries</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{entries.length}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Amount</p>
            <p className="text-2xl font-bold text-primary-700 mt-1">{formatCurrency(totalDebits)}</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Journal #</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Description</th>
                <th className="table-header text-left">Debit Account</th>
                <th className="table-header text-left">Credit Account</th>
                <th className="table-header text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-neutral-50 hover:bg-neutral-50">
                  <td className="table-cell font-medium text-primary-700">{e.journal_number}</td>
                  <td className="table-cell text-neutral-500">{formatDate(e.journal_date)}</td>
                  <td className="table-cell font-medium">{e.description}</td>
                  <td className="table-cell">
                    <span className="badge bg-error-50 text-error-600 text-[10px]">Dr: {e.debit_account}</span>
                  </td>
                  <td className="table-cell">
                    <span className="badge bg-success-50 text-success-600 text-[10px]">Cr: {e.credit_account}</span>
                  </td>
                  <td className="table-cell text-right font-semibold">{formatCurrency(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && <EmptyState icon={FileText} title="No journal entries" description="Create your first manual journal entry." />}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Journal Entry" size="md"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !isFormValid} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.journal_date} onChange={e => setForm(f => ({ ...f, journal_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input" placeholder="0" />
            </div>
          </div>
          <div>
            <label className="label">Description *</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" placeholder="Journal entry description" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Debit Account (Dr)</label>
              <select value={form.debit_account} onChange={e => setForm(f => ({ ...f, debit_account: e.target.value }))} className="input">
                {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Credit Account (Cr)</label>
              <select value={form.credit_account} onChange={e => setForm(f => ({ ...f, credit_account: e.target.value }))} className="input">
                {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
          </div>
          <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-600">
            <p className="font-medium mb-1">Journal Entry Preview:</p>
            <p><span className="text-error-600 font-medium">Dr.</span> {form.debit_account} .... {form.amount ? formatCurrency(parseFloat(form.amount)) : '₹0'}</p>
            <p className="ml-4"><span className="text-success-600 font-medium">Cr.</span> {form.credit_account} .... {form.amount ? formatCurrency(parseFloat(form.amount)) : '₹0'}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
