import { useState, useEffect } from 'react';
import {
  Plus, Search, Users, Phone, Mail, MapPin, Star, FileText,
  ArrowLeft, Upload, MessageSquare, Calendar, Receipt, ChevronLeft, ChevronRight,
  Clock, Download, Package, ShoppingCart, TrendingUp, Activity, Briefcase,
  Target, AlertCircle, ArrowRight, CheckCircle2, Hash, Compass, Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, exportToCSV } from '../lib/utils';
import { INDIA_STATES, STATE_CITIES, CUSTOMER_TAGS } from '../lib/indiaData';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ActionMenu, { actionEdit, actionDelete } from '../components/ui/ActionMenu';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/ui/StatusBadge';
import { useDateRange } from '../contexts/DateRangeContext';
import { createSalesOrder } from '../services/documentFlowService';
import type {
  Customer, CrmNote, CrmFile, Appointment, TravelPlan, Invoice,
  SalesOrder, Payment, ProductRecommendation, Product, VastuPlan
} from '../types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const APPT_COLORS: Record<string,string> = {
  'Astro Reading': 'bg-primary-100 text-primary-700 border-primary-200',
  'Vastu Audit': 'bg-accent-100 text-accent-700 border-accent-200',
  'Gemstone Reading': 'bg-yellow-100 text-yellow-700 border-yellow-200',
  'Consultation': 'bg-blue-100 text-blue-700 border-blue-200',
  'Follow Up': 'bg-green-100 text-green-700 border-green-200',
  'Site Visit': 'bg-orange-100 text-orange-700 border-orange-200',
  'Video Call': 'bg-teal-100 text-teal-700 border-teal-200',
  'Phone Call': 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

const STAGE_COLORS: Record<string,string> = {
  'Lead': 'bg-neutral-100 text-neutral-600',
  'Interested': 'bg-blue-100 text-blue-700',
  'Site Visit Done': 'bg-yellow-100 text-yellow-700',
  'Proposal Given': 'bg-orange-100 text-orange-700',
  'Converted': 'bg-success-50 text-success-600',
  'Lost': 'bg-error-50 text-error-600',
};

const CONVERSION_STAGES = ['Lead','Interested','Site Visit Done','Proposal Given','Converted','Lost'] as const;

type ActiveTab = 'clients' | 'calendar';
type ProfileTab = 'overview' | 'notes' | 'vastu-plan' | 'appointments' | 'documents' | 'recommendations' | 'sales' | 'rate-cards';
type SalesSubTab = 'orders' | 'invoices' | 'payments';

export default function CRM() {
  const { dateRange } = useDateRange();
  const [activeTab, setActiveTab] = useState<ActiveTab>('clients');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [stageFilter, setStageFilter] = useState('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>('overview');
  const [salesSubTab, setSalesSubTab] = useState<SalesSubTab>('orders');

  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [files, setFiles] = useState<CrmFile[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [customerOrders, setCustomerOrders] = useState<SalesOrder[]>([]);
  const [customerPayments, setCustomerPayments] = useState<Payment[]>([]);
  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [vastuPlans, setVastuPlans] = useState<VastuPlan[]>([]);
  const [documents, setDocuments] = useState<{ id: string; file_name: string; file_url: string; file_type: string; tag: string; notes: string; created_at: string; file_size: number }[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTag, setDocTag] = useState('Other');
  const [docNotes, setDocNotes] = useState('');
  const [previewDoc, setPreviewDoc] = useState<{ url: string; type: string; name: string } | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<{ id: string; file_path?: string } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [rateCards, setRateCards] = useState<{ id: string; product_id: string; custom_rate: number; products: { name: string; unit: string; selling_price: number } | null }[]>([]);
  const [rateCardForm, setRateCardForm] = useState({ product_id: '', custom_rate: '' });
  const [showRateCardModal, setShowRateCardModal] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showApptModal, setShowApptModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [showVastuModal, setShowVastuModal] = useState(false);
  const [showConvertSOModal, setShowConvertSOModal] = useState(false);

  const [editingNote, setEditingNote] = useState<CrmNote | null>(null);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [editingRecommend, setEditingRecommend] = useState<ProductRecommendation | null>(null);
  const [editingVastu, setEditingVastu] = useState<VastuPlan | null>(null);

  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<CrmNote | null>(null);
  const [confirmDeleteAppt, setConfirmDeleteAppt] = useState<Appointment | null>(null);
  const [confirmDeleteRecommend, setConfirmDeleteRecommend] = useState<ProductRecommendation | null>(null);
  const [confirmDeleteVastu, setConfirmDeleteVastu] = useState<VastuPlan | null>(null);
  const [convertingSO, setConvertingSO] = useState(false);

  const [form, setForm] = useState({
    name: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '',
    category: 'B2C' as 'B2B' | 'B2C', notes: '', tags: [] as string[],
  });
  const [editCustomerForm, setEditCustomerForm] = useState({
    name: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '',
    category: 'B2C' as 'B2B' | 'B2C', notes: '', project_status: 'active',
    conversion_stage: 'Lead' as Customer['conversion_stage'],
    project_value: '', next_followup_date: '', tags: [] as string[],
  });
  const [noteForm, setNoteForm] = useState({ note_type: 'Note', title: '', content: '' });
  const [apptForm, setApptForm] = useState({
    title: '', appointment_type: 'Consultation' as Appointment['appointment_type'],
    date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '10:00',
    location: '', city: '', notes: '',
  });
  const [recommendForm, setRecommendForm] = useState({
    product_name: '', product_id: '', direction: '', recommended_quantity: 1,
    notes: '', status: 'pending' as ProductRecommendation['status'],
  });
  const [vastuForm, setVastuForm] = useState({
    direction: '', product_id: '', product_name: '', quantity: 1, notes: '',
    status: 'pending' as VastuPlan['status'],
  });

  const [calDate, setCalDate] = useState(new Date());
  const [calAppointments, setCalAppointments] = useState<Appointment[]>([]);
  const [travelPlans, setTravelPlans] = useState<TravelPlan[]>([]);
  const [selectedCalDate, setSelectedCalDate] = useState<Date>(new Date());
  const [showCalApptModal, setShowCalApptModal] = useState(false);
  const [calCustomers, setCalCustomers] = useState<Customer[]>([]);
  const [calApptForm, setCalApptForm] = useState({
    title: '', customer_id: '', appointment_type: 'Consultation' as Appointment['appointment_type'],
    date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '10:00',
    location: '', city: '', notes: '',
  });
  const [showTravelModal, setShowTravelModal] = useState(false);
  const [travelForm, setTravelForm] = useState({ city: '', start_date: '', end_date: '', hotel_name: '', notes: '' });

  useEffect(() => { loadCustomers(); loadProducts(); }, []);
  useEffect(() => { if (activeTab === 'calendar') loadCalendarData(); }, [activeTab, calDate]);

  const loadCustomers = async () => {
    const { data } = await supabase.from('customers').select('*').eq('is_active', true).order('name');
    setCustomers(data || []);
    setCalCustomers(data || []);
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, name, direction, is_gemstone, selling_price, unit').eq('is_active', true).order('name');
    setProducts((data || []) as unknown as Product[]);
  };

  const loadCalendarData = async () => {
    const year = calDate.getFullYear();
    const month = String(calDate.getMonth() + 1).padStart(2,'0');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(year, calDate.getMonth() + 1, 0).toISOString().split('T')[0];
    const [apptRes, travelRes] = await Promise.all([
      supabase.from('appointments').select('*').gte('start_time', startDate).lte('start_time', endDate + 'T23:59:59').order('start_time'),
      supabase.from('travel_plans').select('*').order('start_date'),
    ]);
    setCalAppointments(apptRes.data || []);
    setTravelPlans(travelRes.data || []);
  };

  const loadCustomerDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setProfileTab('overview');
    const [notesRes, filesRes, apptRes, invRes, ordersRes, paymentsRes, recRes, vastuRes] = await Promise.all([
      supabase.from('crm_notes').select('*').eq('customer_id', customer.id).order('note_date', { ascending: false }),
      supabase.from('crm_files').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('customer_id', customer.id).order('start_time', { ascending: false }),
      supabase.from('invoices').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('sales_orders').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('customer_id', customer.id).order('payment_date', { ascending: false }),
      supabase.from('product_recommendations').select('*').eq('customer_id', customer.id).order('recommended_date', { ascending: false }),
      supabase.from('vastu_plans').select('*').eq('customer_id', customer.id).order('created_at', { ascending: false }),
    ]);
    setNotes(notesRes.data || []);
    setFiles(filesRes.data || []);
    setAppointments(apptRes.data || []);
    setCustomerInvoices(invRes.data || []);
    setCustomerOrders(ordersRes.data || []);
    setCustomerPayments(paymentsRes.data || []);
    setRecommendations(recRes.data || []);
    setVastuPlans(vastuRes.data || []);
    loadCustomerDocs(customer.id);
    loadRateCards(customer.id);
  };

  const loadRateCards = async (customerId: string) => {
    const { data } = await supabase
      .from('customer_rate_cards')
      .select('id, product_id, custom_rate, products(name, unit, selling_price)')
      .eq('customer_id', customerId)
      .eq('is_active', true);
    setRateCards((data || []) as any);
  };

  const handleSaveRateCard = async () => {
    if (!selectedCustomer || !rateCardForm.product_id) return;
    await supabase.from('customer_rate_cards').upsert({
      customer_id: selectedCustomer.id,
      product_id: rateCardForm.product_id,
      custom_rate: parseFloat(rateCardForm.custom_rate) || 0,
      is_active: true,
    }, { onConflict: 'customer_id,product_id' });
    setShowRateCardModal(false);
    setRateCardForm({ product_id: '', custom_rate: '' });
    loadRateCards(selectedCustomer.id);
  };

  const handleDeleteRateCard = async (id: string) => {
    await supabase.from('customer_rate_cards').update({ is_active: false }).eq('id', id);
    if (selectedCustomer) loadRateCards(selectedCustomer.id);
  };

  const loadCustomerDocs = async (customerId: string) => {
    const { data } = await supabase.from('customer_documents').select('*').eq('customer_id', customerId).order('created_at', { ascending: false });
    setDocuments(data || []);
  };

  const handleUploadDoc = async (file: File, customerId: string) => {
    setUploadingDoc(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `documents/${customerId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage.from('customer-files').upload(path, file, { upsert: false });
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from('customer-files').getPublicUrl(path);
      await supabase.from('customer_documents').insert({
        customer_id: customerId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_path: path,
        file_size: file.size,
        file_type: file.type,
        tag: docTag,
        notes: docNotes,
      });
      loadCustomerDocs(customerId);
    }
    setUploadingDoc(false);
    setDocNotes('');
  };

  const handleDeleteDoc = async () => {
    if (!confirmDeleteDoc) return;
    if (confirmDeleteDoc.file_path) {
      await supabase.storage.from('customer-files').remove([confirmDeleteDoc.file_path]);
    }
    await supabase.from('customer_documents').delete().eq('id', confirmDeleteDoc.id);
    setConfirmDeleteDoc(null);
    if (selectedCustomer) loadCustomerDocs(selectedCustomer.id);
  };

  const computeCustomerScore = (c: Customer, invoiceTotal: number, noteCount: number) => {
    let score = 0;
    score += Math.min(Math.floor(invoiceTotal / 5000) * 5, 40);
    score += Math.min(noteCount * 3, 30);
    if (c.conversion_stage === 'Converted') score += 20;
    else if (c.conversion_stage === 'Proposal Given') score += 10;
    else if (c.conversion_stage === 'Site Visit Done') score += 7;
    else if (c.conversion_stage === 'Interested') score += 4;
    if (c.next_followup_date) score += 5;
    return Math.min(score, 100);
  };

  const handleSaveCustomer = async () => {
    await supabase.from('customers').insert({
      name: form.name, phone: form.phone, alt_phone: form.alt_phone, email: form.email,
      address: form.address, address2: form.address2, city: form.city, state: form.state, pincode: form.pincode,
      category: form.category, notes: form.notes,
      opening_balance: 0, balance: 0, total_revenue: 0, tags: form.tags,
      conversion_stage: 'Lead',
    });
    setShowAddModal(false);
    loadCustomers();
  };

  const handleEditCustomer = () => {
    if (!selectedCustomer) return;
    setEditCustomerForm({
      name: selectedCustomer.name || '',
      phone: selectedCustomer.phone || '',
      alt_phone: (selectedCustomer as Customer & { alt_phone?: string }).alt_phone || '',
      email: selectedCustomer.email || '',
      address: selectedCustomer.address || '',
      address2: (selectedCustomer as Customer & { address2?: string }).address2 || '',
      city: selectedCustomer.city || '',
      state: selectedCustomer.state || '',
      pincode: selectedCustomer.pincode || '',
      category: selectedCustomer.category || 'B2C',
      notes: selectedCustomer.notes || '',
      project_status: selectedCustomer.project_status || 'active',
      conversion_stage: selectedCustomer.conversion_stage || 'Lead',
      project_value: String(selectedCustomer.project_value || ''),
      next_followup_date: selectedCustomer.next_followup_date || '',
      tags: selectedCustomer.tags || [],
    });
    setShowEditCustomerModal(true);
  };

  const handleUpdateCustomer = async () => {
    if (!selectedCustomer) return;
    const totalRev = customerInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0);
    const score = computeCustomerScore(
      { ...selectedCustomer, conversion_stage: editCustomerForm.conversion_stage, next_followup_date: editCustomerForm.next_followup_date },
      totalRev,
      notes.length
    );
    await supabase.from('customers').update({
      name: editCustomerForm.name,
      phone: editCustomerForm.phone,
      alt_phone: editCustomerForm.alt_phone,
      email: editCustomerForm.email,
      address: editCustomerForm.address,
      address2: editCustomerForm.address2,
      city: editCustomerForm.city,
      state: editCustomerForm.state,
      pincode: editCustomerForm.pincode,
      category: editCustomerForm.category,
      notes: editCustomerForm.notes,
      project_status: editCustomerForm.project_status,
      conversion_stage: editCustomerForm.conversion_stage,
      project_value: parseFloat(editCustomerForm.project_value) || 0,
      next_followup_date: editCustomerForm.next_followup_date || null,
      customer_score: score,
      tags: editCustomerForm.tags,
    }).eq('id', selectedCustomer.id);
    setShowEditCustomerModal(false);
    const updated = { ...selectedCustomer, ...editCustomerForm, project_value: parseFloat(editCustomerForm.project_value) || 0, customer_score: score };
    setSelectedCustomer(updated as Customer);
    loadCustomers();
  };

  const handleDeactivateCustomer = async () => {
    if (!selectedCustomer) return;
    await supabase.from('customers').update({ is_active: false }).eq('id', selectedCustomer.id);
    setSelectedCustomer(null);
    loadCustomers();
  };

  const handleSaveNote = async () => {
    if (!selectedCustomer) return;
    if (editingNote) {
      await supabase.from('crm_notes').update({
        note_type: noteForm.note_type, title: noteForm.title, content: noteForm.content,
      }).eq('id', editingNote.id);
      setEditingNote(null);
    } else {
      await supabase.from('crm_notes').insert({
        customer_id: selectedCustomer.id,
        note_type: noteForm.note_type, title: noteForm.title, content: noteForm.content,
        note_date: new Date().toISOString(),
      });
      await supabase.from('customers').update({
        last_interaction: new Date().toISOString(),
        last_interaction_date: new Date().toISOString().split('T')[0],
      }).eq('id', selectedCustomer.id);
    }
    setShowNoteModal(false);
    loadCustomerDetail(selectedCustomer);
  };

  const handleDeleteNote = async () => {
    if (!confirmDeleteNote || !selectedCustomer) return;
    await supabase.from('crm_notes').delete().eq('id', confirmDeleteNote.id);
    setConfirmDeleteNote(null);
    loadCustomerDetail(selectedCustomer);
  };

  const handleSaveAppt = async () => {
    if (!selectedCustomer) return;
    if (editingAppt) {
      await supabase.from('appointments').update({
        title: apptForm.title, appointment_type: apptForm.appointment_type,
        start_time: `${apptForm.date}T${apptForm.start_time}:00`,
        end_time: `${apptForm.date}T${apptForm.end_time}:00`,
        location: apptForm.location, city: apptForm.city, notes: apptForm.notes,
      }).eq('id', editingAppt.id);
      setEditingAppt(null);
    } else {
      await supabase.from('appointments').insert({
        title: apptForm.title, customer_id: selectedCustomer.id, customer_name: selectedCustomer.name,
        appointment_type: apptForm.appointment_type,
        start_time: `${apptForm.date}T${apptForm.start_time}:00`,
        end_time: `${apptForm.date}T${apptForm.end_time}:00`,
        location: apptForm.location, city: apptForm.city, status: 'scheduled', notes: apptForm.notes,
      });
      await supabase.from('customers').update({
        last_interaction_date: new Date().toISOString().split('T')[0],
      }).eq('id', selectedCustomer.id);
    }
    setShowApptModal(false);
    loadCustomerDetail(selectedCustomer);
  };

  const handleEditAppt = (appt: Appointment) => {
    setEditingAppt(appt);
    setApptForm({
      title: appt.title, appointment_type: appt.appointment_type,
      date: appt.start_time.split('T')[0],
      start_time: appt.start_time.split('T')[1]?.slice(0,5) || '09:00',
      end_time: appt.end_time.split('T')[1]?.slice(0,5) || '10:00',
      location: appt.location || '', city: appt.city || '', notes: appt.notes || '',
    });
    setShowApptModal(true);
  };

  const handleDeleteAppt = async () => {
    if (!confirmDeleteAppt || !selectedCustomer) return;
    await supabase.from('appointments').delete().eq('id', confirmDeleteAppt.id);
    setConfirmDeleteAppt(null);
    loadCustomerDetail(selectedCustomer);
  };

  const handleSaveRecommendation = async () => {
    if (!selectedCustomer) return;
    if (editingRecommend) {
      await supabase.from('product_recommendations').update({
        product_name: recommendForm.product_name, product_id: recommendForm.product_id || null,
        direction: recommendForm.direction, recommended_quantity: recommendForm.recommended_quantity,
        notes: recommendForm.notes, status: recommendForm.status,
      }).eq('id', editingRecommend.id);
      setEditingRecommend(null);
    } else {
      await supabase.from('product_recommendations').insert({
        customer_id: selectedCustomer.id,
        product_name: recommendForm.product_name, product_id: recommendForm.product_id || null,
        direction: recommendForm.direction, recommended_quantity: recommendForm.recommended_quantity,
        notes: recommendForm.notes, status: recommendForm.status,
        recommended_date: new Date().toISOString().split('T')[0],
      });
    }
    setShowRecommendModal(false);
    loadCustomerDetail(selectedCustomer);
  };

  const handleSaveVastu = async () => {
    if (!selectedCustomer) return;
    const payload = {
      direction: vastuForm.direction,
      product_id: vastuForm.product_id || null,
      product_name: vastuForm.product_name,
      quantity: vastuForm.quantity,
      notes: vastuForm.notes,
      status: vastuForm.status,
    };
    if (editingVastu) {
      await supabase.from('vastu_plans').update(payload).eq('id', editingVastu.id);
      setEditingVastu(null);
    } else {
      await supabase.from('vastu_plans').insert({ ...payload, customer_id: selectedCustomer.id });
    }
    setShowVastuModal(false);
    loadCustomerDetail(selectedCustomer);
  };

  const handleDeleteVastu = async () => {
    if (!confirmDeleteVastu || !selectedCustomer) return;
    await supabase.from('vastu_plans').delete().eq('id', confirmDeleteVastu.id);
    setConfirmDeleteVastu(null);
    loadCustomerDetail(selectedCustomer);
  };

  const handleConvertVastuToSO = async () => {
    if (!selectedCustomer || vastuPlans.length === 0) return;
    setConvertingSO(true);
    const soNumber = `SO-${Date.now().toString().slice(-6)}`;
    const items = vastuPlans
      .filter(vp => vp.product_id)
      .map(vp => ({
        product_id: vp.product_id as string,
        product_name: `${vp.direction ? `[${vp.direction}] ` : ''}${vp.product_name}`,
        unit: 'pcs',
        quantity: vp.quantity,
        unit_price: 0,
        discount_pct: 0,
      }));
    if (items.length === 0) {
      setConvertingSO(false);
      return;
    }
    try {
      await createSalesOrder({
        so_number: soNumber,
        customer_id: selectedCustomer.id,
        customer_name: selectedCustomer.name,
        customer_phone: selectedCustomer.phone,
        customer_address: selectedCustomer.address,
        so_date: new Date().toISOString().split('T')[0],
        notes: 'Converted from Vastu Plan',
        items,
      });
    } finally {
      setConvertingSO(false);
      setShowConvertSOModal(false);
      loadCustomerDetail(selectedCustomer);
    }
  };

  const handleSaveCalAppt = async () => {
    const customer = calCustomers.find(c => c.id === calApptForm.customer_id);
    await supabase.from('appointments').insert({
      title: calApptForm.title,
      customer_id: calApptForm.customer_id || null,
      customer_name: customer?.name || '',
      appointment_type: calApptForm.appointment_type,
      start_time: `${calApptForm.date}T${calApptForm.start_time}:00`,
      end_time: `${calApptForm.date}T${calApptForm.end_time}:00`,
      location: calApptForm.location, city: calApptForm.city, status: 'scheduled', notes: calApptForm.notes,
    });
    setShowCalApptModal(false);
    loadCalendarData();
  };

  const handleSaveTravelPlan = async () => {
    await supabase.from('travel_plans').insert(travelForm);
    setShowTravelModal(false);
    loadCalendarData();
  };

  const handleExportCSV = () => {
    const data = filtered.map(c => ({
      Name: c.name, Phone: c.phone || '', Email: c.email || '',
      City: c.city || '', State: c.state || '', Category: c.category,
      Stage: c.conversion_stage || '', 'Project Value': c.project_value || 0,
      'Customer Score': c.customer_score || 0, 'Total Revenue': c.total_revenue || 0,
      'Next Followup': c.next_followup_date || '',
    }));
    exportToCSV(data, 'clients');
  };

  const filtered = customers.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || '').includes(search) || (c.city || '').toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || c.category === category;
    const matchStage = stageFilter === 'All' || c.conversion_stage === stageFilter;
    return matchSearch && matchCat && matchStage;
  });

  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const todayFollowups = customers.filter(c => c.next_followup_date === todayStr);

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();

  const getNoteTypeColor = (type: string) => {
    const map: Record<string,string> = {
      'Note': 'bg-neutral-100 text-neutral-600', 'Call': 'bg-blue-100 text-blue-700',
      'Meeting': 'bg-green-100 text-green-700', 'Vastu Visit': 'bg-accent-100 text-accent-700',
      'Astro Reading': 'bg-primary-100 text-primary-700', 'Follow Up': 'bg-warning-50 text-warning-700',
      'WhatsApp': 'bg-green-100 text-green-700', 'Site Visit': 'bg-orange-100 text-orange-700',
    };
    return map[type] || 'bg-neutral-100 text-neutral-600';
  };

  const getRecommendStatusColor = (status: string) => {
    const map: Record<string,string> = {
      pending: 'bg-warning-50 text-warning-600',
      ordered: 'bg-blue-100 text-blue-700',
      delivered: 'bg-success-50 text-success-600',
    };
    return map[status] || 'bg-neutral-100 text-neutral-600';
  };

  const getVastuStatusColor = (status: string) => {
    const map: Record<string,string> = {
      pending: 'bg-neutral-100 text-neutral-600',
      ordered: 'bg-blue-100 text-blue-700',
      installed: 'bg-success-50 text-success-600',
    };
    return map[status] || 'bg-neutral-100 text-neutral-600';
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const getDaysInMonth = () => {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    return { firstDay: new Date(year, month, 1).getDay(), daysInMonth: new Date(year, month + 1, 0).getDate() };
  };
  const { firstDay, daysInMonth } = getDaysInMonth();

  const getCalApptsByDate = (day: number) => {
    const year = calDate.getFullYear();
    const month = String(calDate.getMonth() + 1).padStart(2,'0');
    const date = `${year}-${month}-${String(day).padStart(2,'0')}`;
    return calAppointments.filter(a => a.start_time.startsWith(date));
  };

  const getTravelForDay = (day: number) => {
    const year = calDate.getFullYear();
    const month = String(calDate.getMonth() + 1).padStart(2,'0');
    const dateStr = `${year}-${month}-${String(day).padStart(2,'0')}`;
    return travelPlans.find(t => t.start_date <= dateStr && t.end_date >= dateStr);
  };

  const toLocalDateStr = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const selectedCalDateAppts = calAppointments
    .filter(a => a.start_time.startsWith(toLocalDateStr(selectedCalDate)))
    .sort((a,b) => a.start_time.localeCompare(b.start_time));

  const calApptsByTravelPlan = () => {
    const groups: Record<string, Appointment[]> = { Local: [] };
    travelPlans.forEach(tp => { groups[tp.city] = []; });
    selectedCalDateAppts.forEach(appt => {
      const matchingPlan = travelPlans.find(tp => {
        const d = appt.start_time.split('T')[0];
        return d >= tp.start_date && d <= tp.end_date;
      });
      if (matchingPlan) {
        if (!groups[matchingPlan.city]) groups[matchingPlan.city] = [];
        groups[matchingPlan.city].push(appt);
      } else {
        groups['Local'].push(appt);
      }
    });
    return groups;
  };

  if (selectedCustomer) {
    const totalRevenue = customerInvoices.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + inv.total_amount, 0);
    const pendingPayment = customerInvoices.filter(inv => inv.status !== 'cancelled').reduce((sum, inv) => sum + (inv.outstanding_amount || 0), 0);
    const lastInteraction = notes.length > 0 ? notes[0].note_date : null;
    const customerScore = computeCustomerScore(selectedCustomer, totalRevenue, notes.length);
    const filteredInvoices = customerInvoices.filter(inv => inv.invoice_date >= dateRange.from && inv.invoice_date <= dateRange.to);

    const recentActivity = [
      ...notes.slice(0,5).map(n => ({ type: 'note' as const, date: n.note_date, data: n })),
      ...appointments.slice(0,5).map(a => ({ type: 'appt' as const, date: a.start_time, data: a })),
    ].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);

    const profileTabs: { id: ProfileTab; label: string; count?: number }[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'notes', label: 'Timeline', count: notes.length },
      { id: 'vastu-plan', label: 'Vastu Plan', count: vastuPlans.length },
      { id: 'appointments', label: 'Appointments', count: appointments.length },
      { id: 'documents', label: 'Documents', count: documents.length },
      { id: 'recommendations', label: 'Recommendations', count: recommendations.length },
      { id: 'sales', label: 'Sales History' },
      { id: 'rate-cards', label: 'Rate Cards', count: rateCards.length || undefined },
    ];

    const stageIndex = CONVERSION_STAGES.indexOf(selectedCustomer.conversion_stage || 'Lead');

    return (
      <div className="flex-1 overflow-y-auto bg-neutral-50">
        <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center gap-3">
          <button onClick={() => setSelectedCustomer(null)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral-100">
            <ArrowLeft className="w-4 h-4 text-neutral-600" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-neutral-900">{selectedCustomer.name}</h1>
            <p className="text-xs text-neutral-500">Project Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedCustomer.phone && (
              <a href={`https://wa.me/${selectedCustomer.phone?.replace(/[^0-9]/g, '')}`} target="_blank\" rel="noopener noreferrer"
                className="btn-secondary text-xs py-1.5 px-3 gap-1">
                <MessageSquare className="w-3.5 h-3.5 text-green-600" /> WhatsApp
              </a>
            )}
            <button onClick={handleEditCustomer} className="btn-secondary text-xs py-1.5 px-3">Edit</button>
            <button onClick={() => setConfirmDeactivate(true)} className="btn-secondary text-xs py-1.5 px-3 text-error-600 hover:bg-error-50">Deactivate</button>
            <button onClick={() => { setNoteForm({ note_type: 'Note', title: '', content: '' }); setEditingNote(null); setShowNoteModal(true); }} className="btn-secondary">
              <Plus className="w-4 h-4" /> Note
            </button>
            <button onClick={() => {
              setEditingAppt(null);
              setApptForm({ title: '', appointment_type: 'Consultation', date: toLocalDateStr(new Date()), start_time: '09:00', end_time: '10:00', location: '', city: '', notes: '' });
              setShowApptModal(true);
            }} className="btn-primary">
              <Calendar className="w-4 h-4" /> Schedule
            </button>
          </div>
        </div>

        <div className="p-6 grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-4">
            <div className="card">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-xl font-bold text-primary-700">{getInitials(selectedCustomer.name)}</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-neutral-900">{selectedCustomer.name}</h2>
                    <span className={`badge ${selectedCustomer.category === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-600'}`}>{selectedCustomer.category}</span>
                    {selectedCustomer.conversion_stage && (
                      <span className={`badge capitalize ${STAGE_COLORS[selectedCustomer.conversion_stage] || 'bg-neutral-100 text-neutral-600'}`}>
                        <Target className="w-2.5 h-2.5 mr-0.5" />
                        {selectedCustomer.conversion_stage}
                      </span>
                    )}
                    {(selectedCustomer.tags || []).includes('VIP') && (
                      <span className="badge bg-yellow-100 text-yellow-700"><Star className="w-2.5 h-2.5 mr-0.5" />VIP</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    {selectedCustomer.phone && (
                      <a href={`tel:${selectedCustomer.phone}`} className="flex items-center gap-1 text-sm text-neutral-600 hover:text-primary-600">
                        <Phone className="w-3.5 h-3.5" /> {selectedCustomer.phone}
                      </a>
                    )}
                    {selectedCustomer.email && <span className="flex items-center gap-1 text-sm text-neutral-600"><Mail className="w-3.5 h-3.5" /> {selectedCustomer.email}</span>}
                    {selectedCustomer.city && <span className="flex items-center gap-1 text-sm text-neutral-600"><MapPin className="w-3.5 h-3.5" /> {selectedCustomer.city}{selectedCustomer.state ? `, ${selectedCustomer.state}` : ''}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Score</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-20 h-2 bg-neutral-200 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${customerScore}%` }} />
                    </div>
                    <span className="text-sm font-bold text-primary-700">{customerScore}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Conversion Stage</p>
                <div className="flex items-center gap-1">
                  {CONVERSION_STAGES.map((stage, i) => (
                    <div key={stage} className="flex items-center gap-1 flex-1">
                      <div className={`flex-1 flex flex-col items-center`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-colors ${i <= stageIndex ? 'bg-primary-600 text-white' : 'bg-neutral-200 text-neutral-500'}`}>
                          {i + 1}
                        </div>
                        <p className={`text-[8px] mt-0.5 text-center leading-tight ${i <= stageIndex ? 'text-primary-700 font-semibold' : 'text-neutral-400'}`}>{stage}</p>
                      </div>
                      {i < CONVERSION_STAGES.length - 1 && (
                        <div className={`h-0.5 flex-1 mb-3 transition-colors ${i < stageIndex ? 'bg-primary-500' : 'bg-neutral-200'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-1 bg-white border border-neutral-200 rounded-xl p-1 overflow-x-auto">
              {profileTabs.map(tab => (
                <button key={tab.id} onClick={() => setProfileTab(tab.id)}
                  className={`flex-shrink-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors ${profileTab === tab.id ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${profileTab === tab.id ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-500'}`}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            {profileTab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-primary-700' },
                    { label: 'Pending Payment', value: formatCurrency(pendingPayment), color: pendingPayment > 0 ? 'text-error-600' : 'text-success-600' },
                    { label: 'Project Value', value: formatCurrency(selectedCustomer.project_value || 0), color: 'text-neutral-800' },
                    { label: 'Appointments', value: String(appointments.length), color: 'text-neutral-800' },
                  ].map(kpi => (
                    <div key={kpi.label} className="card text-center">
                      <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{kpi.label}</p>
                      <p className={`text-lg font-bold mt-1 ${kpi.color}`}>{kpi.value}</p>
                    </div>
                  ))}
                </div>

                {selectedCustomer.next_followup_date && (
                  <div className={`flex items-center gap-3 p-3 rounded-xl border ${selectedCustomer.next_followup_date === new Date().toISOString().split('T')[0] ? 'bg-warning-50 border-warning-200' : 'bg-blue-50 border-blue-200'}`}>
                    <AlertCircle className={`w-4 h-4 shrink-0 ${selectedCustomer.next_followup_date === new Date().toISOString().split('T')[0] ? 'text-warning-600' : 'text-blue-600'}`} />
                    <p className="text-sm font-medium text-neutral-800">
                      Next follow-up: <span className="font-bold">{formatDate(selectedCustomer.next_followup_date)}</span>
                      {selectedCustomer.next_followup_date === new Date().toISOString().split('T')[0] && ' — Due today!'}
                    </p>
                  </div>
                )}

                <div className="card">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-primary-600" />
                    <h3 className="text-sm font-semibold text-neutral-800">Recent Activity</h3>
                  </div>
                  {recentActivity.length === 0 ? (
                    <EmptyState icon={Activity} title="No activity yet" description="Notes and appointments will appear here." />
                  ) : (
                    <div className="space-y-3">
                      {recentActivity.map((item, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${item.type === 'note' ? 'bg-primary-100' : 'bg-accent-100'}`}>
                            {item.type === 'note' ? <FileText className="w-3.5 h-3.5 text-primary-600" /> : <Calendar className="w-3.5 h-3.5 text-accent-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            {item.type === 'note' ? (
                              <>
                                <p className="text-sm font-medium text-neutral-800">{(item.data as CrmNote).title}</p>
                                <p className="text-xs text-neutral-400">{(item.data as CrmNote).note_type} · {formatDate(item.date)}</p>
                              </>
                            ) : (
                              <>
                                <p className="text-sm font-medium text-neutral-800">{(item.data as Appointment).title}</p>
                                <p className="text-xs text-neutral-400">{(item.data as Appointment).appointment_type} · {formatDate(item.date)}</p>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {profileTab === 'notes' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-800">Interaction Timeline</h3>
                  <button onClick={() => { setNoteForm({ note_type: 'Note', title: '', content: '' }); setEditingNote(null); setShowNoteModal(true); }} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add</button>
                </div>
                {notes.length === 0 ? (
                  <EmptyState icon={FileText} title="No interactions yet" description="Add a note to start the timeline." />
                ) : (
                  <div className="space-y-3">
                    {notes.map((note, i) => (
                      <div key={note.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 bg-primary-600 rounded-full mt-1 shrink-0" />
                          {i < notes.length - 1 && <div className="w-px flex-1 bg-neutral-200 mt-1" />}
                        </div>
                        <div className="flex-1 bg-white border border-neutral-100 rounded-xl p-3 mb-1 shadow-card">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className={`badge text-[10px] ${getNoteTypeColor(note.note_type)}`}>{note.note_type}</span>
                              <p className="text-sm font-semibold text-neutral-900">{note.title}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-neutral-400">{formatDate(note.note_date)}</span>
                              <ActionMenu items={[
                                actionEdit(() => { setEditingNote(note); setNoteForm({ note_type: note.note_type, title: note.title, content: note.content || '' }); setShowNoteModal(true); }),
                                actionDelete(() => setConfirmDeleteNote(note)),
                              ]} />
                            </div>
                          </div>
                          {note.content && <p className="text-sm text-neutral-600 leading-relaxed">{note.content}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {profileTab === 'vastu-plan' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-800">Vastu Plan</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">Direction-wise product placements for this client</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {vastuPlans.length > 0 && (
                      <button onClick={() => setShowConvertSOModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-success-50 text-success-700 border border-success-200 hover:bg-success-100 transition-colors">
                        <ArrowRight className="w-3.5 h-3.5" /> Convert to Sales Order
                      </button>
                    )}
                    <button onClick={() => { setEditingVastu(null); setVastuForm({ direction: '', product_id: '', product_name: '', quantity: 1, notes: '', status: 'pending' }); setShowVastuModal(true); }} className="btn-ghost text-xs">
                      <Plus className="w-3.5 h-3.5" /> Add Item
                    </button>
                  </div>
                </div>
                {vastuPlans.length === 0 ? (
                  <EmptyState icon={Compass} title="No Vastu plan items" description="Add direction-based product placements for this client." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-100">
                          <th className="table-header text-left">Direction</th>
                          <th className="table-header text-left">Product</th>
                          <th className="table-header text-center">Qty</th>
                          <th className="table-header text-left">Status</th>
                          <th className="table-header text-left">Notes</th>
                          <th className="table-header" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {vastuPlans.map(vp => (
                          <tr key={vp.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="table-cell">
                              <span className="flex items-center gap-1.5 font-semibold text-primary-700 text-xs">
                                <Compass className="w-3 h-3" />{vp.direction || '—'}
                              </span>
                            </td>
                            <td className="table-cell">
                              <p className="text-sm font-medium text-neutral-800">{vp.product_name}</p>
                            </td>
                            <td className="table-cell text-center">
                              <span className="font-bold text-neutral-800">{vp.quantity}</span>
                            </td>
                            <td className="table-cell">
                              <span className={`badge text-[10px] capitalize ${getVastuStatusColor(vp.status)}`}>{vp.status}</span>
                            </td>
                            <td className="table-cell max-w-[140px]">
                              <p className="text-xs text-neutral-500 truncate">{vp.notes || '—'}</p>
                            </td>
                            <td className="table-cell">
                              <ActionMenu items={[
                                actionEdit(() => { setEditingVastu(vp); setVastuForm({ direction: vp.direction, product_id: vp.product_id || '', product_name: vp.product_name, quantity: vp.quantity, notes: vp.notes || '', status: vp.status }); setShowVastuModal(true); }),
                                actionDelete(() => setConfirmDeleteVastu(vp)),
                              ]} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {profileTab === 'appointments' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-800">Appointments</h3>
                  <button onClick={() => { setEditingAppt(null); setApptForm({ title: '', appointment_type: 'Consultation', date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '10:00', location: '', city: '', notes: '' }); setShowApptModal(true); }} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Schedule</button>
                </div>
                {appointments.length === 0 ? (
                  <EmptyState icon={Calendar} title="No appointments" description="Schedule a consultation or meeting." />
                ) : (
                  <div className="space-y-2">
                    {appointments.map(appt => (
                      <div key={appt.id} className={`border rounded-xl p-3 ${APPT_COLORS[appt.appointment_type] || 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium capitalize">{appt.appointment_type}</span>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${appt.status === 'completed' ? 'bg-success-50 text-success-600' : appt.status === 'cancelled' ? 'bg-error-50 text-error-600' : 'bg-white/60'}`}>{appt.status}</span>
                            <ActionMenu items={[
                              actionEdit(() => handleEditAppt(appt)),
                              actionDelete(() => setConfirmDeleteAppt(appt)),
                            ]} />
                          </div>
                        </div>
                        <p className="text-sm font-semibold">{appt.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-xs opacity-75"><Clock className="w-3 h-3" />{formatDate(appt.start_time)} · {formatTime(appt.start_time)}</span>
                          {appt.location && <span className="flex items-center gap-1 text-xs opacity-75"><MapPin className="w-3 h-3" />{appt.location}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {profileTab === 'documents' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-800">Documents & Files</h3>
                  <div className="flex items-center gap-2">
                    <select value={docTag} onChange={e => setDocTag(e.target.value)} className="input text-xs py-1 px-2 h-auto">
                      {['Palm Reading', 'Floor Plan', 'Report', 'Horoscope Chart', 'Photo', 'Other'].map(t => <option key={t}>{t}</option>)}
                    </select>
                    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${uploadingDoc ? 'bg-neutral-200 text-neutral-400' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
                      {uploadingDoc ? 'Uploading...' : <><Upload className="w-3.5 h-3.5" /> Upload</>}
                      <input type="file" className="hidden" multiple disabled={uploadingDoc}
                        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
                        onChange={async e => {
                          const fileList = Array.from(e.target.files || []);
                          for (const f of fileList) {
                            if (selectedCustomer) await handleUploadDoc(f, selectedCustomer.id);
                          }
                          e.target.value = '';
                        }} />
                    </label>
                  </div>
                </div>
                {documents.length === 0 ? (
                  <div className="flex flex-col items-center py-10 border-2 border-dashed border-neutral-200 rounded-xl">
                    <Upload className="w-8 h-8 text-neutral-300 mb-2" />
                    <p className="text-sm font-medium text-neutral-500">No documents uploaded yet</p>
                    <p className="text-xs text-neutral-400 mt-1">Upload palm images, floor plans, reports, or horoscope charts</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {documents.map(doc => {
                      const isImage = doc.file_type.startsWith('image/');
                      const isPdf = doc.file_type === 'application/pdf';
                      return (
                        <div key={doc.id} className="border border-neutral-200 rounded-xl overflow-hidden group hover:border-primary-300 hover:shadow-card transition-all">
                          <div className="w-full h-24 bg-neutral-100 flex items-center justify-center cursor-pointer relative"
                            onClick={() => setPreviewDoc({ url: doc.file_url, type: doc.file_type, name: doc.file_name })}>
                            {isImage ? (
                              <img src={doc.file_url} alt={doc.file_name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <FileText className="w-8 h-8 text-neutral-400" />
                                <span className="text-[9px] text-neutral-400 uppercase">{isPdf ? 'PDF' : doc.file_type.split('/')[1]?.toUpperCase() || 'FILE'}</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                className="w-7 h-7 bg-white rounded-full flex items-center justify-center hover:bg-neutral-100">
                                <Download className="w-3.5 h-3.5 text-neutral-700" />
                              </a>
                              <button onClick={e => { e.stopPropagation(); setConfirmDeleteDoc({ id: doc.id, file_path: doc.file_url }); }}
                                className="w-7 h-7 bg-white rounded-full flex items-center justify-center hover:bg-error-50">
                                <Hash className="w-3.5 h-3.5 text-error-600" />
                              </button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-neutral-800 truncate">{doc.file_name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[9px] px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded font-medium">{doc.tag}</span>
                              <span className="text-[9px] text-neutral-400">{formatDate(doc.created_at)}</span>
                            </div>
                            {doc.notes && <p className="text-[10px] text-neutral-400 truncate mt-0.5">{doc.notes}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {profileTab === 'recommendations' && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-neutral-800">Product Recommendations</h3>
                  <button onClick={() => { setEditingRecommend(null); setRecommendForm({ product_name: '', product_id: '', direction: '', recommended_quantity: 1, notes: '', status: 'pending' }); setShowRecommendModal(true); }} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add</button>
                </div>
                {recommendations.length === 0 ? (
                  <EmptyState icon={Package} title="No recommendations" description="Add product or gemstone recommendations for this client." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-100">
                          <th className="table-header text-left">Product</th>
                          <th className="table-header text-left">Direction</th>
                          <th className="table-header text-left">Qty</th>
                          <th className="table-header text-left">Status</th>
                          <th className="table-header text-left">Date</th>
                          <th className="table-header" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {recommendations.map(rec => (
                          <tr key={rec.id} className="hover:bg-neutral-50 transition-colors">
                            <td className="table-cell font-medium">{rec.product_name}</td>
                            <td className="table-cell text-xs text-neutral-600">{rec.direction || '—'}</td>
                            <td className="table-cell text-xs font-medium">{rec.recommended_quantity}</td>
                            <td className="table-cell"><span className={`badge text-[10px] capitalize ${getRecommendStatusColor(rec.status)}`}>{rec.status}</span></td>
                            <td className="table-cell text-xs text-neutral-500">{formatDate(rec.recommended_date)}</td>
                            <td className="table-cell">
                              <ActionMenu items={[
                                actionEdit(() => { setEditingRecommend(rec); setRecommendForm({ product_name: rec.product_name, product_id: rec.product_id || '', direction: rec.direction || '', recommended_quantity: rec.recommended_quantity, notes: rec.notes || '', status: rec.status }); setShowRecommendModal(true); }),
                                actionDelete(() => setConfirmDeleteRecommend(rec)),
                              ]} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {profileTab === 'sales' && (
              <div className="space-y-4">
                <div className="flex gap-1 bg-white border border-neutral-200 rounded-xl p-1 w-fit">
                  {(['orders','invoices','payments'] as SalesSubTab[]).map(tab => (
                    <button key={tab} onClick={() => setSalesSubTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${salesSubTab === tab ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:bg-neutral-50'}`}>
                      {tab === 'orders' ? 'Sales Orders' : tab === 'invoices' ? 'Invoices' : 'Payments'}
                    </button>
                  ))}
                </div>

                {salesSubTab === 'orders' && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-neutral-800 mb-4">Sales Orders</h3>
                    {customerOrders.length === 0 ? (
                      <EmptyState icon={ShoppingCart} title="No sales orders" description="No sales orders found for this client." />
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="table-header text-left">Order #</th>
                            <th className="table-header text-left">Date</th>
                            <th className="table-header text-left">Status</th>
                            <th className="table-header text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {customerOrders.map(order => (
                            <tr key={order.id} className="hover:bg-neutral-50">
                              <td className="table-cell font-semibold text-primary-700">{order.so_number}</td>
                              <td className="table-cell text-xs text-neutral-500">{formatDate(order.so_date)}</td>
                              <td className="table-cell"><StatusBadge status={order.status} /></td>
                              <td className="table-cell text-right font-bold">{formatCurrency(order.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {salesSubTab === 'invoices' && (
                  <div className="card">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-neutral-800">Invoices</h3>
                      <p className="text-xs text-neutral-400">Filtered by date range</p>
                    </div>
                    {filteredInvoices.length === 0 ? (
                      <EmptyState icon={Receipt} title="No invoices" description="No invoices found for this client in the selected period." />
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="table-header text-left">Invoice #</th>
                            <th className="table-header text-left">Date</th>
                            <th className="table-header text-left">Status</th>
                            <th className="table-header text-right">Total</th>
                            <th className="table-header text-right">Outstanding</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {filteredInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-neutral-50">
                              <td className="table-cell font-semibold text-primary-700">{inv.invoice_number}</td>
                              <td className="table-cell text-xs text-neutral-500">{formatDate(inv.invoice_date)}</td>
                              <td className="table-cell"><StatusBadge status={inv.status} /></td>
                              <td className="table-cell text-right font-bold">{formatCurrency(inv.total_amount)}</td>
                              <td className="table-cell text-right">
                                {inv.outstanding_amount > 0
                                  ? <span className="text-xs font-semibold text-error-600">{formatCurrency(inv.outstanding_amount)}</span>
                                  : <span className="text-xs font-semibold text-success-600">Paid</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {salesSubTab === 'payments' && (
                  <div className="card">
                    <h3 className="text-sm font-semibold text-neutral-800 mb-4">Payments Received</h3>
                    {customerPayments.length === 0 ? (
                      <EmptyState icon={TrendingUp} title="No payments" description="No payments recorded for this client." />
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-neutral-100">
                            <th className="table-header text-left">Payment #</th>
                            <th className="table-header text-left">Date</th>
                            <th className="table-header text-left">Mode</th>
                            <th className="table-header text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                          {customerPayments.map(pay => (
                            <tr key={pay.id} className="hover:bg-neutral-50">
                              <td className="table-cell font-semibold text-primary-700">{pay.payment_number}</td>
                              <td className="table-cell text-xs text-neutral-500">{formatDate(pay.payment_date)}</td>
                              <td className="table-cell"><span className="badge text-[10px] bg-neutral-100 text-neutral-600">{pay.payment_mode}</span></td>
                              <td className="table-cell text-right font-bold text-success-600">{formatCurrency(pay.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            )}

            {profileTab === 'rate-cards' && (
              <div className="space-y-4">
                <div className="card">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-800">Custom Rate Cards</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Override the default selling price per product for this customer</p>
                    </div>
                    <button onClick={() => { setRateCardForm({ product_id: '', custom_rate: '' }); setShowRateCardModal(true); }} className="btn-primary text-xs">
                      <Plus className="w-3.5 h-3.5" /> Add Rate
                    </button>
                  </div>
                  {rateCards.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-neutral-500">No custom rates set</p>
                      <p className="text-xs text-neutral-400 mt-1">Default product selling prices are used. Add custom rates to override per product.</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-neutral-100">
                          <th className="table-header text-left">Product</th>
                          <th className="table-header text-left">Unit</th>
                          <th className="table-header text-right">Standard Price</th>
                          <th className="table-header text-right">Custom Rate</th>
                          <th className="table-header text-right">Diff</th>
                          <th className="table-header text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-50">
                        {rateCards.map(rc => {
                          const std = rc.products?.selling_price || 0;
                          const diff = rc.custom_rate - std;
                          return (
                            <tr key={rc.id} className="hover:bg-neutral-50">
                              <td className="table-cell font-medium text-neutral-800">{rc.products?.name || '—'}</td>
                              <td className="table-cell text-xs text-neutral-500">{rc.products?.unit || '—'}</td>
                              <td className="table-cell text-right text-xs text-neutral-500">{formatCurrency(std)}</td>
                              <td className="table-cell text-right font-bold text-primary-700">{formatCurrency(rc.custom_rate)}</td>
                              <td className="table-cell text-right text-xs">
                                <span className={diff < 0 ? 'text-success-600' : diff > 0 ? 'text-error-600' : 'text-neutral-400'}>
                                  {diff !== 0 ? (diff > 0 ? '+' : '') + formatCurrency(diff) : '—'}
                                </span>
                              </td>
                              <td className="table-cell text-right">
                                <button
                                  onClick={() => handleDeleteRateCard(rc.id)}
                                  className="p-1 rounded hover:bg-error-50 text-neutral-400 hover:text-error-600 transition-colors"
                                  title="Remove custom rate">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="card">
              <h3 className="text-sm font-semibold text-neutral-800 mb-3">Business Summary</h3>
              <div className="space-y-3">
                {[
                  { label: 'Total Revenue', value: formatCurrency(totalRevenue), color: 'text-primary-700 text-lg font-bold' },
                  { label: 'Outstanding Balance', value: `${formatCurrency(Math.abs(selectedCustomer.balance))} ${selectedCustomer.balance > 0 ? '(Receivable)' : '(Clear)'}`, color: selectedCustomer.balance > 0 ? 'text-error-600 text-sm font-semibold' : 'text-success-600 text-sm font-semibold' },
                  { label: 'Project Value', value: formatCurrency(selectedCustomer.project_value || 0), color: 'text-neutral-800 text-sm font-semibold' },
                  { label: 'Last Interaction', value: lastInteraction ? formatDate(lastInteraction) : 'Never', color: 'text-neutral-800 text-sm font-semibold' },
                  { label: 'Total Appointments', value: String(appointments.length), color: 'text-neutral-800 text-sm font-semibold' },
                  { label: 'Documents', value: String(documents.length), color: 'text-neutral-800 text-sm font-semibold' },
                ].map((item, i) => (
                  <div key={i} className={i > 0 ? 'border-t border-neutral-100 pt-3' : ''}>
                    <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">{item.label}</p>
                    <p className={`mt-0.5 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-neutral-800 mb-3">Contact Info</h3>
              <div className="space-y-2">
                {selectedCustomer.phone && <div className="flex items-center gap-2 text-xs text-neutral-600"><Phone className="w-3.5 h-3.5 text-neutral-400" /> {selectedCustomer.phone}</div>}
                {selectedCustomer.email && <div className="flex items-center gap-2 text-xs text-neutral-600"><Mail className="w-3.5 h-3.5 text-neutral-400" /> {selectedCustomer.email}</div>}
                {selectedCustomer.address && (
                  <div className="flex items-start gap-2 text-xs text-neutral-600">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400 mt-0.5" />
                    <span>{selectedCustomer.address}{selectedCustomer.city ? `, ${selectedCustomer.city}` : ''}</span>
                  </div>
                )}
                {selectedCustomer.gstin && <div className="text-xs text-neutral-500">GSTIN: <span className="font-mono">{selectedCustomer.gstin}</span></div>}
              </div>
            </div>

            {selectedCustomer.notes && (
              <div className="card bg-accent-50 border-accent-100">
                <p className="text-xs font-semibold text-accent-700 mb-2">Notes</p>
                <p className="text-xs text-neutral-700 italic">"{selectedCustomer.notes}"</p>
              </div>
            )}
          </div>
        </div>

        <Modal isOpen={showNoteModal} onClose={() => { setShowNoteModal(false); setEditingNote(null); }} title={editingNote ? 'Edit Interaction' : 'Add Interaction'} size="md"
          footer={<><button onClick={() => { setShowNoteModal(false); setEditingNote(null); }} className="btn-secondary">Cancel</button><button onClick={handleSaveNote} className="btn-primary">{editingNote ? 'Update' : 'Save'}</button></>}>
          <div className="space-y-3">
            <div>
              <label className="label">Interaction Type</label>
              <select value={noteForm.note_type} onChange={e => setNoteForm(f => ({ ...f, note_type: e.target.value }))} className="input">
                {['Note','Call','Meeting','WhatsApp','Site Visit','Vastu Visit','Astro Reading','Gemstone Reading','Follow Up'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Title *</label>
              <input value={noteForm.title} onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="Brief title..." />
            </div>
            <div>
              <label className="label">Details</label>
              <textarea value={noteForm.content} onChange={e => setNoteForm(f => ({ ...f, content: e.target.value }))} className="input resize-none h-28" placeholder="Detailed notes..." />
            </div>
          </div>
        </Modal>

        <Modal isOpen={showApptModal} onClose={() => { setShowApptModal(false); setEditingAppt(null); }} title={editingAppt ? 'Edit Appointment' : 'Schedule Appointment'} size="md"
          footer={<><button onClick={() => { setShowApptModal(false); setEditingAppt(null); }} className="btn-secondary">Cancel</button><button onClick={handleSaveAppt} className="btn-primary">{editingAppt ? 'Update' : 'Schedule'}</button></>}>
          <div className="space-y-3">
            <div>
              <label className="label">Title *</label>
              <input value={apptForm.title} onChange={e => setApptForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="e.g., Vastu Foundation Audit" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select value={apptForm.appointment_type} onChange={e => setApptForm(f => ({ ...f, appointment_type: e.target.value as Appointment['appointment_type'] }))} className="input">
                  {['Astro Reading','Vastu Audit','Consultation','Follow Up','Site Visit','Video Call','Phone Call'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Start Time</label>
                <input type="time" value={apptForm.start_time} onChange={e => setApptForm(f => ({ ...f, start_time: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">End Time</label>
                <input type="time" value={apptForm.end_time} onChange={e => setApptForm(f => ({ ...f, end_time: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">Location</label>
                <input value={apptForm.location} onChange={e => setApptForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Address or Online" />
              </div>
              <div>
                <label className="label">City</label>
                <input value={apptForm.city} onChange={e => setApptForm(f => ({ ...f, city: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea value={apptForm.notes} onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
            </div>
          </div>
        </Modal>

        <Modal isOpen={showVastuModal} onClose={() => { setShowVastuModal(false); setEditingVastu(null); }} title={editingVastu ? 'Edit Vastu Item' : 'Add Vastu Plan Item'} size="md"
          footer={<><button onClick={() => { setShowVastuModal(false); setEditingVastu(null); }} className="btn-secondary">Cancel</button><button onClick={handleSaveVastu} className="btn-primary">{editingVastu ? 'Update' : 'Add Item'}</button></>}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Direction / Placement *</label>
                <input value={vastuForm.direction} onChange={e => setVastuForm(f => ({ ...f, direction: e.target.value }))} className="input" placeholder="e.g., North-East, Entrance..." />
              </div>
              <div>
                <label className="label">Quantity</label>
                <input type="number" min={0.1} step={0.1} value={vastuForm.quantity} onChange={e => setVastuForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 1 }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Link to Inventory Product</label>
              <select value={vastuForm.product_id} onChange={e => {
                const sel = products.find(p => p.id === e.target.value);
                setVastuForm(f => ({ ...f, product_id: e.target.value, product_name: sel ? sel.name : f.product_name }));
              }} className="input">
                <option value="">-- Select from Inventory --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Product Name *</label>
              <input value={vastuForm.product_name} onChange={e => setVastuForm(f => ({ ...f, product_name: e.target.value }))} className="input" placeholder="e.g., Vastu Pyramid, Crystal..." />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={vastuForm.status} onChange={e => setVastuForm(f => ({ ...f, status: e.target.value as VastuPlan['status'] }))} className="input">
                <option value="pending">Pending</option>
                <option value="ordered">Ordered</option>
                <option value="installed">Installed</option>
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea value={vastuForm.notes} onChange={e => setVastuForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" placeholder="Placement instructions, size, color preference..." />
            </div>
          </div>
        </Modal>

        <Modal isOpen={showConvertSOModal} onClose={() => setShowConvertSOModal(false)} title="Convert Vastu Plan to Sales Order" size="md"
          footer={<><button onClick={() => setShowConvertSOModal(false)} className="btn-secondary">Cancel</button><button onClick={handleConvertVastuToSO} disabled={convertingSO} className="btn-primary">{convertingSO ? 'Creating...' : 'Create Sales Order'}</button></>}>
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">The following Vastu plan items will be converted to a draft Sales Order for <strong>{selectedCustomer?.name}</strong>. Prices will be set to 0 and you can update them in Sales Orders.</p>
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className="text-left text-[10px] font-semibold text-neutral-400 uppercase p-3">Direction</th>
                    <th className="text-left text-[10px] font-semibold text-neutral-400 uppercase p-3">Product</th>
                    <th className="text-center text-[10px] font-semibold text-neutral-400 uppercase p-3">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {vastuPlans.map(vp => (
                    <tr key={vp.id} className="border-b border-neutral-100 last:border-0">
                      <td className="p-3 text-xs font-semibold text-primary-700">{vp.direction || '—'}</td>
                      <td className="p-3 text-sm text-neutral-800">{vp.product_name}</td>
                      <td className="p-3 text-center text-sm font-bold">{vp.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>

        <Modal isOpen={showRecommendModal} onClose={() => { setShowRecommendModal(false); setEditingRecommend(null); }} title={editingRecommend ? 'Edit Recommendation' : 'Add Recommendation'} size="md"
          footer={<><button onClick={() => { setShowRecommendModal(false); setEditingRecommend(null); }} className="btn-secondary">Cancel</button><button onClick={handleSaveRecommendation} className="btn-primary">{editingRecommend ? 'Update' : 'Save'}</button></>}>
          <div className="space-y-3">
            <div>
              <label className="label">Product Name *</label>
              <input value={recommendForm.product_name} onChange={e => setRecommendForm(f => ({ ...f, product_name: e.target.value }))} className="input" placeholder="e.g., Blue Sapphire, Vastu Pyramid..." />
            </div>
            <div>
              <label className="label">Link to Product (Optional)</label>
              <select value={recommendForm.product_id} onChange={e => {
                const selected = products.find(p => p.id === e.target.value);
                setRecommendForm(f => ({ ...f, product_id: e.target.value, product_name: selected ? selected.name : f.product_name, direction: selected?.direction || f.direction }));
              }} className="input">
                <option value="">-- Select from Inventory --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Direction / Placement</label>
                <input value={recommendForm.direction} onChange={e => setRecommendForm(f => ({ ...f, direction: e.target.value }))} className="input" placeholder="e.g., North-East..." />
              </div>
              <div>
                <label className="label">Quantity</label>
                <input type="number" min={1} value={recommendForm.recommended_quantity} onChange={e => setRecommendForm(f => ({ ...f, recommended_quantity: parseInt(e.target.value) || 1 }))} className="input" />
              </div>
              <div>
                <label className="label">Status</label>
                <select value={recommendForm.status} onChange={e => setRecommendForm(f => ({ ...f, status: e.target.value as ProductRecommendation['status'] }))} className="input">
                  <option value="pending">Pending</option>
                  <option value="ordered">Ordered</option>
                  <option value="delivered">Delivered</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea value={recommendForm.notes} onChange={e => setRecommendForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
            </div>
          </div>
        </Modal>

        <Modal isOpen={showEditCustomerModal} onClose={() => setShowEditCustomerModal(false)} title="Edit Client" size="lg"
          footer={<><button onClick={() => setShowEditCustomerModal(false)} className="btn-secondary">Cancel</button><button onClick={handleUpdateCustomer} className="btn-primary">Save Changes</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Name *</label>
              <input value={editCustomerForm.name} onChange={e => setEditCustomerForm(f => ({ ...f, name: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={editCustomerForm.phone} onChange={e => setEditCustomerForm(f => ({ ...f, phone: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Alt. Phone</label>
              <input value={editCustomerForm.alt_phone} onChange={e => setEditCustomerForm(f => ({ ...f, alt_phone: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={editCustomerForm.email} onChange={e => setEditCustomerForm(f => ({ ...f, email: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">PIN Code</label>
              <input value={editCustomerForm.pincode} onChange={e => setEditCustomerForm(f => ({ ...f, pincode: e.target.value }))} className="input" placeholder="PIN Code" />
            </div>
            <div>
              <label className="label">State</label>
              <select value={editCustomerForm.state} onChange={e => setEditCustomerForm(f => ({ ...f, state: e.target.value, city: '' }))} className="input">
                <option value="">-- Select State --</option>
                {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">City</label>
              {STATE_CITIES[editCustomerForm.state] ? (
                <select value={editCustomerForm.city} onChange={e => setEditCustomerForm(f => ({ ...f, city: e.target.value }))} className="input">
                  <option value="">-- Select City --</option>
                  {STATE_CITIES[editCustomerForm.state].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <input value={editCustomerForm.city} onChange={e => setEditCustomerForm(f => ({ ...f, city: e.target.value }))} className="input" placeholder="City" />
              )}
            </div>
            <div className="col-span-2">
              <label className="label">Address Line 1</label>
              <input value={editCustomerForm.address} onChange={e => setEditCustomerForm(f => ({ ...f, address: e.target.value }))} className="input" placeholder="Street / House No." />
            </div>
            <div className="col-span-2">
              <label className="label">Address Line 2</label>
              <input value={editCustomerForm.address2} onChange={e => setEditCustomerForm(f => ({ ...f, address2: e.target.value }))} className="input" placeholder="Area / Landmark" />
            </div>
            <div>
              <label className="label">Customer Type</label>
              <select value={editCustomerForm.category} onChange={e => setEditCustomerForm(f => ({ ...f, category: e.target.value as 'B2B' | 'B2C' }))} className="input">
                <option value="B2C">B2C (Individual Client)</option>
                <option value="B2B">B2B (Astrologer / Reseller)</option>
              </select>
            </div>
            <div>
              <label className="label">Conversion Stage</label>
              <select value={editCustomerForm.conversion_stage} onChange={e => setEditCustomerForm(f => ({ ...f, conversion_stage: e.target.value as Customer['conversion_stage'] }))} className="input">
                {CONVERSION_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project Value (₹)</label>
              <input type="number" value={editCustomerForm.project_value} onChange={e => setEditCustomerForm(f => ({ ...f, project_value: e.target.value }))} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Next Follow-up Date</label>
              <input type="date" value={editCustomerForm.next_followup_date} onChange={e => setEditCustomerForm(f => ({ ...f, next_followup_date: e.target.value }))} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input value={editCustomerForm.notes} onChange={e => setEditCustomerForm(f => ({ ...f, notes: e.target.value }))} className="input" />
            </div>
            <div className="col-span-2">
              <label className="label">Tags</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {CUSTOMER_TAGS.map(tag => (
                  <button key={tag} type="button"
                    onClick={() => setEditCustomerForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }))}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${editCustomerForm.tags.includes(tag) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300'}`}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>

        {previewDoc && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewDoc(null)}>
            <div className="bg-white rounded-2xl overflow-hidden max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                <p className="text-sm font-semibold text-neutral-800 truncate">{previewDoc.name}</p>
                <div className="flex items-center gap-2">
                  <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1"><Download className="w-3.5 h-3.5" /> Download</a>
                  <button onClick={() => setPreviewDoc(null)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-600 text-lg font-light">×</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-neutral-50">
                {previewDoc.type.startsWith('image/') ? (
                  <img src={previewDoc.url} alt={previewDoc.name} className="max-w-full max-h-full object-contain rounded-lg" />
                ) : previewDoc.type === 'application/pdf' ? (
                  <iframe src={previewDoc.url} className="w-full h-96 rounded-lg border border-neutral-200" title={previewDoc.name} />
                ) : (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-neutral-400 mx-auto mb-3" />
                    <p className="text-sm text-neutral-600">Preview not available for this file type</p>
                    <a href={previewDoc.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 btn-primary text-xs">
                      <Download className="w-3.5 h-3.5" /> Download to view
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <Modal isOpen={showRateCardModal} onClose={() => setShowRateCardModal(false)} title="Add Custom Rate" size="sm"
          footer={
            <>
              <button onClick={() => setShowRateCardModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSaveRateCard} disabled={!rateCardForm.product_id} className="btn-primary disabled:opacity-50">Save Rate</button>
            </>
          }>
          <div className="space-y-3">
            <div>
              <label className="label">Product</label>
              <select value={rateCardForm.product_id} onChange={e => { setRateCardForm(f => ({ ...f, product_id: e.target.value, custom_rate: String(products.find(p => p.id === e.target.value)?.selling_price || '') })); }} className="input">
                <option value="">-- Select Product --</option>
                {products.filter(p => !rateCards.find(rc => rc.product_id === p.id)).map(p => (
                  <option key={p.id} value={p.id}>{p.name} (Default: {formatCurrency(p.selling_price)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Custom Rate (₹)</label>
              <input type="number" value={rateCardForm.custom_rate} onChange={e => setRateCardForm(f => ({ ...f, custom_rate: e.target.value }))} className="input" placeholder="0" />
              {rateCardForm.product_id && (
                <p className="text-xs text-neutral-400 mt-1">Standard price: {formatCurrency(products.find(p => p.id === rateCardForm.product_id)?.selling_price || 0)}</p>
              )}
            </div>
          </div>
        </Modal>

        <ConfirmDialog isOpen={confirmDeactivate} onClose={() => setConfirmDeactivate(false)} onConfirm={handleDeactivateCustomer} title="Deactivate Client" message={`Are you sure you want to deactivate ${selectedCustomer.name}?`} confirmLabel="Deactivate" isDanger />
        <ConfirmDialog isOpen={!!confirmDeleteNote} onClose={() => setConfirmDeleteNote(null)} onConfirm={handleDeleteNote} title="Delete Note" message="Delete this note permanently?" confirmLabel="Delete" isDanger />
        <ConfirmDialog isOpen={!!confirmDeleteAppt} onClose={() => setConfirmDeleteAppt(null)} onConfirm={handleDeleteAppt} title="Delete Appointment" message="Delete this appointment permanently?" confirmLabel="Delete" isDanger />
        <ConfirmDialog isOpen={!!confirmDeleteDoc} onClose={() => setConfirmDeleteDoc(null)} onConfirm={handleDeleteDoc} title="Delete Document" message="Delete this document permanently? This cannot be undone." confirmLabel="Delete" isDanger />
        <ConfirmDialog isOpen={!!confirmDeleteRecommend} onClose={() => setConfirmDeleteRecommend(null)} onConfirm={async () => { if (!confirmDeleteRecommend || !selectedCustomer) return; await supabase.from('product_recommendations').delete().eq('id', confirmDeleteRecommend.id); setConfirmDeleteRecommend(null); loadCustomerDetail(selectedCustomer); }} title="Delete Recommendation" message="Delete this recommendation permanently?" confirmLabel="Delete" isDanger />
        <ConfirmDialog isOpen={!!confirmDeleteVastu} onClose={() => setConfirmDeleteVastu(null)} onConfirm={handleDeleteVastu} title="Delete Vastu Item" message="Delete this Vastu plan item permanently?" confirmLabel="Delete" isDanger />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Customer Projects</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Project-based client management system</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'clients' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." className="input pl-8 w-56 text-xs" />
              </div>
              <button onClick={handleExportCSV} className="btn-secondary text-xs"><Download className="w-3.5 h-3.5" /> Export</button>
              <button onClick={() => { setForm({ name: '', phone: '', alt_phone: '', email: '', address: '', address2: '', city: '', state: '', pincode: '', category: 'B2C', notes: '', tags: [] }); setShowAddModal(true); }} className="btn-primary">
                <Plus className="w-4 h-4" /> Add Client
              </button>
            </>
          )}
          {activeTab === 'calendar' && (
            <>
              <button onClick={() => setShowTravelModal(true)} className="btn-secondary text-xs">+ Travel Plan</button>
              <button onClick={() => { setCalApptForm({ title: '', customer_id: '', appointment_type: 'Consultation', date: selectedCalDate.toISOString().split('T')[0], start_time: '09:00', end_time: '10:00', location: '', city: '', notes: '' }); setShowCalApptModal(true); }} className="btn-primary">
                <Plus className="w-4 h-4" /> Schedule
              </button>
            </>
          )}
        </div>
      </div>

      {todayFollowups.length > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-3 p-3 bg-warning-50 border border-warning-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-warning-600 shrink-0" />
          <p className="text-sm font-medium text-warning-800">
            <span className="font-bold">{todayFollowups.length} follow-up{todayFollowups.length > 1 ? 's' : ''} due today:</span>{' '}
            {todayFollowups.map(c => c.name).join(', ')}
          </p>
        </div>
      )}

      <div className="px-6 pt-4">
        <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
          <button onClick={() => setActiveTab('clients')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === 'clients' ? 'bg-white text-primary-700 shadow-card' : 'text-neutral-500 hover:text-neutral-700'}`}>
            <Users className="w-3.5 h-3.5" /> Clients
          </button>
          <button onClick={() => setActiveTab('calendar')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === 'calendar' ? 'bg-white text-primary-700 shadow-card' : 'text-neutral-500 hover:text-neutral-700'}`}>
            <Calendar className="w-3.5 h-3.5" /> Calendar
          </button>
        </div>
      </div>

      {activeTab === 'clients' && (
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {['All','B2B','B2C'].map(c => (
              <button key={c} onClick={() => setCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${category === c ? 'bg-primary-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                {c === 'All' ? 'All' : c}
              </button>
            ))}
            <div className="w-px h-4 bg-neutral-200" />
            {['All',...CONVERSION_STAGES].map(s => (
              <button key={s} onClick={() => setStageFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${stageFilter === s ? 'bg-neutral-800 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                {s === 'All' ? 'All Stages' : s}
              </button>
            ))}
            <span className="ml-auto text-xs text-neutral-400">{filtered.length} clients</span>
          </div>

          {filtered.length === 0 && <EmptyState icon={Users} title="No clients found" description="Add your first client to get started." />}

          <div className="grid grid-cols-3 gap-4">
            {filtered.map(c => (
              <div key={c.id} onClick={() => loadCustomerDetail(c)}
                className="card cursor-pointer hover:shadow-card-md hover:border-primary-200 transition-all duration-150 group">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary-700">{getInitials(c.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-neutral-900 group-hover:text-primary-700 transition-colors truncate">{c.name}</p>
                      <span className={`badge text-[10px] ${c.category === 'B2B' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}>{c.category}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {c.phone && <p className="text-xs text-neutral-500 flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</p>}
                      {c.city && <p className="text-xs text-neutral-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{c.city}</p>}
                    </div>
                  </div>
                  {c.customer_score !== undefined && c.customer_score > 0 && (
                    <div className="shrink-0 text-center">
                      <p className="text-[10px] text-neutral-400">Score</p>
                      <p className="text-sm font-bold text-primary-700">{c.customer_score}</p>
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.conversion_stage && (
                      <span className={`badge text-[10px] ${STAGE_COLORS[c.conversion_stage] || 'bg-neutral-100 text-neutral-600'}`}>
                        {c.conversion_stage}
                      </span>
                    )}
                    {c.next_followup_date === todayStr && (
                      <span className="badge text-[10px] bg-warning-50 text-warning-600">
                        <AlertCircle className="w-2.5 h-2.5 mr-0.5" />Follow-up today
                      </span>
                    )}
                  </div>
                  {c.total_revenue > 0 && <span className="text-xs font-semibold text-primary-700 shrink-0">{formatCurrency(c.total_revenue)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="p-6 grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                  <ChevronLeft className="w-4 h-4 text-neutral-600" />
                </button>
                <h2 className="text-base font-semibold text-neutral-900">{MONTHS[calDate.getMonth()]} {calDate.getFullYear()}</h2>
                <button onClick={() => setCalDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                  <ChevronRight className="w-4 h-4 text-neutral-600" />
                </button>
              </div>
              <div className="grid grid-cols-7 mb-2">
                {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-neutral-400 uppercase py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {Array.from({ length: firstDay }).map((_,i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_,i) => {
                  const day = i + 1;
                  const dayAppts = getCalApptsByDate(day);
                  const travel = getTravelForDay(day);
                  const isToday = new Date().getDate() === day && new Date().getMonth() === calDate.getMonth() && new Date().getFullYear() === calDate.getFullYear();
                  const isSelected = selectedCalDate.getDate() === day && selectedCalDate.getMonth() === calDate.getMonth() && selectedCalDate.getFullYear() === calDate.getFullYear();
                  return (
                    <div key={day} onClick={() => setSelectedCalDate(new Date(calDate.getFullYear(), calDate.getMonth(), day))}
                      className={`min-h-16 p-1 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-primary-50 border border-primary-200' : 'hover:bg-neutral-50 border border-transparent'} ${travel ? 'ring-1 ring-accent-300' : ''}`}>
                      <p className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-primary-600 text-white' : 'text-neutral-700'}`}>{day}</p>
                      {travel && <div className="text-[8px] font-medium text-accent-700 bg-accent-100 rounded px-1 mt-0.5 truncate">{travel.city}</div>}
                      {dayAppts.slice(0,2).map(a => (
                        <div key={a.id} className={`text-[9px] font-medium rounded px-1 mt-0.5 truncate border ${APPT_COLORS[a.appointment_type] || 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                          {a.customer_name ? `${a.customer_name.split(' ')[0]}: ` : ''}{a.title}
                        </div>
                      ))}
                      {dayAppts.length > 2 && <p className="text-[9px] text-neutral-400 mt-0.5">+{dayAppts.length - 2}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-base font-semibold text-neutral-900">
                  {DAYS[selectedCalDate.getDay()]}, {MONTHS[selectedCalDate.getMonth()].slice(0,3)} {selectedCalDate.getDate()}
                </p>
                <button onClick={() => { setCalApptForm(f => ({ ...f, date: toLocalDateStr(selectedCalDate) })); setShowCalApptModal(true); }} className="w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center hover:bg-primary-700">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {selectedCalDateAppts.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-neutral-400">No appointments</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(calApptsByTravelPlan()).filter(([, appts]) => appts.length > 0).map(([groupName, appts]) => (
                    <div key={groupName}>
                      <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">{groupName}</p>
                      <div className="space-y-2">
                        {appts.map(a => (
                          <div key={a.id} className={`border rounded-xl p-3 ${APPT_COLORS[a.appointment_type] || 'bg-blue-50 border-blue-200'}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <p className="text-xs font-medium">{formatTime(a.start_time)} – {formatTime(a.end_time)}</p>
                            </div>
                            <p className="text-sm font-semibold">{a.title}</p>
                            {a.customer_name && <p className="text-xs mt-0.5 opacity-75">{a.customer_name}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <p className="text-sm font-semibold text-neutral-800 mb-3">Upcoming (7 Days)</p>
              <div className="space-y-2">
                {calAppointments.filter(a => {
                  const d = new Date(a.start_time);
                  const today = new Date();
                  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                  return diff >= 0 && diff <= 7;
                }).slice(0,5).map(a => (
                  <div key={a.id} className="flex items-start gap-2">
                    <div className="w-1 h-1 bg-primary-500 rounded-full mt-2 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-neutral-800">{a.title}</p>
                      <p className="text-[10px] text-neutral-400">{formatDate(a.start_time)} · {formatTime(a.start_time)}</p>
                      {a.customer_name && <p className="text-[10px] text-neutral-400">{a.customer_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Client" size="lg"
        footer={<><button onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button><button onClick={handleSaveCustomer} className="btn-primary">Add Client</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Full name" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input" placeholder="+91 XXXXX XXXXX" />
          </div>
          <div>
            <label className="label">Alt. Phone</label>
            <input value={form.alt_phone} onChange={e => setForm(f => ({ ...f, alt_phone: e.target.value }))} className="input" placeholder="+91 XXXXX XXXXX" />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="email@example.com" />
          </div>
          <div>
            <label className="label">PIN Code</label>
            <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} className="input" placeholder="PIN Code" />
          </div>
          <div>
            <label className="label">State</label>
            <select value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value, city: '' }))} className="input">
              <option value="">-- Select State --</option>
              {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">City</label>
            {STATE_CITIES[form.state] ? (
              <select value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input">
                <option value="">-- Select City --</option>
                {STATE_CITIES[form.state].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            ) : (
              <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input" placeholder="City" />
            )}
          </div>
          <div className="col-span-2">
            <label className="label">Address Line 1</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input" placeholder="Street / House No." />
          </div>
          <div className="col-span-2">
            <label className="label">Address Line 2</label>
            <input value={form.address2} onChange={e => setForm(f => ({ ...f, address2: e.target.value }))} className="input" placeholder="Area / Landmark" />
          </div>
          <div>
            <label className="label">Customer Type</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as 'B2B' | 'B2C' }))} className="input">
              <option value="B2C">B2C (Individual Client)</option>
              <option value="B2B">B2B (Astrologer / Reseller)</option>
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Quick notes..." />
          </div>
          <div className="col-span-2">
            <label className="label">Tags</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {CUSTOMER_TAGS.map(tag => (
                <button key={tag} type="button"
                  onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag] }))}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${form.tags.includes(tag) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-600 border-neutral-200 hover:border-primary-300'}`}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCalApptModal} onClose={() => setShowCalApptModal(false)} title="Schedule Appointment" size="md"
        footer={<><button onClick={() => setShowCalApptModal(false)} className="btn-secondary">Cancel</button><button onClick={handleSaveCalAppt} className="btn-primary">Schedule</button></>}>
        <div className="space-y-3">
          <div>
            <label className="label">Title *</label>
            <input value={calApptForm.title} onChange={e => setCalApptForm(f => ({ ...f, title: e.target.value }))} className="input" placeholder="e.g., Vastu Audit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Type</label>
              <select value={calApptForm.appointment_type} onChange={e => setCalApptForm(f => ({ ...f, appointment_type: e.target.value as Appointment['appointment_type'] }))} className="input">
                {['Astro Reading','Vastu Audit','Consultation','Follow Up','Site Visit','Video Call','Phone Call'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Client</label>
              <select value={calApptForm.customer_id} onChange={e => setCalApptForm(f => ({ ...f, customer_id: e.target.value }))} className="input">
                <option value="">-- Select Client --</option>
                {calCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={calApptForm.date} onChange={e => setCalApptForm(f => ({ ...f, date: e.target.value }))} className="input" />
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <label className="label">Start</label>
                <input type="time" value={calApptForm.start_time} onChange={e => setCalApptForm(f => ({ ...f, start_time: e.target.value }))} className="input" />
              </div>
              <div>
                <label className="label">End</label>
                <input type="time" value={calApptForm.end_time} onChange={e => setCalApptForm(f => ({ ...f, end_time: e.target.value }))} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Location</label>
              <input value={calApptForm.location} onChange={e => setCalApptForm(f => ({ ...f, location: e.target.value }))} className="input" placeholder="Address or Online" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={calApptForm.city} onChange={e => setCalApptForm(f => ({ ...f, city: e.target.value }))} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={calApptForm.notes} onChange={e => setCalApptForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTravelModal} onClose={() => setShowTravelModal(false)} title="Add Travel Plan" size="sm"
        footer={<><button onClick={() => setShowTravelModal(false)} className="btn-secondary">Cancel</button><button onClick={handleSaveTravelPlan} className="btn-primary">Save</button></>}>
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
    </div>
  );
}
