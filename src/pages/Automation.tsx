import { useState, useEffect } from 'react';
import { Plus, Zap, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import ActionMenu, { actionEdit, actionDelete } from '../components/ui/ActionMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { AutomationRule } from '../types';

const TRIGGER_EVENTS = [
  'invoice_created', 'payment_received', 'payment_overdue', 'stock_low', 'appointment_scheduled'
];
const ACTION_TYPES = [
  'send_whatsapp', 'send_email', 'create_reminder', 'update_status'
];

const TEMPLATE_VARS: Record<string, string[]> = {
  invoice_created:       ['{{customer_name}}', '{{customer_phone}}', '{{invoice_number}}', '{{amount}}'],
  payment_received:      ['{{customer_name}}', '{{customer_phone}}', '{{amount}}', '{{invoice_number}}'],
  payment_overdue:       ['{{customer_name}}', '{{customer_phone}}', '{{amount}}', '{{invoice_number}}'],
  stock_low:             ['{{product_name}}', '{{stock_quantity}}'],
  appointment_scheduled: ['{{customer_name}}', '{{customer_phone}}', '{{appointment_type}}', '{{appointment_time}}', '{{entity_name}}'],
};

const EMPTY_CONFIG: Record<string, string> = {};

function formatTrigger(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ConfigFields({
  actionType, config, onChange,
}: {
  actionType: string;
  config: Record<string, string>;
  onChange: (cfg: Record<string, string>) => void;
}) {
  const set = (key: string, value: string) => onChange({ ...config, [key]: value });

  if (actionType === 'send_whatsapp') {
    return (
      <div className="space-y-2 mt-2">
        <div>
          <label className="label">Phone Number</label>
          <input
            value={config.phone_number || ''}
            onChange={e => set('phone_number', e.target.value)}
            className="input"
            placeholder="91XXXXXXXXXX or {{customer_phone}}"
          />
          <p className="text-[10px] text-neutral-400 mt-0.5">Use {'{{customer_phone}}'} to auto-fill from the customer record.</p>
        </div>
        <div>
          <label className="label">Message Template</label>
          <textarea
            value={config.message_template || ''}
            onChange={e => set('message_template', e.target.value)}
            className="input resize-none h-20"
            placeholder={`Hi {{customer_name}}, your invoice {{invoice_number}} has been created. Amount: ₹{{amount}}. Thank you!`}
          />
        </div>
      </div>
    );
  }

  if (actionType === 'send_email') {
    return (
      <div className="space-y-2 mt-2">
        <div>
          <label className="label">Email Address</label>
          <input
            value={config.email_address || ''}
            onChange={e => set('email_address', e.target.value)}
            className="input"
            placeholder="customer@email.com or {{customer_email}}"
          />
        </div>
        <div>
          <label className="label">Subject</label>
          <input
            value={config.subject_template || ''}
            onChange={e => set('subject_template', e.target.value)}
            className="input"
            placeholder="Invoice {{invoice_number}} from Prachi Fulfagar"
          />
        </div>
        <div>
          <label className="label">Body</label>
          <textarea
            value={config.body_template || ''}
            onChange={e => set('body_template', e.target.value)}
            className="input resize-none h-20"
            placeholder={`Hi {{customer_name}},\n\nPlease find your invoice {{invoice_number}} attached.\n\nRegards,\nPrachi Fulfagar`}
          />
        </div>
      </div>
    );
  }

  if (actionType === 'create_reminder') {
    return (
      <div className="space-y-2 mt-2">
        <div>
          <label className="label">Reminder Message</label>
          <textarea
            value={config.message_template || ''}
            onChange={e => set('message_template', e.target.value)}
            className="input resize-none h-16"
            placeholder="Follow up with {{customer_name}} about {{entity_name}}"
          />
        </div>
      </div>
    );
  }

  if (actionType === 'update_status') {
    return (
      <div className="space-y-2 mt-2">
        <div>
          <label className="label">Target Status</label>
          <input
            value={config.target_status || ''}
            onChange={e => set('target_status', e.target.value)}
            className="input"
            placeholder="e.g., overdue, closed, confirmed"
          />
        </div>
      </div>
    );
  }

  return null;
}

export default function Automation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [confirmRule, setConfirmRule] = useState<AutomationRule | null>(null);
  const [form, setForm] = useState({
    name: '',
    trigger_event: 'invoice_created',
    action_type: 'send_whatsapp',
    is_active: true,
    action_config: EMPTY_CONFIG,
  });

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    const { data } = await supabase.from('automation_rules').select('*').order('created_at', { ascending: false });
    setRules(data || []);
  };

  const openAdd = () => {
    setEditingRule(null);
    setForm({ name: '', trigger_event: 'invoice_created', action_type: 'send_whatsapp', is_active: true, action_config: EMPTY_CONFIG });
    setShowModal(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      trigger_event: rule.trigger_event,
      action_type: rule.action_type,
      is_active: rule.is_active,
      action_config: (rule.action_config as Record<string, string>) || EMPTY_CONFIG,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name,
      trigger_event: form.trigger_event,
      action_type: form.action_type,
      action_config: form.action_config,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    if (editingRule) {
      await supabase.from('automation_rules').update(payload).eq('id', editingRule.id);
    } else {
      await supabase.from('automation_rules').insert(payload);
    }
    setShowModal(false);
    loadRules();
  };

  const handleDelete = async (rule: AutomationRule) => {
    await supabase.from('automation_rules').delete().eq('id', rule.id);
    loadRules();
  };

  const toggleRule = async (rule: AutomationRule) => {
    await supabase.from('automation_rules').update({ is_active: !rule.is_active, updated_at: new Date().toISOString() }).eq('id', rule.id);
    loadRules();
  };

  const templateVars = TEMPLATE_VARS[form.trigger_event] || [];

  const actionSummary = (rule: AutomationRule) => {
    const cfg = rule.action_config || {};
    if (rule.action_type === 'send_whatsapp') return `WhatsApp → ${cfg.phone_number || '{{customer_phone}}'}`;
    if (rule.action_type === 'send_email') return `Email → ${cfg.email_address || '{{customer_email}}'}`;
    if (rule.action_type === 'create_reminder') return 'Create in-app reminder';
    if (rule.action_type === 'update_status') return `Set status: ${cfg.target_status || '—'}`;
    return rule.action_type;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Automation</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Rules fire automatically when business events occur</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> New Rule
        </button>
      </div>

      <div className="p-6 space-y-5">
        <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 flex items-start gap-3">
          <Zap className="w-5 h-5 text-primary-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary-800">Live Automation Engine</p>
            <p className="text-xs text-primary-600 mt-0.5">
              Rules execute automatically when events happen — invoice created, payment received, appointment scheduled, stock goes low.
              WhatsApp rules open a pre-filled chat link; reminders appear in your notification bell.
            </p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-neutral-800 mb-3">Your Rules</p>
          {rules.length === 0 ? (
            <div className="card text-center py-10">
              <Zap className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm text-neutral-500">No automation rules yet</p>
              <p className="text-xs text-neutral-400 mt-0.5">Click "New Rule" to create your first automation</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => (
                <div key={rule.id} className="card flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${rule.is_active ? 'bg-primary-100' : 'bg-neutral-100'}`}>
                    <Zap className={`w-4 h-4 ${rule.is_active ? 'text-primary-600' : 'text-neutral-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">{rule.name}</p>
                    <p className="text-xs text-neutral-500">
                      When <span className="text-primary-600 font-medium">{formatTrigger(rule.trigger_event)}</span>
                      {' → '}
                      <span className="text-blue-600 font-medium">{actionSummary(rule)}</span>
                    </p>
                  </div>
                  <button onClick={() => toggleRule(rule)} className="text-neutral-400 hover:text-primary-600 transition-colors shrink-0">
                    {rule.is_active
                      ? <ToggleRight className="w-6 h-6 text-primary-600" />
                      : <ToggleLeft className="w-6 h-6 text-neutral-400" />}
                  </button>
                  <ActionMenu items={[
                    actionEdit(() => openEdit(rule)),
                    actionDelete(() => setConfirmRule(rule)),
                  ]} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingRule ? 'Edit Automation Rule' : 'Create Automation Rule'}
        size="md"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">{editingRule ? 'Update Rule' : 'Create Rule'}</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Rule Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g., Invoice WhatsApp Alert" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">When (Trigger)</label>
              <select
                value={form.trigger_event}
                onChange={e => setForm(f => ({ ...f, trigger_event: e.target.value, action_config: EMPTY_CONFIG }))}
                className="input"
              >
                {TRIGGER_EVENTS.map(t => <option key={t} value={t}>{formatTrigger(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Then (Action)</label>
              <select
                value={form.action_type}
                onChange={e => setForm(f => ({ ...f, action_type: e.target.value, action_config: EMPTY_CONFIG }))}
                className="input"
              >
                {ACTION_TYPES.map(a => <option key={a} value={a}>{formatTrigger(a)}</option>)}
              </select>
            </div>
          </div>

          {/* Dynamic action config */}
          <ConfigFields
            actionType={form.action_type}
            config={form.action_config}
            onChange={cfg => setForm(f => ({ ...f, action_config: cfg }))}
          />

          {/* Template variable hints */}
          {templateVars.length > 0 && (
            <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-blue-700 mb-0.5">Available variables for this trigger:</p>
                <p className="text-[10px] text-blue-600 font-mono">{templateVars.join('  ')}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="active"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 accent-primary-600"
            />
            <label htmlFor="active" className="text-sm text-neutral-700">Enable rule immediately</label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmRule}
        onClose={() => setConfirmRule(null)}
        onConfirm={() => { if (confirmRule) handleDelete(confirmRule); setConfirmRule(null); }}
        title="Delete Automation Rule"
        message={`Delete rule "${confirmRule?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
