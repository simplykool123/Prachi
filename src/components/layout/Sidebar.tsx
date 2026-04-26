import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, BarChart2,
  Truck, BookOpen, Receipt, Zap, LogOut, Moon, RotateCcw,
  CalendarDays, CircleUser as UserCircle2, Settings,
  CreditCard, PackageCheck, Pencil, X, CheckCircle, Eye, EyeOff, ArrowLeftRight,
  Bell, ExternalLink, Trash2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { ActivePage, Reminder } from '../../types';

interface SidebarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { profile, isAdmin, canAccessFinance, canAccessSales, canAccessInventory, canAccessExpenses, signOut } = useAuth();
  const [unpaidInvoices, setUnpaidInvoices] = useState(0);
  const [unreadReminders, setUnreadReminders] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminders, setShowReminders] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePwd, setProfilePwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    const loadBadges = async () => {
      const [invoiceRes, reminderRes] = await Promise.all([
        supabase.from('invoices').select('id', { count: 'exact', head: true }).neq('status', 'paid').neq('status', 'cancelled'),
        supabase.from('reminders').select('id', { count: 'exact', head: true }).eq('is_read', false),
      ]);
      setUnpaidInvoices(invoiceRes.count || 0);
      // Gracefully handle table-not-found (migration not yet applied to live DB)
      if (!reminderRes.error) {
        setUnreadReminders(reminderRes.count || 0);
      }
    };
    loadBadges();
    // Poll every 60s
    const interval = setInterval(loadBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const openReminders = async () => {
    const { data } = await supabase
      .from('reminders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);
    setReminders((data || []) as Reminder[]);
    setShowReminders(true);
  };

  const markRead = async (id: string) => {
    await supabase.from('reminders').update({ is_read: true }).eq('id', id);
    setReminders(r => r.map(x => x.id === id ? { ...x, is_read: true } : x));
    setUnreadReminders(n => Math.max(0, n - 1));
  };

  const markAllRead = async () => {
    await supabase.from('reminders').update({ is_read: true }).eq('is_read', false);
    setReminders(r => r.map(x => ({ ...x, is_read: true })));
    setUnreadReminders(0);
  };

  const deleteReminder = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id);
    setReminders(r => r.filter(x => x.id !== id));
  };

  const formatReminderTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const openProfile = () => {
    setProfileName(profile?.display_name || '');
    setProfilePwd('');
    setSaveMsg('');
    setSaveErr('');
    setShowPwd(false);
    setShowProfile(true);
  };

  const saveProfile = async () => {
    setSaving(true);
    setSaveMsg('');
    setSaveErr('');
    try {
      if (profileName.trim() && profileName.trim() !== profile?.display_name) {
        await supabase.from('user_profiles').update({ display_name: profileName.trim() }).eq('id', profile!.id);
      }
      if (profilePwd) {
        if (profilePwd.length < 6) {
          setSaveErr('Password must be at least 6 characters.');
          setSaving(false);
          return;
        }
        const { error } = await supabase.auth.updateUser({ password: profilePwd });
        if (error) {
          setSaveErr(error.message || 'Failed to update password.');
          setSaving(false);
          return;
        }
      }
      setSaveMsg('Saved!');
      setProfilePwd('');
      setTimeout(() => { setSaveMsg(''); setShowProfile(false); }, 1500);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Unexpected error.');
    }
    setSaving(false);
  };

  const roleLabel = () => {
    const r = profile?.role;
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'staff') return 'Staff';
    return 'User';
  };

  const NavItem = ({
    id, label, icon: Icon, badge,
  }: {
    id: ActivePage; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number;
  }) => {
    const isActive = activePage === id;
    return (
      <button
        onClick={() => onNavigate(id)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 text-left group ${isActive ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:bg-orange-50 hover:text-primary-700'}`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-primary-600'}`} />
        <span className="truncate leading-none flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-none ${isActive ? 'bg-white/30 text-white' : 'bg-error-600 text-white'}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <p className="px-2.5 pt-2 pb-0.5 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{label}</p>
  );

  return (
    <>
      <aside className="w-48 bg-white border-r border-neutral-200 flex flex-col h-screen sticky top-0 shrink-0">
        <div className="px-3 py-3 border-b border-neutral-100">
          <div className="flex items-center gap-2.5">
            <img src="/pflogo.png" alt="Prachi Fulfagar" className="h-9 w-9 object-contain shrink-0" />
            <div>
              <p className="text-xs font-bold text-neutral-800 leading-tight">Prachi Fulfagar</p>
              <div className="flex items-center gap-1 mt-0.5">
                <Moon className="w-2.5 h-2.5 text-primary-500 shrink-0" />
                <p className="text-[9px] text-neutral-400 font-medium tracking-wide">Vastu · Palmist · Astrologer</p>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-1.5 overflow-y-auto space-y-0">
          <div className="space-y-0.5">
            <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
          </div>

          <SectionLabel label="CRM" />
          <div className="space-y-0.5">
            <NavItem id="crm" label="Clients" icon={UserCircle2} />
            <NavItem id="calendar" label="Schedule" icon={CalendarDays} />
          </div>

          {canAccessSales && (
            <>
              <SectionLabel label="Sales" />
              <div className="space-y-0.5">
                <NavItem id="sales-orders" label="Sales Orders" icon={FileText} />
                <NavItem id="challans" label="Delivery Challans" icon={Truck} />
                <NavItem id="invoices" label="Invoices" icon={Receipt} badge={unpaidInvoices} />
                <NavItem id="sales-returns" label="Returns" icon={RotateCcw} />
                <NavItem id="courier" label="Shipments" icon={PackageCheck} />
                {/* Deprecated - replaced by B2B Sales Order flow */}
              </div>
            </>
          )}

          {canAccessInventory && (
            <>
              <SectionLabel label="Inventory" />
              <div className="space-y-0.5">
                {isAdmin && <NavItem id="purchase" label="Purchases" icon={ShoppingCart} />}
                <NavItem id="inventory" label="Products" icon={Package} />
                <NavItem id="godown-stock" label="Stock" icon={BarChart2} />
                <NavItem id="godown-transfer" label="Transfers" icon={ArrowLeftRight} />
              </div>
            </>
          )}

          {canAccessExpenses && (
            <>
              <SectionLabel label="Finance" />
              <div className="space-y-0.5">
                {canAccessFinance && <NavItem id="ledger" label="Ledger" icon={BookOpen} />}
                <NavItem id="expenses" label="Expenses" icon={CreditCard} />
                {canAccessFinance && <NavItem id="journal" label="Journal" icon={FileText} />}
              </div>
            </>
          )}

          <SectionLabel label="Analytics" />
          <div className="space-y-0.5">
            <NavItem id="reports" label="Reports" icon={BarChart2} />
            {isAdmin && <NavItem id="automation" label="Automation" icon={Zap} />}
          </div>

          {isAdmin && (
            <>
              <SectionLabel label="Admin" />
              <div className="space-y-0.5">
                <NavItem id="settings" label="Settings" icon={Settings} />
              </div>
            </>
          )}
        </nav>

        <div className="p-2 border-t border-neutral-100">
          {/* Notification bell */}
          <button
            onClick={openReminders}
            className="w-full flex items-center gap-2 mb-1 px-2.5 py-1.5 rounded-lg hover:bg-neutral-50 transition-colors text-left"
          >
            <div className="relative">
              <Bell className="w-3.5 h-3.5 text-neutral-400" />
              {unreadReminders > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 bg-error-600 text-white text-[8px] font-bold rounded-full flex items-center justify-center leading-none">
                  {unreadReminders > 9 ? '9+' : unreadReminders}
                </span>
              )}
            </div>
            <span className="text-[10px] text-neutral-500">Notifications</span>
          </button>
          <button
            onClick={openProfile}
            className="w-full flex items-center gap-2 mb-1 px-1 py-1 rounded-lg hover:bg-neutral-50 transition-colors group text-left"
            title="Edit profile"
          >
            <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-primary-700">
                {(profile?.display_name || profile?.email || 'U')[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-neutral-800 truncate leading-tight">{profile?.display_name || profile?.email || 'User'}</p>
              <p className={`text-[9px] leading-tight ${isAdmin ? 'text-primary-600' : 'text-neutral-400'}`}>
                {roleLabel()}
              </p>
            </div>
            <Pencil className="w-3 h-3 text-neutral-300 group-hover:text-neutral-500 shrink-0" />
          </button>
          <button onClick={signOut}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-neutral-500 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {showReminders && (
        <div className="fixed inset-0 z-[100] flex items-start justify-start">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowReminders(false)} />
          <div className="relative ml-48 mt-0 bg-white border-r border-neutral-200 shadow-2xl w-80 h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Notifications</h2>
                {unreadReminders > 0 && (
                  <p className="text-[10px] text-neutral-400">{unreadReminders} unread</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadReminders > 0 && (
                  <button onClick={markAllRead} className="text-[10px] text-primary-600 hover:underline">Mark all read</button>
                )}
                <button onClick={() => setShowReminders(false)} className="p-1 rounded hover:bg-neutral-100">
                  <X className="w-4 h-4 text-neutral-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {reminders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                  <Bell className="w-8 h-8 mb-2" />
                  <p className="text-xs text-neutral-400">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-50">
                  {reminders.map(r => (
                    <div key={r.id} className={`px-4 py-3 ${r.is_read ? 'bg-white' : 'bg-primary-50'}`}>
                      <div className="flex items-start gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${r.is_read ? 'bg-neutral-200' : 'bg-primary-500'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-neutral-800 leading-snug">{r.message}</p>
                          <p className="text-[9px] text-neutral-400 mt-0.5">{formatReminderTime(r.created_at)}</p>
                          {r.rule_name && (
                            <p className="text-[9px] text-primary-500 mt-0.5">Rule: {r.rule_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            {r.action_url && (
                              <a
                                href={r.action_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => markRead(r.id)}
                                className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-medium"
                              >
                                <ExternalLink className="w-3 h-3" />
                                {r.action_type === 'send_whatsapp' ? 'Open WhatsApp' : r.action_type === 'send_email' ? 'Send Email' : 'Open'}
                              </a>
                            )}
                            {!r.is_read && (
                              <button onClick={() => markRead(r.id)} className="text-[10px] text-neutral-400 hover:text-neutral-600">
                                Mark read
                              </button>
                            )}
                            <button onClick={() => deleteReminder(r.id)} className="ml-auto text-neutral-300 hover:text-red-400">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowProfile(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">My Profile</h2>
                <p className="text-xs text-neutral-400 mt-0.5">{profile?.email}</p>
              </div>
              <button onClick={() => setShowProfile(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Display Name</label>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">
                  New Password <span className="text-neutral-400 font-normal">(leave blank to keep current)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={profilePwd}
                    onChange={e => { setProfilePwd(e.target.value); setSaveErr(''); }}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="Min 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {saveErr && (
                <p className="text-xs text-error-600 font-medium bg-error-50 rounded-lg px-3 py-2">{saveErr}</p>
              )}
              {saveMsg && (
                <div className="flex items-center gap-2 text-xs text-success-700 font-medium bg-success-50 rounded-lg px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowProfile(false)} className="flex-1 px-3 py-2 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={saving}
                  className="flex-1 px-3 py-2 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
