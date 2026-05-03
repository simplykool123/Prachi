import { useEffect, useState } from 'react';
import { Truck, IndianRupee, Weight, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatError } from '../../lib/utils';

type Key = 'free_shipping_threshold_inr' | 'default_weight_grams_fallback' | 'heavy_item_threshold_grams';

interface FieldDef {
  key: Key;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  suffix: string;
  min: number;
  step: number;
}

const FIELDS: FieldDef[] = [
  {
    key: 'free_shipping_threshold_inr',
    label: 'Free Shipping Threshold',
    hint: 'Cart subtotals at or above this amount ship for free. Set to 0 to disable free shipping.',
    icon: IndianRupee, suffix: '₹', min: 0, step: 50,
  },
  {
    key: 'default_weight_grams_fallback',
    label: 'Default Weight Fallback',
    hint: 'Weight assumed for any product missing a `weight_grams` value. Lower this once your bulk-weight backfill is done.',
    icon: Weight, suffix: 'g', min: 1, step: 50,
  },
  {
    key: 'heavy_item_threshold_grams',
    label: 'Heavy Item Threshold',
    hint: 'Carts heavier than this skip online payment and become a "Request a Shipping Quote" order. Set high (e.g. 99999) to disable.',
    icon: Truck, suffix: 'g', min: 100, step: 500,
  },
];

export default function ShippingSettingsTab() {
  const [values, setValues] = useState<Record<Key, string>>({
    free_shipping_threshold_inr: '',
    default_weight_grams_fallback: '',
    heavy_item_threshold_grams: '',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', FIELDS.map(f => f.key));
    if (err) { setError(formatError(err)); setLoading(false); return; }
    const next = { ...values };
    for (const row of data || []) {
      // Settings values are stored as JSONB; in practice the website agent
      // wrote plain numbers, so handle both number-shaped and string-shaped.
      const v = row.value;
      next[row.key as Key] = typeof v === 'number' ? String(v)
                          : typeof v === 'string' ? v
                          : String(v ?? '');
    }
    setValues(next);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async (key: Key) => {
    setError('');
    const raw = values[key];
    const num = Number(raw);
    if (raw === '' || Number.isNaN(num) || num < 0) {
      setError('Please enter a valid non-negative number.');
      return;
    }
    const { error: err } = await supabase
      .from('settings')
      .upsert({ key, value: num, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (err) { setError(formatError(err)); return; }
    setSavedKey(key);
    setTimeout(() => setSavedKey(s => (s === key ? '' : s)), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {error && (
        <div className="flex items-start gap-2 bg-error-50 border border-error-200 text-error-700 text-xs rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {FIELDS.map(f => {
        const Icon = f.icon;
        return (
          <div key={f.key} className="card space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-primary-600" />
              <p className="text-sm font-semibold text-neutral-800">{f.label}</p>
              {savedKey === f.key && (
                <span className="flex items-center gap-1 text-[11px] text-success-600 font-medium ml-auto">
                  <CheckCircle className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500">{f.hint}</p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="number"
                  min={f.min}
                  step={f.step}
                  value={values[f.key]}
                  onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                  className="input text-xs pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-medium">
                  {f.suffix}
                </span>
              </div>
              <button onClick={() => save(f.key)} className="btn-primary text-xs">Save</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
