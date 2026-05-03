import { useState, useEffect } from 'react';
import { Search, Mail, Phone, Package, MessageSquare, X, Inbox } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import type { InquiryLead } from '../types';

type StatusFilter = 'All' | InquiryLead['status'];
const STATUS_OPTIONS: InquiryLead['status'][] = ['new', 'read', 'replied', 'closed'];

const statusColors: Record<InquiryLead['status'], string> = {
  new: 'bg-primary-100 text-primary-700',
  read: 'bg-blue-100 text-blue-700',
  replied: 'bg-success-100 text-success-700',
  closed: 'bg-neutral-200 text-neutral-600',
};

export default function InquiryLeads() {
  const toast = useToast();
  const [leads, setLeads] = useState<InquiryLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [selected, setSelected] = useState<InquiryLead | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('inquiry_leads')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error(error);
      toast.error(`Failed to load leads: ${error.message}`);
      setLoading(false);
      return;
    }
    setLeads((data || []) as InquiryLead[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (id: string, status: InquiryLead['status']) => {
    const { error } = await supabase
      .from('inquiry_leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      toast.error(`Failed to update status: ${error.message}`);
      return;
    }
    setLeads(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    if (selected?.id === id) setSelected(s => (s ? { ...s, status } : s));
    toast.success(`Marked as ${status}`);
  };

  const openLead = async (lead: InquiryLead) => {
    setSelected(lead);
    if (lead.status === 'new') {
      await updateStatus(lead.id, 'read');
    }
  };

  const filtered = leads.filter(l => {
    if (statusFilter !== 'All' && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.phone?.toLowerCase().includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.product_name?.toLowerCase().includes(q) ||
        l.message?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts: Record<StatusFilter, number> = {
    All: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    read: leads.filter(l => l.status === 'read').length,
    replied: leads.filter(l => l.status === 'replied').length,
    closed: leads.filter(l => l.status === 'closed').length,
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Inquiry Leads</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Customer inquiries submitted from the website.</p>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="card">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Status</p>
              <div className="flex gap-1.5 flex-wrap">
                {(['All', ...STATUS_OPTIONS] as StatusFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                      statusFilter === s ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {s} <span className="opacity-70">({counts[s]})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="ml-auto">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, phone, product..."
                  className="input pl-8 w-72 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Name</th>
                <th className="table-header text-left">Phone</th>
                <th className="table-header text-left">Email</th>
                <th className="table-header text-left">Product</th>
                <th className="table-header text-left">Message</th>
                <th className="table-header text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr
                  key={lead.id}
                  onClick={() => openLead(lead)}
                  className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-3 text-xs text-neutral-500 whitespace-nowrap">{formatDate(lead.created_at)}</td>
                  <td className="py-3 px-3">
                    <p className={`text-xs ${lead.status === 'new' ? 'font-bold text-neutral-900' : 'font-medium text-neutral-700'}`}>
                      {lead.name || '—'}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-xs text-neutral-600">{lead.phone || '—'}</td>
                  <td className="py-3 px-3 text-xs text-neutral-600 max-w-[180px] truncate">{lead.email || '—'}</td>
                  <td className="py-3 px-3 text-xs text-neutral-700 max-w-[160px] truncate">{lead.product_name || '—'}</td>
                  <td className="py-3 px-3 text-xs text-neutral-500 max-w-[260px] truncate">
                    {lead.message ? lead.message : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="py-3 px-3">
                    <span className={`badge text-[10px] font-semibold uppercase tracking-wider ${statusColors[lead.status]}`}>
                      {lead.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <EmptyState
              icon={Inbox}
              title={leads.length === 0 ? 'No leads yet' : 'No leads match your filters'}
              description={leads.length === 0 ? 'Inquiries submitted from the website will appear here.' : 'Try clearing your filters.'}
            />
          )}
          {loading && (
            <div className="py-10 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {selected && (
        <Modal
          isOpen={!!selected}
          onClose={() => setSelected(null)}
          title={`Inquiry from ${selected.name || 'Anonymous'}`}
          subtitle={formatDate(selected.created_at)}
          size="md"
          footer={
            <>
              <button onClick={() => setSelected(null)} className="btn-secondary">Close</button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1 flex items-center gap-1">
                  <Phone className="w-3 h-3" /> Phone
                </p>
                {selected.phone ? (
                  <a href={`tel:${selected.phone}`} className="text-xs font-semibold text-primary-700 hover:underline">
                    {selected.phone}
                  </a>
                ) : (
                  <p className="text-xs text-neutral-400">—</p>
                )}
              </div>
              <div className="bg-neutral-50 rounded-lg p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" /> Email
                </p>
                {selected.email ? (
                  <a href={`mailto:${selected.email}`} className="text-xs font-semibold text-primary-700 hover:underline break-all">
                    {selected.email}
                  </a>
                ) : (
                  <p className="text-xs text-neutral-400">—</p>
                )}
              </div>
              <div className="col-span-2 bg-neutral-50 rounded-lg p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Product
                </p>
                <p className="text-xs font-medium text-neutral-700">{selected.product_name || '—'}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1.5 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Message
              </p>
              <div className="bg-white border border-neutral-200 rounded-lg p-3 min-h-[80px] text-xs text-neutral-700 whitespace-pre-wrap">
                {selected.message || <span className="text-neutral-300">No message provided.</span>}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">Status</p>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_OPTIONS.map(s => {
                  const isActive = selected.status === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateStatus(selected.id, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                        isActive
                          ? `${statusColors[s]} border-transparent`
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
