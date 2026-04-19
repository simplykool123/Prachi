import { useState, useEffect } from 'react';
import { Save, Building2, Phone, Mail, MapPin, CreditCard, Globe, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCompanySettings, DEFAULT_COMPANY } from '../lib/useCompanySettings';
import type { CompanySettings } from '../types';

export default function CompanySettingsPage() {
  const { company: loaded, loading } = useCompanySettings();
  const [form, setForm] = useState<CompanySettings>(DEFAULT_COMPANY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading) setForm(loaded);
  }, [loaded, loading]);

  const update = (field: keyof CompanySettings, value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const { id, updated_at, ...fields } = form;
    await supabase
      .from('company_settings')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', 1);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Company Details</h1>
          <p className="text-xs text-neutral-500 mt-0.5">These details appear on all invoices, challans, and printed documents</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
          {saved ? (
            <><CheckCircle className="w-4 h-4" /> Saved</>
          ) : (
            <><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}</>
          )}
        </button>
      </div>

      <div className="p-6 max-w-3xl space-y-5">
        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-neutral-800">Business Identity</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Business Name *</label>
              <input value={form.name} onChange={e => update('name', e.target.value)} className="input" placeholder="Prachi Fulgagar" />
            </div>
            <div>
              <label className="label">Tagline / Designation</label>
              <input value={form.tagline} onChange={e => update('tagline', e.target.value)} className="input" placeholder="Vastu Expert | Palmist | Astrologer" />
            </div>
            <div>
              <label className="label">GSTIN</label>
              <input value={form.gstin} onChange={e => update('gstin', e.target.value)} className="input" placeholder="22AAAAA0000A1Z5" />
            </div>
            <div>
              <label className="label">PAN</label>
              <input value={form.pan} onChange={e => update('pan', e.target.value)} className="input" placeholder="AAAAA0000A" />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-neutral-800">Address</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="label">Address Line 1</label>
              <input value={form.address1} onChange={e => update('address1', e.target.value)} className="input" placeholder="House / Flat No., Street" />
            </div>
            <div>
              <label className="label">Address Line 2</label>
              <input value={form.address2} onChange={e => update('address2', e.target.value)} className="input" placeholder="Area / Colony / Landmark" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">City</label>
              <input value={form.city} onChange={e => update('city', e.target.value)} className="input" placeholder="Pune" />
            </div>
            <div>
              <label className="label">State</label>
              <input value={form.state} onChange={e => update('state', e.target.value)} className="input" placeholder="Maharashtra" />
            </div>
            <div>
              <label className="label">PIN Code</label>
              <input value={form.pincode} onChange={e => update('pincode', e.target.value)} className="input" placeholder="411001" maxLength={6} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Phone className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-neutral-800">Contact</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Primary Phone</label>
              <input value={form.phone} onChange={e => update('phone', e.target.value)} className="input" placeholder="+91 98765 43210" />
            </div>
            <div>
              <label className="label">Alternate Phone</label>
              <input value={form.alt_phone} onChange={e => update('alt_phone', e.target.value)} className="input" placeholder="+91 98765 00000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)} className="input" placeholder="contact@prachifulgagar.com" />
            </div>
            <div>
              <label className="label">Website</label>
              <input value={form.website} onChange={e => update('website', e.target.value)} className="input" placeholder="www.prachifulgagar.com" />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-neutral-800">Bank & Payment Details</p>
          </div>
          <p className="text-xs text-neutral-500 -mt-2">These appear on the "Bank Details" section of every invoice</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Bank Name</label>
              <input value={form.bank_name} onChange={e => update('bank_name', e.target.value)} className="input" placeholder="HDFC Bank" />
            </div>
            <div>
              <label className="label">Account Holder Name</label>
              <input value={form.account_holder} onChange={e => update('account_holder', e.target.value)} className="input" placeholder="Prachi Fulgagar" />
            </div>
            <div>
              <label className="label">Account Number</label>
              <input value={form.account_number} onChange={e => update('account_number', e.target.value)} className="input" placeholder="XXXX XXXX XXXX" />
            </div>
            <div>
              <label className="label">IFSC Code</label>
              <input value={form.ifsc_code} onChange={e => update('ifsc_code', e.target.value)} className="input" placeholder="HDFC0001234" />
            </div>
            <div>
              <label className="label">UPI ID</label>
              <input value={form.upi_id} onChange={e => update('upi_id', e.target.value)} className="input" placeholder="prachi@upi" />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-primary-600" />
            <p className="text-sm font-semibold text-neutral-800">Invoice Footer</p>
          </div>
          <div>
            <label className="label">Footer Note</label>
            <textarea
              value={form.footer_note}
              onChange={e => update('footer_note', e.target.value)}
              className="input resize-none h-16"
              placeholder="Thank you message shown at the bottom of every invoice..."
            />
          </div>
        </div>

        <div className="flex justify-end pb-6">
          <button onClick={handleSave} disabled={saving} className="btn-primary gap-2">
            {saved ? <><CheckCircle className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save All Changes'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
