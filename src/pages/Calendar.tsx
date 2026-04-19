import { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronRight, MapPin, Clock, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/utils';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Appointment, TravelPlan } from '../types';

interface CustomerOption {
  id: string;
  name: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const APPT_COLORS: Record<string, any> = {
  'Astro Reading': 'bg-primary-100 text-primary-700 border-primary-200',
  'Vastu Audit': 'bg-accent-100 text-accent-700 border-accent-200',
  'Consultation': 'bg-blue-100 text-blue-700 border-blue-200',
  'Follow Up': 'bg-green-100 text-green-700 border-green-200',
  'Site Visit': 'bg-orange-100 text-orange-700 border-orange-200',
  'Video Call': 'bg-teal-100 text-teal-700 border-teal-200',
  'Phone Call': 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

const EMPTY_FORM = {
  title: '',
  customer_id: '',
  customer_name: '',
  appointment_type: 'Consultation' as Appointment['appointment_type'],
  date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
  start_time: '09:00',
  end_time: '10:00',
  location: '',
  city: '',
  notes: '',
};

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [travelPlans, setTravelPlans] = useState<TravelPlan[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showModal, setShowModal] = useState(false);
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [deletingAppointment, setDeletingAppointment] = useState<Appointment | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [travelForm, setTravelForm] = useState({ city: '', start_date: '', end_date: '', hotel_name: '', notes: '' });

  useEffect(() => { loadData(); }, [currentDate]);

  const loadData = async () => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

    const [apptRes, travelRes, customersRes] = await Promise.all([
      supabase.from('appointments').select('*').gte('start_time', startDate).lte('start_time', endDate + 'T23:59:59').order('start_time'),
      supabase.from('travel_plans').select('*').order('start_date'),
      supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
    ]);
    setAppointments(apptRes.data || []);
    setTravelPlans(travelRes.data || []);
    setCustomers((customersRes.data || []) as CustomerOption[]);
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return { firstDay, daysInMonth };
  };

  const { firstDay, daysInMonth } = getDaysInMonth();

  const getApptsByDate = (day: number) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const date = `${year}-${month}-${String(day).padStart(2, '0')}`;
    return appointments.filter(a => a.start_time.startsWith(date));
  };

  const toLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getSelectedDateAppts = () => {
    const dateStr = toLocalDateStr(selectedDate);
    return appointments.filter(a => a.start_time.startsWith(dateStr)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const getTravelForDate = (day: number) => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
    return travelPlans.find(t => t.start_date <= dateStr && t.end_date >= dateStr);
  };

  const openNewAppointment = (date: string) => {
    setEditingAppointment(null);
    setForm({ ...EMPTY_FORM, date });
    setShowModal(true);
  };

  const openEditAppointment = (appt: Appointment) => {
    setEditingAppointment(appt);
    const dateStr = appt.start_time.split('T')[0];
    const startTime = appt.start_time.split('T')[1]?.slice(0, 5) || '09:00';
    const endTime = appt.end_time.split('T')[1]?.slice(0, 5) || '10:00';
    setForm({
      title: appt.title,
      customer_id: appt.customer_id || '',
      customer_name: appt.customer_name || '',
      appointment_type: appt.appointment_type,
      date: dateStr,
      start_time: startTime,
      end_time: endTime,
      location: appt.location || '',
      city: appt.city || '',
      notes: appt.notes || '',
    });
    setShowModal(true);
  };

  const handleSaveAppointment = async () => {
    const customer = customers.find(c => c.id === form.customer_id);
    const payload = {
      title: form.title,
      customer_id: form.customer_id || null,
      customer_name: customer?.name || form.customer_name,
      appointment_type: form.appointment_type,
      start_time: `${form.date}T${form.start_time}:00`,
      end_time: `${form.date}T${form.end_time}:00`,
      location: form.location,
      city: form.city,
      notes: form.notes,
    };

    if (editingAppointment) {
      await supabase.from('appointments').update(payload).eq('id', editingAppointment.id);
    } else {
      await supabase.from('appointments').insert({ ...payload, status: 'scheduled' });
    }
    setShowModal(false);
    setEditingAppointment(null);
    loadData();
  };

  const handleDeleteAppointment = async () => {
    if (!deletingAppointment) return;
    await supabase.from('appointments').delete().eq('id', deletingAppointment.id);
    setDeletingAppointment(null);
    loadData();
  };

  const handleSaveTravelPlan = async () => {
    await supabase.from('travel_plans').insert(travelForm);
    setShowTravelModal(false);
    loadData();
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const prevMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const selectedDateAppts = getSelectedDateAppts();

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Schedule & Travel</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Orchestrate your spiritual consultancy journey</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTravelModal(true)} className="btn-secondary text-xs">+ Travel Plan</button>
          <button onClick={() => openNewAppointment(toLocalDateStr(selectedDate))} className="btn-primary">
            <Plus className="w-4 h-4" /> Schedule Appointment
          </button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                <ChevronLeft className="w-4 h-4 text-neutral-600" />
              </button>
              <h2 className="text-base font-semibold text-neutral-900">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <button onClick={nextMonth} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                <ChevronRight className="w-4 h-4 text-neutral-600" />
              </button>
            </div>
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-semibold text-neutral-400 uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dayAppts = getApptsByDate(day);
                const travel = getTravelForDate(day);
                const isToday = new Date().getDate() === day && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentDate.getMonth() && selectedDate.getFullYear() === currentDate.getFullYear();
                return (
                  <div key={day} onClick={() => setSelectedDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}
                    className={`min-h-16 p-1 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-primary-50 border border-primary-200' : 'hover:bg-neutral-50 border border-transparent'} ${travel ? 'ring-1 ring-accent-300' : ''}`}>
                    <p className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary-600 text-white' : 'text-neutral-700'}`}>{day}</p>
                    {travel && <div className="text-[8px] font-medium text-accent-700 bg-accent-100 rounded px-1 mt-0.5 truncate">{travel.city}</div>}
                    {dayAppts.slice(0, 2).map(a => (
                      <div key={a.id} className={`text-[9px] font-medium rounded px-1 mt-0.5 truncate border ${APPT_COLORS[a.appointment_type] || 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                        {a.title}
                      </div>
                    ))}
                    {dayAppts.length > 2 && <p className="text-[9px] text-neutral-400 mt-0.5">+{dayAppts.length - 2}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          {travelPlans.length > 0 && (
            <div className="card">
              <p className="text-sm font-semibold text-neutral-800 mb-3">Active Travel Plans</p>
              <div className="grid grid-cols-3 gap-3">
                {travelPlans.slice(0, 3).map(tp => {
                  const apptCount = appointments.filter(a => {
                    const d = a.start_time.split('T')[0];
                    return d >= tp.start_date && d <= tp.end_date;
                  }).length;
                  return (
                    <div key={tp.id} className="bg-neutral-50 rounded-xl p-3 border border-neutral-200">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-primary-600 rounded-full" />
                        <p className="text-sm font-semibold text-neutral-900">{tp.city}</p>
                      </div>
                      <p className="text-xs text-neutral-500">{formatDate(tp.start_date)} – {formatDate(tp.end_date)}</p>
                      <p className="text-xs text-primary-600 font-medium mt-1">{apptCount} Consultation{apptCount !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-base font-semibold text-neutral-900">
                  {DAYS[selectedDate.getDay()]}, {MONTHS[selectedDate.getMonth()].slice(0, 3)} {selectedDate.getDate()}
                </p>
                {getTravelForDate(selectedDate.getDate()) && (
                  <p className="text-xs text-accent-600 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{getTravelForDate(selectedDate.getDate())?.hotel_name || getTravelForDate(selectedDate.getDate())?.city}
                  </p>
                )}
              </div>
              <button onClick={() => openNewAppointment(toLocalDateStr(selectedDate))} className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {selectedDateAppts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-xs text-neutral-400">No appointments</p>
                <p className="text-[10px] text-neutral-300 mt-0.5">Click + to schedule</p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDateAppts.map(a => (
                  <div key={a.id} className={`border rounded-xl p-3 ${APPT_COLORS[a.appointment_type] || 'bg-blue-50 border-blue-200'}`}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock className="w-3 h-3 shrink-0" />
                        <p className="text-xs font-medium truncate">{formatTime(a.start_time)} – {formatTime(a.end_time)}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditAppointment(a)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-black/10 transition-colors"
                          title="Edit appointment"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setDeletingAppointment(a)}
                          className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-200 text-red-600 transition-colors"
                          title="Delete appointment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-semibold">{a.title}</p>
                    {a.customer_name && <p className="text-xs mt-0.5 opacity-75">{a.customer_name}</p>}
                    {a.location && (
                      <p className="text-xs flex items-center gap-1 mt-0.5 opacity-75">
                        <MapPin className="w-3 h-3" />{a.location}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <p className="text-sm font-semibold text-neutral-800 mb-3">Upcoming (Next 7 Days)</p>
            <div className="space-y-2">
              {appointments
                .filter(a => {
                  const d = new Date(a.start_time);
                  const today = new Date();
                  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                  return diff >= 0 && diff <= 7;
                })
                .slice(0, 5)
                .map(a => (
                  <div key={a.id} className="flex items-start gap-2 group">
                    <div className="w-1 h-1 bg-primary-500 rounded-full mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-800 truncate">{a.title}</p>
                      <p className="text-[10px] text-neutral-400">{formatDate(a.start_time)} · {formatTime(a.start_time)}</p>
                    </div>
                    <button
                      onClick={() => openEditAppointment(a)}
                      className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-neutral-100 transition-all shrink-0"
                    >
                      <Pencil className="w-3 h-3 text-neutral-500" />
                    </button>
                  </div>
                ))}
              {appointments.filter(a => {
                const d = new Date(a.start_time);
                const today = new Date();
                const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                return diff >= 0 && diff <= 7;
              }).length === 0 && (
                <p className="text-xs text-neutral-400 text-center py-3">No upcoming appointments</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingAppointment(null); }}
        title={editingAppointment ? 'Edit Appointment' : 'Schedule Appointment'}
        size="md"
        footer={
          <>
            <button onClick={() => { setShowModal(false); setEditingAppointment(null); }} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveAppointment} className="btn-primary">
              {editingAppointment ? 'Save Changes' : 'Schedule'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="e.g., Vastu Foundation Audit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select value={form.appointment_type} onChange={e => setForm(f => ({ ...f, appointment_type: e.target.value as Appointment['appointment_type'] }))} className="input">
                {['Astro Reading', 'Vastu Audit', 'Consultation', 'Follow Up', 'Site Visit', 'Video Call', 'Phone Call'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer</label>
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className="input">
                <option value="">-- Select --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="label">Start</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">End</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Address or Online" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input" placeholder="Mumbai, Pune..." />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTravelModal} onClose={() => setShowTravelModal(false)} title="Add Travel Plan" size="sm"
        footer={
          <>
            <button onClick={() => setShowTravelModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSaveTravelPlan} className="btn-primary">Save</button>
          </>
        }>
        <div className="space-y-3">
          <div>
            <label className="label">City *</label>
            <input value={travelForm.city} onChange={e => setTravelForm(f => ({ ...f, city: e.target.value }))} className="input" placeholder="Mumbai, Pune, Nashik..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">From Date</label>
              <input type="date" value={travelForm.start_date} onChange={e => setTravelForm(f => ({ ...f, start_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">To Date</label>
              <input type="date" value={travelForm.end_date} onChange={e => setTravelForm(f => ({ ...f, end_date: e.target.value }))} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Hotel / Stay</label>
            <input value={travelForm.hotel_name} onChange={e => setTravelForm(f => ({ ...f, hotel_name: e.target.value }))} className="input" placeholder="Hotel name (optional)" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={travelForm.notes} onChange={e => setTravelForm(f => ({ ...f, notes: e.target.value }))} className="input" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deletingAppointment}
        onClose={() => setDeletingAppointment(null)}
        onConfirm={handleDeleteAppointment}
        title="Delete Appointment"
        message={`Are you sure you want to delete "${deletingAppointment?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
