import { useState, useEffect } from 'react';
import { Plus, Search, Truck, CheckCircle, Package, IndianRupee, ArrowUpRight, Printer, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, generateId } from '../lib/utils';
import { useCompanySettings } from '../lib/useCompanySettings';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import type { CourierEntry, DeliveryChallan } from '../types';
import type { PageState } from '../App';

interface CustomerOption {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const TRANSPORT_OPTIONS = [
  'DTDC', 'BlueDart', 'FedEx', 'Delhivery', 'India Post', 'Ekart', 'XpressBees',
  'Bus', 'Tempo', 'Hand Delivery', 'Train', 'Air', 'Other',
];

const STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'booked', label: 'Booked' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'returned', label: 'Returned' },
];

const STATUS_COLORS: Record<string, any> = {
  booked: 'bg-warning-50 text-warning-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered: 'bg-success-50 text-success-700',
  returned: 'bg-error-50 text-error-700',
};

interface SOOption { id: string; so_number: string; customer_name: string; }

const emptyForm = {
  courier_date: new Date().toISOString().split('T')[0],
  customer_id: '', customer_name: '', courier_company: 'DTDC',
  tracking_id: '', weight_kg: '', charges: '', status: 'booked',
  notes: '', sales_order_id: '',
  // address fields for label (recipient = ship-to)
  customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '', customer_phone: '',
  // B2B: sender = billing party (Kunal), not the company
  is_b2b: false,
  sender_name: '', sender_phone: '', sender_address: '', sender_address2: '', sender_city: '', sender_state: '', sender_pincode: '',
};

interface CourierProps {
  prefillFromDC?: DeliveryChallan;
}

export default function Courier({ prefillFromDC }: CourierProps) {
  const { company } = useCompanySettings();
  const [entries, setEntries] = useState<CourierEntry[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [soOptions, setSoOptions] = useState<SOOption[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CourierEntry | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [printEntry, setPrintEntry] = useState<(CourierEntry & typeof emptyForm) | null>(null);

  useEffect(() => { loadData(); }, []);

  // Auto-open add modal when Challan "Create Shipment" is clicked
  useEffect(() => {
    if (!prefillFromDC) return;
    setEditing(null);
    const buildAndOpen = async () => {
      const dc = prefillFromDC;
      const isB2B = !!dc.is_b2b;
      let shipTo = {
        name: dc.ship_to_name || '',
        phone: dc.ship_to_phone || '',
        address: dc.ship_to_address1 || '',
        address2: dc.ship_to_address2 || '',
        city: dc.ship_to_city || '',
        state: dc.ship_to_state || '',
        pin: dc.ship_to_pin || '',
      };
      // If B2B but DC has no ship_to fields, fetch from linked SO
      if (isB2B && !shipTo.name && dc.sales_order_id) {
        const { data: so } = await supabase
          .from('sales_orders')
          .select('ship_to_name, ship_to_phone, ship_to_address1, ship_to_address2, ship_to_city, ship_to_state, ship_to_pin')
          .eq('id', dc.sales_order_id)
          .maybeSingle();
        if (so) {
          shipTo = {
            name: so.ship_to_name || '',
            phone: so.ship_to_phone || '',
            address: so.ship_to_address1 || '',
            address2: so.ship_to_address2 || '',
            city: so.ship_to_city || '',
            state: so.ship_to_state || '',
            pin: so.ship_to_pin || '',
          };
        }
      }
      if (isB2B && shipTo.name) {
        // B2B: recipient = ship_to (Ruchi), sender = billing party (Kunal)
        setForm({
          ...emptyForm,
          courier_date: new Date().toISOString().split('T')[0],
          customer_id: '',
          customer_name: shipTo.name,
          customer_phone: shipTo.phone,
          customer_address: shipTo.address,
          customer_address2: shipTo.address2,
          customer_city: shipTo.city,
          customer_state: shipTo.state,
          customer_pincode: shipTo.pin,
          sales_order_id: dc.sales_order_id || '',
          courier_company: dc.courier_company || 'DTDC',
          tracking_id: dc.tracking_number || '',
          notes: `From Challan ${dc.challan_number}`,
          is_b2b: true,
          sender_name: dc.customer_name,
          sender_phone: dc.customer_phone || '',
          sender_address: dc.customer_address || '',
          sender_address2: dc.customer_address2 || '',
          sender_city: dc.customer_city || '',
          sender_state: dc.customer_state || '',
          sender_pincode: dc.customer_pincode || '',
        });
      } else {
        // Normal: recipient = billing customer, from = company
        setForm({
          ...emptyForm,
          courier_date: new Date().toISOString().split('T')[0],
          customer_id: dc.customer_id || '',
          customer_name: dc.customer_name || '',
          customer_phone: dc.customer_phone || '',
          customer_address: dc.customer_address || '',
          customer_address2: dc.customer_address2 || '',
          customer_city: dc.customer_city || '',
          customer_state: dc.customer_state || '',
          customer_pincode: dc.customer_pincode || '',
          sales_order_id: dc.sales_order_id || '',
          courier_company: dc.courier_company || 'DTDC',
          tracking_id: dc.tracking_number || '',
          notes: `From Challan ${dc.challan_number}`,
          is_b2b: false,
        });
      }
      setShowModal(true);
    };
    buildAndOpen();
  }, [prefillFromDC]);

  const loadData = async () => {
    const [entriesRes, customersRes, soRes] = await Promise.all([
      supabase.from('courier_entries').select('*').order('courier_date', { ascending: false }),
      supabase.from('customers').select('id, name, phone, address, city, state, pincode').eq('is_active', true).order('name'),
      supabase.from('sales_orders').select('id, so_number, customer_name').in('status', ['confirmed', 'dispatched']).order('created_at', { ascending: false }).limit(50),
    ]);
    setEntries(entriesRes.data || []);
    setCustomers((customersRes.data || []) as CustomerOption[]);
    setSoOptions(soRes.data || []);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, courier_date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = async (e: CourierEntry) => {
    setEditing(e);
    let addr = { address: '', address2: '', city: '', state: '', pincode: '', phone: '' };
    if (e.customer_id) {
      const { data: c } = await supabase.from('customers').select('address, address2, city, state, pincode, phone').eq('id', e.customer_id).maybeSingle();
      if (c) addr = { address: c.address || '', address2: (c as Record<string,string>).address2 || '', city: c.city || '', state: c.state || '', pincode: c.pincode || '', phone: c.phone || '' };
    }
    setForm({
      courier_date: e.courier_date,
      customer_id: e.customer_id || '',
      customer_name: e.customer_name,
      courier_company: e.courier_company,
      tracking_id: e.tracking_id || '',
      weight_kg: e.weight_kg ? String(e.weight_kg) : '',
      charges: String(e.charges),
      status: e.status,
      notes: e.notes || '',
      sales_order_id: e.sales_order_id || '',
      customer_address: addr.address,
      customer_address2: addr.address2,
      customer_city: addr.city,
      customer_state: addr.state,
      customer_pincode: addr.pincode,
      customer_phone: addr.phone,
      is_b2b: e.is_b2b || false,
      sender_name: e.sender_name || '',
      sender_phone: e.sender_phone || '',
      sender_address: e.sender_address || '',
      sender_address2: '',
      sender_city: e.sender_city || '',
      sender_state: e.sender_state || '',
      sender_pincode: e.sender_pincode || '',
    });
    setShowModal(true);
  };

  const handleCustomerSelect = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      customer_name: c?.name || f.customer_name,
      customer_phone: c?.phone || '',
      customer_address: c?.address || '',
      customer_address2: c?.address2 || '',
      customer_city: c?.city || '',
      customer_state: c?.state || '',
      customer_pincode: c?.pincode || '',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      courier_date: form.courier_date,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name.trim(),
      courier_company: form.courier_company,
      tracking_id: form.tracking_id.trim() || null,
      weight_kg: parseFloat(form.weight_kg) || 0,
      charges: parseFloat(form.charges) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
      sales_order_id: form.sales_order_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from('courier_entries').update(payload).eq('id', editing.id);
    } else {
      const dispatch_number = generateId('DSP');
      const { data: newEntry } = await supabase.from('courier_entries').insert({ ...payload, dispatch_number }).select().single();
      if (form.sales_order_id) {
        await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', form.sales_order_id);
      }
      // Auto-open label print after adding
      if (newEntry) {
        setPrintEntry({ ...newEntry, ...form } as CourierEntry & typeof emptyForm);
      }
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('courier_entries').update({ status }).eq('id', id);
    loadData();
  };

  const deleteEntry = async (id: string) => {
    if (!window.confirm('Delete this shipment entry?')) return;
    await supabase.from('courier_entries').delete().eq('id', id);
    loadData();
  };

  const openLabel = async (e: CourierEntry) => {
    // Fetch customer address if available
    let addr = { address: '', address2: '', city: '', state: '', pincode: '', phone: '' };
    if (e.customer_id) {
      const { data: c } = await supabase.from('customers').select('address, address2, city, state, pincode, phone').eq('id', e.customer_id).maybeSingle();
      if (c) addr = { address: c.address || '', address2: (c as Record<string,string>).address2 || '', city: c.city || '', state: c.state || '', pincode: c.pincode || '', phone: c.phone || '' };
    }
    setPrintEntry({ ...e, customer_address: addr.address || '', customer_address2: addr.address2 || '', customer_city: addr.city || '', customer_state: addr.state || '', customer_pincode: addr.pincode || '', customer_phone: addr.phone || '' } as CourierEntry & typeof emptyForm);
  };

  const printLabel = () => {
    if (!printEntry) return;
    const existingFrame = document.getElementById('label-print-frame');
    if (existingFrame) existingFrame.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'label-print-frame';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:297mm;height:210mm;border:none;';
    document.body.appendChild(iframe);
    const toAddrParts = [
      printEntry.customer_address,
      printEntry.customer_address2,
      [printEntry.customer_city, printEntry.customer_state, printEntry.customer_pincode].filter(Boolean).join(', '),
    ].filter(Boolean);
    const isB2BEntry = !!(printEntry as typeof emptyForm).is_b2b;
    const senderName = isB2BEntry ? (printEntry as typeof emptyForm).sender_name || company.name : company.name;
    const senderTagline = isB2BEntry ? '' : company.tagline;
    const senderPhone = isB2BEntry ? (printEntry as typeof emptyForm).sender_phone || '' : company.phone;
    const fromAddrParts = isB2BEntry ? [
      (printEntry as typeof emptyForm).sender_address,
      (printEntry as typeof emptyForm).sender_address2,
      [(printEntry as typeof emptyForm).sender_city, (printEntry as typeof emptyForm).sender_state, (printEntry as typeof emptyForm).sender_pincode].filter(Boolean).join(', '),
    ].filter(Boolean) : [
      company.address1,
      company.address2,
      [company.city, company.state, company.pincode].filter(Boolean).join(', '),
    ].filter(Boolean);
    const logoUrl = `${window.location.origin}/pflogo.png`;
    const logoTag = `<img src="${logoUrl}" style="height:44px;width:auto;object-fit:contain" onerror="this.style.display='none'" />`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Shipping Label</title>
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', Helvetica, sans-serif; background: white; width: 297mm; height: 210mm; display: flex; align-items: center; justify-content: center; }
  .wrap { border: 2.5px solid #222; width: 270mm; }
  .top-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-bottom: 1.5px solid #ddd; }
  .top-right { text-align: right; }
  .addrs { display: grid; grid-template-columns: 55% 45%; min-height: 90mm; }
  .ship-to { padding: 20px 22px 20px 20px; }
  .from-col { padding: 20px 20px 20px 22px; border-left: 1.5px solid #ddd; }
  .sec-lbl { font-size: 9px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-bottom: 10px; display: block; }
  .name { font-size: 18px; font-weight: 800; color: #111; margin-bottom: 6px; }
  .addr-line { font-size: 13px; color: #333; line-height: 1.7; margin: 0; }
  .phone-line { font-size: 13px; color: #333; margin-top: 6px; }
  .from-name { font-size: 15px; font-weight: 800; color: #111; margin-bottom: 4px; }
  .from-tagline { font-size: 11px; color: #888; margin-bottom: 8px; }
  .from-line { font-size: 12px; color: #444; line-height: 1.7; }
</style></head><body>
<div class="wrap">
  <div class="top-bar">
    <div>${logoTag}</div>
    <div class="top-right">${isB2BEntry ? '<span style="font-size:10px;font-weight:700;background:#dbeafe;color:#1d4ed8;padding:3px 8px;border-radius:4px;letter-spacing:1px">B2B SHIPMENT</span>' : ''}</div>
  </div>
  <div class="addrs">
    <div class="ship-to">
      <span class="sec-lbl">SHIP TO:</span>
      <div class="name">${printEntry.customer_name}</div>
      ${toAddrParts.map(l => `<p class="addr-line">${l}</p>`).join('')}
      ${printEntry.customer_phone ? `<p class="phone-line">Ph: ${printEntry.customer_phone}</p>` : ''}
    </div>
    <div class="from-col">
      <span class="sec-lbl">FROM:</span>
      <div class="from-name">${senderName}</div>
      ${senderTagline ? `<div class="from-tagline">${senderTagline}</div>` : ''}
      ${fromAddrParts.map(l => `<p class="from-line">${l}</p>`).join('')}
      ${senderPhone ? `<p class="from-line">Ph: ${senderPhone}</p>` : ''}
    </div>
  </div>
</div>
</body></html>`;
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => { iframe.contentWindow?.print(); }, 350);
  };

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      e.customer_name.toLowerCase().includes(q) ||
      (e.tracking_id || '').toLowerCase().includes(q) ||
      e.courier_company.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthlyEntries = entries.filter(e => e.courier_date >= startOfMonth);
  const monthlyCost = monthlyEntries.reduce((s, e) => s + e.charges, 0);
  const inTransit = entries.filter(e => ['booked', 'in_transit'].includes(e.status)).length;
  const delivered = entries.filter(e => e.status === 'delivered').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50">
      {/* Toolbar */}
      <div className="page-header">
        <div className="flex items-center gap-3 flex-1">
          {/* Inline KPI chips */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <Package className="w-3 h-3 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-700">{monthlyEntries.length}</span>
              <span className="text-[10px] text-neutral-400">this month</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <IndianRupee className="w-3 h-3 text-primary-500" />
              <span className="text-xs font-semibold text-primary-700">{formatCurrency(monthlyCost)}</span>
            </div>
            <div className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 ${inTransit > 0 ? 'bg-warning-50 border-warning-200' : 'bg-white border-neutral-200'}`}>
              <Truck className={`w-3 h-3 ${inTransit > 0 ? 'text-warning-600' : 'text-neutral-400'}`} />
              <span className={`text-xs font-semibold ${inTransit > 0 ? 'text-warning-700' : 'text-neutral-700'}`}>{inTransit}</span>
              <span className="text-[10px] text-neutral-400">in transit</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <CheckCircle className="w-3 h-3 text-success-600" />
              <span className="text-xs font-semibold text-success-700">{delivered}</span>
              <span className="text-[10px] text-neutral-400">delivered</span>
            </div>
          </div>
          {/* Status tab filter */}
          <div className="flex items-center gap-0.5 ml-2 border border-neutral-200 rounded-lg bg-white p-0.5">
            {STATUS_TABS.map(tab => (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === tab.key ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                }`}>
                {tab.label}
                {tab.key !== 'All' && (
                  <span className={`ml-1 text-[9px] ${statusFilter === tab.key ? 'opacity-70' : 'text-neutral-400'}`}>
                    {entries.filter(e => e.status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer, tracking..." className="input pl-7 w-44" />
          </div>
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> Add Shipment
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden px-5 py-3">
        <div className="h-full bg-white rounded-xl border border-neutral-100 shadow-card overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full">
              <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-100 z-10">
                <tr>
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Customer</th>
                  <th className="table-header text-left">Via</th>
                  <th className="table-header text-left">Tracking / LR</th>
                  <th className="table-header text-left">Linked</th>
                  <th className="table-header text-right">Wt (kg)</th>
                  <th className="table-header text-right">Charges</th>
                  <th className="table-header text-left">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="table-cell text-neutral-500">{formatDate(e.courier_date)}</td>
                    <td className="table-cell font-medium text-neutral-800">{e.customer_name}</td>
                    <td className="table-cell text-neutral-600">{e.courier_company}</td>
                    <td className="table-cell">
                      {e.tracking_id
                        ? <span className="font-mono bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded text-[10px]">{e.tracking_id}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="table-cell">
                      {e.delivery_challan_id
                        ? <span className="badge bg-blue-50 text-blue-700 gap-1"><ArrowUpRight className="w-2.5 h-2.5" />DC</span>
                        : e.sales_order_id
                        ? <span className="badge bg-orange-50 text-orange-700 gap-1"><ArrowUpRight className="w-2.5 h-2.5" />SO</span>
                        : e.invoice_id
                        ? <span className="badge bg-green-50 text-green-700 gap-1"><ArrowUpRight className="w-2.5 h-2.5" />Inv</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="table-cell text-right text-neutral-600">{e.weight_kg || '—'}</td>
                    <td className="table-cell text-right font-semibold text-primary-700">{formatCurrency(e.charges)}</td>
                    <td className="table-cell">
                      <span className={`badge capitalize ${STATUS_COLORS[e.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {e.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openLabel(e)} title="Print Label" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><Printer className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(e)} title="Edit" className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteEntry(e.id)} title="Delete" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={Truck} title="No shipments found" description="Add your first shipment entry." />}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? 'Edit Shipment' : 'Add Shipment'}
        subtitle={prefillFromDC && !editing ? `Pre-filled from Challan ${prefillFromDC.challan_number}` : undefined}
        size="lg"
        footer={<>
          <button onClick={() => { setShowModal(false); setEditing(null); }} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : editing ? 'Update' : 'Add & Print Label'}
          </button>
        </>}>
        <div className="space-y-3">
          {form.is_b2b && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">B2B</span>
              <p className="text-xs text-blue-700 font-medium">
                Shipping from <strong>{form.sender_name}</strong> → to <strong>{form.customer_name}</strong>
              </p>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.courier_date} onChange={e => setForm(f => ({ ...f, courier_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Via (Transport) *</label>
              <select value={form.courier_company} onChange={e => setForm(f => ({ ...f, courier_company: e.target.value }))} className="input">
                {TRANSPORT_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tracking / LR Number</label>
              <input value={form.tracking_id} onChange={e => setForm(f => ({ ...f, tracking_id: e.target.value }))} className="input" placeholder="AWB / LR no." />
            </div>
          </div>
          <div className="border border-neutral-100 rounded-lg p-3 space-y-2">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">{form.is_b2b ? 'SHIP TO (Recipient)' : 'Customer / Ship To'}</p>
            <div className="grid grid-cols-3 gap-3">
              {!form.is_b2b && (
                <div>
                  <label className="label">Customer</label>
                  <select value={form.customer_id} onChange={e => handleCustomerSelect(e.target.value)} className="input">
                    <option value="">— Select —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Name *</label>
                <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Name" />
              </div>
              <div>
                <label className="label">Phone</label>
                <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input" placeholder="+91..." />
              </div>
              <div className="col-span-2">
                <label className="label">Address Line 1</label>
                <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input" placeholder="Street / House No." />
              </div>
              <div className="col-span-2">
                <label className="label">Address Line 2</label>
                <input value={form.customer_address2} onChange={e => setForm(f => ({ ...f, customer_address2: e.target.value }))} className="input" placeholder="Area / Landmark" />
              </div>
              <div>
                <label className="label">City / PIN</label>
                <div className="flex gap-1">
                  <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input" placeholder="City" />
                  <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input w-20" placeholder="PIN" />
                </div>
              </div>
            </div>
          </div>
          {form.is_b2b && (
            <div className="border border-blue-100 rounded-lg p-3 space-y-2 bg-blue-50/30">
              <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">FROM (Sender — {form.sender_name})</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Name</label>
                  <input value={form.sender_name} onChange={e => setForm(f => ({ ...f, sender_name: e.target.value }))} className="input" />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input value={form.sender_phone} onChange={e => setForm(f => ({ ...f, sender_phone: e.target.value }))} className="input" placeholder="+91..." />
                </div>
                <div className="col-span-2">
                  <label className="label">Address</label>
                  <input value={form.sender_address} onChange={e => setForm(f => ({ ...f, sender_address: e.target.value }))} className="input" placeholder="Street / Area" />
                </div>
                <div>
                  <label className="label">City / PIN</label>
                  <div className="flex gap-1">
                    <input value={form.sender_city} onChange={e => setForm(f => ({ ...f, sender_city: e.target.value }))} className="input" placeholder="City" />
                    <input value={form.sender_pincode} onChange={e => setForm(f => ({ ...f, sender_pincode: e.target.value }))} className="input w-20" placeholder="PIN" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Weight (kg)</label>
              <input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} className="input" placeholder="0.5" />
            </div>
            <div>
              <label className="label">Charges (₹)</label>
              <input type="number" value={form.charges} onChange={e => setForm(f => ({ ...f, charges: e.target.value }))} className="input" placeholder="0" />
            </div>
            {!form.is_b2b && (
              <div>
                <label className="label">Link to Sales Order</label>
                <select value={form.sales_order_id} onChange={e => setForm(f => ({ ...f, sales_order_id: e.target.value }))} className="input">
                  <option value="">— None —</option>
                  {soOptions.map(so => <option key={so.id} value={so.id}>{so.so_number} — {so.customer_name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input">
                {['booked', 'in_transit', 'delivered', 'returned'].map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Label Print Preview Modal */}
      {printEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPrintEntry(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-800">Shipping Label Preview</p>
              <div className="flex gap-2">
                <button onClick={printLabel} className="btn-primary"><Printer className="w-3.5 h-3.5" /> Print A4 Label</button>
                <button onClick={() => setPrintEntry(null)} className="btn-secondary">Close</button>
              </div>
            </div>
            <div className="p-5">
              <div className="border-2 border-neutral-700 rounded-lg overflow-hidden">
                {/* Top bar: logo */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
                  <img src="/pflogo.png" alt="Logo" className="h-9 w-auto object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                  <span />
                </div>
                {/* Address columns */}
                <div className="grid grid-cols-2 divide-x divide-neutral-200 min-h-[160px]">
                  {/* SHIP TO — left, larger */}
                  <div className="p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3">SHIP TO:</p>
                    <p className="text-base font-black text-neutral-900 mb-1">{printEntry.customer_name}</p>
                    {printEntry.customer_address && <p className="text-sm text-neutral-600">{printEntry.customer_address}</p>}
                    {printEntry.customer_address2 && <p className="text-sm text-neutral-600">{printEntry.customer_address2}</p>}
                    {(printEntry.customer_city || printEntry.customer_pincode) && (
                      <p className="text-sm text-neutral-600">{[printEntry.customer_city, printEntry.customer_state, printEntry.customer_pincode].filter(Boolean).join(', ')}</p>
                    )}
                    {printEntry.customer_phone && <p className="text-sm text-neutral-600 mt-1">Ph: {printEntry.customer_phone}</p>}
                  </div>
                  {/* FROM — right: use sender if B2B, company otherwise */}
                  <div className="p-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-neutral-400 mb-3">FROM:</p>
                    {(printEntry as typeof emptyForm).is_b2b ? (
                      <>
                        <p className="text-sm font-bold text-neutral-900">{(printEntry as typeof emptyForm).sender_name}</p>
                        {(printEntry as typeof emptyForm).sender_phone && <p className="text-xs text-neutral-600">Ph: {(printEntry as typeof emptyForm).sender_phone}</p>}
                        {(printEntry as typeof emptyForm).sender_address && <p className="text-xs text-neutral-600">{(printEntry as typeof emptyForm).sender_address}</p>}
                        {(printEntry as typeof emptyForm).sender_city && <p className="text-xs text-neutral-600">{[(printEntry as typeof emptyForm).sender_city, (printEntry as typeof emptyForm).sender_state, (printEntry as typeof emptyForm).sender_pincode].filter(Boolean).join(', ')}</p>}
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-bold text-neutral-900">{company.name}</p>
                        {company.tagline && <p className="text-[11px] text-neutral-400 mb-1">{company.tagline}</p>}
                        {company.address1 && <p className="text-xs text-neutral-600">{company.address1}</p>}
                        {company.address2 && <p className="text-xs text-neutral-600">{company.address2}</p>}
                        {(company.city || company.pincode) && <p className="text-xs text-neutral-600">{[company.city, company.state, company.pincode].filter(Boolean).join(', ')}</p>}
                        {company.phone && <p className="text-xs text-neutral-600">Ph: {company.phone}</p>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
