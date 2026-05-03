import { useState, useEffect } from 'react';
import { Globe, ShoppingCart, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type OnOff = 'on' | 'off';

export default function WebsiteSettingsTab() {
  const [shoppingMode, setShoppingMode] = useState<OnOff>('off');
  const [websiteOpen, setWebsiteOpen] = useState<OnOff>('on');
  const [loading, setLoading] = useState(true);
  const [savedKey, setSavedKey] = useState<string>('');
  const [error, setError] = useState<string>('');

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['shopping_mode', 'website_open']);
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const sm = (data || []).find(d => d.key === 'shopping_mode')?.value;
    const wo = (data || []).find(d => d.key === 'website_open')?.value;
    if (sm === 'on' || sm === 'off') setShoppingMode(sm);
    if (wo === 'on' || wo === 'off') setWebsiteOpen(wo);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateSetting = async (key: string, next: OnOff) => {
    setError('');
    const prevShopping = shoppingMode;
    const prevWebsite = websiteOpen;
    if (key === 'shopping_mode') setShoppingMode(next);
    if (key === 'website_open') setWebsiteOpen(next);
    const { error: err } = await supabase
      .from('settings')
      .upsert({ key, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (err) {
      setError(err.message);
      if (key === 'shopping_mode') setShoppingMode(prevShopping);
      if (key === 'website_open') setWebsiteOpen(prevWebsite);
      return;
    }
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
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="w-4 h-4 text-primary-600" />
          <p className="text-sm font-semibold text-neutral-800">Shopping Mode</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-neutral-600">
              Controls whether customers can place orders on the website.
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              When <strong>On</strong>, the cart and checkout are enabled. When <strong>Off</strong>,
              the website shows products as catalog-only (no Add to Cart, no checkout).
            </p>
          </div>
          <ToggleRow
            value={shoppingMode}
            onChange={(v) => updateSetting('shopping_mode', v)}
            saved={savedKey === 'shopping_mode'}
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-primary-600" />
          <p className="text-sm font-semibold text-neutral-800">Website Status</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs text-neutral-600">
              Master switch for the customer-facing website.
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              When <strong>Off</strong>, visitors see a maintenance / "Back soon" page
              instead of the normal site. Use this for planned downtime.
            </p>
          </div>
          <ToggleRow
            value={websiteOpen}
            onChange={(v) => updateSetting('website_open', v)}
            saved={savedKey === 'website_open'}
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ value, onChange, saved }: { value: OnOff; onChange: (v: OnOff) => void; saved: boolean }) {
  const isOn = value === 'on';
  return (
    <div className="flex items-center gap-3 shrink-0">
      {saved && (
        <span className="flex items-center gap-1 text-[11px] text-success-600 font-medium">
          <CheckCircle className="w-3 h-3" /> Saved
        </span>
      )}
      <span className={`text-xs font-medium ${isOn ? 'text-neutral-400' : 'text-neutral-700'}`}>Off</span>
      <button
        type="button"
        onClick={() => onChange(isOn ? 'off' : 'on')}
        className={`relative w-11 h-6 rounded-full transition-colors ${isOn ? 'bg-primary-600' : 'bg-neutral-300'}`}
        aria-pressed={isOn}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
      <span className={`text-xs font-medium ${isOn ? 'text-primary-700' : 'text-neutral-400'}`}>On</span>
    </div>
  );
}
