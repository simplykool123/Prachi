import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Search, FileText, ChevronDown, ChevronRight, Receipt, Truck, Download, Eye, Pencil, Trash2, Printer, Send, Warehouse, ArrowRight, XCircle, X, MoreVertical } from 'lucide-react';
import { INDIA_STATES } from '../../lib/indiaData';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { supabase, getSessionWithRetry, runQueryWithGlobalRecovery } from '../../lib/supabase';
import { formatCurrency, formatDate, generateId, nextDocNumber, exportToCSV, useVisibilityReload, getDefaultGodownId } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useDateRange } from '../../contexts/DateRangeContext';
import { createSalesOrder, createDeliveryChallan, cancelInvoice, cancelDeliveryChallan } from '../../services/documentFlowService';
import { getSmartRate } from '../../lib/rateCardService';
import { fetchGodowns } from '../../services/godownService';
import { markGemPiecesSold, revertGemPiecesSold } from '../../services/stockService';
import { fetchCompanies } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import SalesOrderPrint from './SalesOrderPrint';
import ProductCombobox from '../../components/ui/ProductCombobox';
import type { SalesOrder, SalesOrderItem, Product, ProductUnit, ProductVariant, ProductType, Customer, Godown } from '../../types';
import type { ActivePage } from '../../types';
import type { PageState } from '../../App';

interface LineItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  b2b_price: string;
  discount_pct?: string;
  total_price: number;
  godown_id: string;
  product_unit_ids?: string[];
  gemstone_weight?: number;
  variant_id?: string;
  weight_input?: string;
}

interface SalesOrdersProps {
  onNavigate: (page: ActivePage, state?: PageState) => void;
}

export default function SalesOrders({ onNavigate }: SalesOrdersProps) {
  const { dateRange } = useDateRange();
  const toast = useToast();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [godownStockMap, setGodownStockMap] = useState<Record<string, number>>({});
  const [productTotalStockMap, setProductTotalStockMap] = useState<Record<string, number>>({});
  const [variantTotalStockMap, setVariantTotalStockMap] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [rowItems, setRowItems] = useState<Record<string, SalesOrderItem[]>>({});
  const [converting, setConverting] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<SalesOrder | null>(null);
  const [viewOrder, setViewOrder] = useState<SalesOrder | null>(null);
  const [viewItems, setViewItems] = useState<SalesOrderItem[]>([]);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedInfo, setLinkedInfo] = useState<{invoices: number; challans: number} | null>(null);
  const [printOrder, setPrintOrder] = useState<SalesOrder | null>(null);
  const [printItems, setPrintItems] = useState<SalesOrderItem[]>([]);
  const [printMode, setPrintMode] = useState<'normal' | 'b2b'>('normal');
  const [printCompany, setPrintCompany] = useState<Company | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [cancelSOTarget, setCancelSOTarget] = useState<SalesOrder | null>(null);
  const [openRowMenu, setOpenRowMenu] = useState<string | null>(null);
  const [lineUnits, setLineUnits] = useState<Record<number, ProductUnit[]>>({});
  const [variantsMap, setVariantsMap] = useState<Record<string, ProductVariant[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerSelectRef = useRef<HTMLSelectElement>(null);
  const shipToNameRef = useRef<HTMLInputElement>(null);
  const productRefs = useRef<Array<React.RefObject<HTMLInputElement>>>([]);
  const qtyRefs = useRef<Array<React.RefObject<HTMLInputElement>>>([]);

  const getProductRef = (i: number): React.RefObject<HTMLInputElement> => {
    if (!productRefs.current[i]) productRefs.current[i] = React.createRef<HTMLInputElement>();
    return productRefs.current[i];
  };
  const getQtyRef = (i: number): React.RefObject<HTMLInputElement> => {
    if (!qtyRefs.current[i]) qtyRefs.current[i] = React.createRef<HTMLInputElement>();
    return qtyRefs.current[i];
  };

  const [form, setForm] = useState({
    customer_id: '', customer_name: '', customer_phone: '',
    customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '',
    so_date: new Date().toISOString().split('T')[0], delivery_date: '',
    courier_charges: '0', discount_amount: '0', notes: '',
    godown_id: '',
    is_b2b: false,
    ship_to_mode: 'customer' as 'customer' | 'manual',
    ship_to_customer_id: '',
    ship_to_name: '',
    ship_to_address1: '',
    ship_to_address2: '',
    ship_to_city: '',
    ship_to_state: '',
    ship_to_pin: '',
    ship_to_phone: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', b2b_price: '', discount_pct: '0', total_price: 0, godown_id: '' }]);

  useEffect(() => { loadData(); }, []);
  useVisibilityReload(loadData);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => customerSelectRef.current?.focus(), 80);
    } else {
      productRefs.current = [];
      qtyRefs.current = [];
    }
  }, [showModal]);

  const saveActionRef = useRef<() => void>(() => {});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showModal && (e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveActionRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  useEffect(() => {
    if (!openRowMenu) return;
    const handler = () => setOpenRowMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openRowMenu]);

  const ensureSessionForApi = useCallback(async () => {
    let session = await getSessionWithRetry();
    if (!session) {
      console.log("Session missing, retrying...");
      await new Promise(r => setTimeout(r, 300));
      session = await getSessionWithRetry();
    }
    if (!session) {
      console.error("Session failed after retry");
      return null;
    }
    return session;
  }, []);

  async function loadData() {
    const session = await ensureSessionForApi();
    if (!session) return;
    const [ordersRes, productsRes, customersRes, godownsData, variantsRes, stockRes] = await Promise.all([
      runQueryWithGlobalRecovery(() => supabase.from('sales_orders').select('*').order('created_at', { ascending: false }), { allowEmpty: true, label: 'sales-orders-list' }),
      runQueryWithGlobalRecovery(() => supabase.from('products').select('id, name, unit, selling_price, weight_unit, low_stock_alert, product_type').eq('is_active', true).order('name'), { allowEmpty: true, label: 'sales-orders-products' }),
      runQueryWithGlobalRecovery(() => supabase.from('customers').select('id, name, phone, address, address2, city, state, pincode, balance, total_revenue').eq('is_active', true).order('name'), { allowEmpty: true, label: 'sales-orders-customers' }),
      fetchGodowns(),
      runQueryWithGlobalRecovery(() => supabase.from('product_variants').select('*').eq('is_active', true).order('name'), { allowEmpty: true, label: 'sales-orders-variants' }),
      runQueryWithGlobalRecovery(() => supabase.from('godown_stock').select('product_id, variant_id, quantity'), { allowEmpty: true, label: 'sales-orders-stock' }),
    ]);
    setOrders(ordersRes.data || []);
    setProducts(((productsRes.data || []) as Array<{ id: string; name: string; unit: string; selling_price: number; weight_unit?: string; low_stock_alert?: number; product_type?: string }>).map(p => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      selling_price: p.selling_price,
      sku: '',
      category: 'Astro Products' as const,
      purchase_price: 0,
      low_stock_alert: p.low_stock_alert ?? 0,
      is_active: true,
      created_at: '',
      updated_at: '',
      weight_unit: (p.weight_unit as 'grams' | 'carats' | 'kg' | undefined),
      product_type: (p.product_type as ProductType | undefined),
    })));
    const byVariant: Record<string, ProductVariant[]> = {};
    for (const v of ((variantsRes.data || []) as ProductVariant[])) {
      byVariant[v.product_id] = byVariant[v.product_id] || [];
      byVariant[v.product_id].push(v);
    }
    setVariantsMap(byVariant);
    const totalByProduct: Record<string, number> = {};
    const totalByVariant: Record<string, number> = {};
    for (const row of (stockRes.data || [])) {
      const qty = row.quantity || 0;
      totalByProduct[row.product_id] = (totalByProduct[row.product_id] || 0) + qty;
      if (row.variant_id) {
        totalByVariant[row.variant_id] = (totalByVariant[row.variant_id] || 0) + qty;
      }
    }
    setProductTotalStockMap(totalByProduct);
    setVariantTotalStockMap(totalByVariant);
    setCustomers(((customersRes.data || []) as Array<{ id: string; name: string; phone?: string; address?: string; address2?: string; city?: string; state?: string; pincode?: string; balance?: number; total_revenue?: number }>).map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      address: c.address || '',
      address2: c.address2 || '',
      city: c.city || '',
      state: c.state || '',
      pincode: c.pincode || '',
      balance: c.balance || 0,
      total_revenue: c.total_revenue || 0,
      category: 'B2C',
      tags: [],
      opening_balance: 0,
      is_active: true,
      created_at: '',
    })));
    setGodowns(godownsData);
    if (godownsData.length > 0) {
      const defaultGodownId = getDefaultGodownId(godownsData);
      setForm(f => ({ ...f, godown_id: f.godown_id || defaultGodownId }));
    }
  };

  const loadGodownStock = async (godownId: string, productIds: string[]) => {
    if (!godownId || productIds.length === 0) return;
    const session = await ensureSessionForApi();
    if (!session) return;
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    const { data, error } = await runQueryWithGlobalRecovery(() => supabase
      .from('godown_stock')
      .select('product_id, variant_id, quantity')
      .eq('godown_id', godownId)
      .in('product_id', uniqueIds), { allowEmpty: true, label: 'sales-orders-godown-stock' });
    if (error || !data) return;

    const scoped: Record<string, number> = {};
    for (const pid of uniqueIds) scoped[`${godownId}:${pid}:*`] = 0;
    for (const row of data) {
      const qty = row.quantity || 0;
      const totalKey = `${godownId}:${row.product_id}:*`;
      scoped[totalKey] = (scoped[totalKey] || 0) + qty;
      if (row.variant_id) {
        const variantKey = `${godownId}:${row.product_id}:${row.variant_id}`;
        scoped[variantKey] = (scoped[variantKey] || 0) + qty;
      }
    }
    setGodownStockMap(prev => ({ ...prev, ...scoped }));
  };

  const toggleExpand = async (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!rowItems[id]) {
        const session = await ensureSessionForApi();
        if (!session) return;
        const { data } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', id);
        setRowItems(prev => ({ ...prev, [id]: data || [] }));
      }
    }
    setExpandedRows(next);
  };

  const addItem = (focusNew = false) => {
    setItems(prev => {
      const next = [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', b2b_price: '', discount_pct: '0', total_price: 0, godown_id: getDefaultGodownId(godowns), product_unit_ids: [] }];
      if (focusNew) {
        const newIdx = next.length - 1;
        setTimeout(() => getProductRef(newIdx).current?.focus(), 30);
      }
      return next;
    });
  };
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const loadUnitsForLine = async (lineIndex: number, productId: string, godownId: string) => {
    if (!productId || !godownId) return;
    const session = await ensureSessionForApi();
    if (!session) return;
    const product = products.find(p => p.id === productId);
    if (product?.product_type !== 'gemstone') return;
    const { data } = await supabase
      .from('product_units')
      .select('*')
      .eq('product_id', productId)
      .eq('status', 'in_stock')
      .eq('godown_id', godownId)
      .order('created_at', { ascending: true });
    setLineUnits(prev => ({ ...prev, [lineIndex]: (data || []) as ProductUnit[] }));
  };

  const getProductType = (p: Product): ProductType =>
    (p.product_type as ProductType) || 'simple';

  const handleProductSelect = useCallback(async (i: number, product: Product) => {
    const pType = getProductType(product);
    setItems(prev => {
      const next = [...prev];
      next[i] = {
        ...next[i], product_id: product.id, product_name: product.name, unit: product.unit,
        unit_price: String(product.selling_price), b2b_price: String(product.selling_price),
        quantity: pType === 'gemstone' ? '0' : (pType === 'weight' ? '0' : '1'),
        product_unit_ids: [], gemstone_weight: 0, variant_id: undefined, weight_input: '',
      };
      next[i].total_price = pType === 'gemstone' || pType === 'weight' ? 0 : (product.selling_price || 0);
      return next;
    });

    const session = await ensureSessionForApi();
    if (!session) return;
    const { data: stockRows } = await supabase
      .from('godown_stock')
      .select('godown_id, quantity')
      .eq('product_id', product.id)
      .gt('quantity', 0)
      .order('quantity', { ascending: false })
      .limit(1);
    const bestGodown = stockRows?.[0]?.godown_id || getDefaultGodownId(godowns);
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], godown_id: bestGodown };
      return next;
    });
    if (bestGodown) loadGodownStock(bestGodown, [product.id]);
    if (bestGodown) loadUnitsForLine(i, product.id, bestGodown);

    if (form.customer_id) {
      const smartRate = await getSmartRate(form.customer_id, product.id, product.selling_price);
      if (smartRate !== product.selling_price) {
        setItems(prev => {
          const next = [...prev];
          next[i] = { ...next[i], unit_price: String(smartRate), total_price: product.product_type === 'gemstone' ? 0 : smartRate };
          return next;
        });
      }
    }

    setTimeout(() => {
      const qtyInput = getQtyRef(i).current;
      if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }, 30);
  }, [form.customer_id, godowns, ensureSessionForApi]);

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (i === items.length - 1) {
        addItem(true);
      } else {
        setTimeout(() => getProductRef(i + 1).current?.focus(), 20);
      }
    }
  };

  const handleCustomerKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (form.is_b2b) {
        setTimeout(() => { shipToNameRef.current?.focus(); shipToNameRef.current?.select(); }, 20);
      } else {
        setTimeout(() => getProductRef(0).current?.focus(), 20);
      }
    }
  };

  const updateItem = async (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) {
          const pType = getProductType(p);
          next[i].product_name = p.name; next[i].unit = p.unit;
          next[i].unit_price = String(p.selling_price); next[i].b2b_price = String(p.selling_price);
          next[i].product_unit_ids = []; next[i].gemstone_weight = 0;
          next[i].variant_id = undefined; next[i].weight_input = '';
          next[i].quantity = pType === 'gemstone' || pType === 'weight' ? '0' : '1';
        }
      }
      if (field === 'variant_id') {
        const prod = products.find(p => p.id === next[i].product_id);
        const variant = (variantsMap[next[i].product_id] || []).find(v => v.id === value);
        if (variant) {
          next[i].unit_price = String(variant.selling_price);
          next[i].b2b_price = String(variant.selling_price);
        } else if (prod) {
          next[i].unit_price = String(prod.selling_price);
          next[i].b2b_price = String(prod.selling_price);
        }
      }
      const prod = products.find(p => p.id === next[i].product_id);
      const pType = prod ? getProductType(prod) : 'simple';
      if (pType === 'gemstone') {
        const gw = next[i].gemstone_weight || 0;
        next[i].total_price = gw * (parseFloat(next[i].unit_price) || 0);
      } else if (pType === 'weight') {
        const w = parseFloat(next[i].weight_input || '0') || 0;
        next[i].quantity = String(w);
        next[i].total_price = w * (parseFloat(next[i].unit_price) || 0);
      } else {
        const qty = parseFloat(next[i].quantity) || 0;
        next[i].total_price = qty * (parseFloat(next[i].unit_price) || 0);
      }
      return next;
    });

    // Auto-select best godown when product chosen (pick godown with most stock)
    if (field === 'product_id' && value) {
      const session = await ensureSessionForApi();
      if (!session) return;
      const { data: stockRows } = await supabase
        .from('godown_stock')
        .select('godown_id, quantity')
        .eq('product_id', value)
        .gt('quantity', 0)
        .order('quantity', { ascending: false })
        .limit(1);
      const bestGodown = stockRows?.[0]?.godown_id || getDefaultGodownId(godowns);
      setItems(prev => {
        const next = [...prev];
        next[i] = { ...next[i], godown_id: bestGodown };
        return next;
      });
      if (bestGodown) loadGodownStock(bestGodown, [value]);
      if (bestGodown) loadUnitsForLine(i, value, bestGodown);
    }

    if (field === 'product_id' && value && form.customer_id) {
      const product = products.find(p => p.id === value);
      if (product) {
        const smartRate = await getSmartRate(form.customer_id, value, product.selling_price);
        if (smartRate !== product.selling_price) {
          setItems(prev => {
            const next = [...prev];
            next[i] = { ...next[i], unit_price: String(smartRate) };
            const isGem = products.find(p => p.id === next[i].product_id)?.product_type === 'gemstone';
            if (isGem) {
              next[i].total_price = (next[i].gemstone_weight || 0) * smartRate;
            } else {
              const qty = parseFloat(next[i].quantity) || 0;
              next[i].total_price = qty * smartRate;
            }
            return next;
          });
        }
      }
    }
  };

  const getStockForItem = (item: LineItem, lineIndex: number): number | null => {
    if (!item.product_id) return null;
    const p = products.find(pp => pp.id === item.product_id);
    if (p?.product_type === 'gemstone') {
      return lineUnits[lineIndex]?.length ?? null;
    }
    if (!item.godown_id) return null;
    const variantKey = item.variant_id ? `${item.godown_id}:${item.product_id}:${item.variant_id}` : '';
    const totalKey = `${item.godown_id}:${item.product_id}:*`;
    if (variantKey && godownStockMap[variantKey] !== undefined) {
      return godownStockMap[variantKey];
    }
    if (godownStockMap[totalKey] !== undefined) {
      return godownStockMap[totalKey];
    }
    return null;
  };

  const handleCustomerChange = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      customer_name: c?.name || '',
      customer_phone: c?.phone || '',
      customer_address: c?.address || '',
      customer_address2: (c as Customer & { address2?: string })?.address2 || '',
      customer_city: c?.city || '',
      customer_state: c?.state || '',
      customer_pincode: c?.pincode || '',
    }));
    if (form.is_b2b && id) {
      setTimeout(() => { shipToNameRef.current?.focus(); shipToNameRef.current?.select(); }, 60);
    }
  };

  const handleShipToCustomerChange = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      ship_to_customer_id: id,
      ship_to_name: c?.name || '',
      ship_to_address1: (c as Customer & { address?: string })?.address || '',
      ship_to_address2: (c as Customer & { address2?: string })?.address2 || '',
      ship_to_city: c?.city || '',
      ship_to_state: c?.state || '',
      ship_to_pin: (c as Customer & { pincode?: string })?.pincode || '',
      ship_to_phone: (c as Customer & { phone?: string })?.phone || '',
    }));
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const total = subtotal + (parseFloat(form.courier_charges) || 0) - (parseFloat(form.discount_amount) || 0);

  const handleSave = async () => {
    if (isSubmitting) return;
    console.log('[SalesOrders] submit start (create)');
    const session = await ensureSessionForApi();
    if (!session) {
      toast.error('Session expired. Please sign in again.');
      return;
    }
    const itemsWithProduct = items.filter(i => i.product_name && i.product_id);
    if (itemsWithProduct.length === 0) {
      alert('At least one product line is required.');
      return;
    }
    const missingGodown = itemsWithProduct.filter(i => !i.godown_id);
    const missingGemPieces = itemsWithProduct.filter(i => {
      const p = products.find(pp => pp.id === i.product_id);
      return p?.product_type === 'gemstone' && (i.product_unit_ids || []).length === 0;
    });
    if (missingGodown.length > 0) {
      alert(`Please select a godown for every product line. ${missingGodown.length} line(s) have no godown assigned.`);
      return;
    }
    if (missingGemPieces.length > 0) {
      alert('Please select at least one piece weight for each gemstone line.');
      return;
    }
    if (!form.customer_id) {
      alert('Please select a customer.');
      return;
    }
    if (form.is_b2b && !form.ship_to_name.trim()) {
      alert('Please enter a Ship To recipient name.');
      return;
    }
    setIsSubmitting(true);
    try {
      const soNumber = await nextDocNumber('SO', supabase);
      const firstProdId = itemsWithProduct[0].product_id;
      const firstProd = products.find(p => p.id === firstProdId);
      const soCompanyId = (firstProd as unknown as { company_id?: string })?.company_id || null;
      console.log('[SalesOrders] createSalesOrder API call started', { soNumber, lineCount: itemsWithProduct.length });
      const soId = await createSalesOrder({
        so_number: soNumber,
        customer_id: form.customer_id,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_address: form.customer_address,
        customer_address2: form.customer_address2,
        customer_city: form.customer_city,
        customer_state: form.customer_state,
        customer_pincode: form.customer_pincode,
        so_date: form.so_date,
        delivery_date: form.delivery_date || null,
        courier_charges: parseFloat(form.courier_charges) || 0,
        discount_amount: parseFloat(form.discount_amount) || 0,
        notes: form.notes,
        godown_id: form.godown_id || null,
        company_id: soCompanyId,
        is_b2b: form.is_b2b,
        ship_to_customer_id: (form.is_b2b && form.ship_to_mode === 'customer') ? (form.ship_to_customer_id || null) : null,
        ship_to_name: form.is_b2b ? form.ship_to_name : null,
        ship_to_address1: form.is_b2b ? form.ship_to_address1 : null,
        ship_to_address2: form.is_b2b ? form.ship_to_address2 : null,
        ship_to_city: form.is_b2b ? form.ship_to_city : null,
        ship_to_state: form.is_b2b ? form.ship_to_state : null,
        ship_to_pin: form.is_b2b ? form.ship_to_pin : null,
        ship_to_phone: form.is_b2b ? form.ship_to_phone : null,
        items: itemsWithProduct.map(i => {
          const variant = i.variant_id ? (variantsMap[i.product_id] || []).find(v => v.id === i.variant_id) : undefined;
          const displayName = variant ? `${i.product_name} (${variant.name})` : i.product_name;
          return {
            product_id: i.product_id,
            product_name: displayName,
            unit: i.unit,
            quantity: parseFloat(i.quantity) || 0,
            unit_price: parseFloat(i.unit_price) || 0,
            b2b_price: i.b2b_price !== '' ? parseFloat(i.b2b_price) || null : null,
            godown_id: i.godown_id || null,
            gemstone_weight: (i.gemstone_weight || 0) > 0 ? i.gemstone_weight : null,
            variant_id: i.variant_id || null,
          };
        }),
      });
      console.log('[SalesOrders] createSalesOrder API call completed', { soId });
      const selectedUnitIds = itemsWithProduct.flatMap(i => i.product_unit_ids || []);
      if (selectedUnitIds.length > 0) {
        await markGemPiecesSold({ pieceIds: selectedUnitIds, referenceType: 'sales_order', referenceId: soId });
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Failed to create sales order:', err);
      const message = err instanceof Error ? err.message : 'Failed to create sales order';
      toast.error(message);
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (isSubmitting) return;
    const session = await ensureSessionForApi();
    if (!session) {
      toast.error('Session expired. Please sign in again.');
      return;
    }
    if (!editOrder) return;
    const itemsWithProduct = items.filter(i => i.product_name && i.product_id);
    const missingGodown = itemsWithProduct.filter(i => !i.godown_id);
    const missingGemPieces = itemsWithProduct.filter(i => {
      const p = products.find(pp => pp.id === i.product_id);
      return p?.product_type === 'gemstone' && (i.product_unit_ids || []).length === 0;
    });
    if (missingGodown.length > 0) {
      alert(`Please select a godown for every product line. ${missingGodown.length} line(s) have no godown assigned.`);
      return;
    }
    if (missingGemPieces.length > 0) {
      alert('Please select at least one piece weight for each gemstone line.');
      return;
    }
    if (form.is_b2b && !form.ship_to_name.trim()) {
      alert('Please enter a Ship To recipient name.');
      return;
    }
    setIsSubmitting(true);
    try {
      await revertGemPiecesSold({ referenceType: 'sales_order', referenceId: editOrder.id });

      const { error: updateErr } = await supabase.from('sales_orders').update({
        customer_id: form.customer_id || null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        customer_address: form.customer_address,
        customer_address2: form.customer_address2,
        customer_city: form.customer_city,
        customer_state: form.customer_state,
        customer_pincode: form.customer_pincode,
        so_date: form.so_date,
        delivery_date: form.delivery_date || null,
        courier_charges: parseFloat(form.courier_charges) || 0,
        discount_amount: parseFloat(form.discount_amount) || 0,
        subtotal,
        total_amount: total,
        notes: form.notes,
        is_b2b: form.is_b2b,
        ship_to_customer_id: (form.is_b2b && form.ship_to_mode === 'customer') ? (form.ship_to_customer_id || null) : null,
        ship_to_name: form.is_b2b ? form.ship_to_name : null,
        ship_to_address1: form.is_b2b ? form.ship_to_address1 : null,
        ship_to_address2: form.is_b2b ? form.ship_to_address2 : null,
        ship_to_city: form.is_b2b ? form.ship_to_city : null,
        ship_to_state: form.is_b2b ? form.ship_to_state : null,
        ship_to_pin: form.is_b2b ? form.ship_to_pin : null,
        ship_to_phone: form.is_b2b ? form.ship_to_phone : null,
      }).eq('id', editOrder.id);
      if (updateErr) throw updateErr;
      const { error: delItemsErr } = await supabase.from('sales_order_items').delete().eq('sales_order_id', editOrder.id);
      if (delItemsErr) throw delItemsErr;
      const { error: insertItemsErr } = await supabase.from('sales_order_items').insert(
        items.filter(i => i.product_name).map(i => {
          const variant = i.variant_id ? (variantsMap[i.product_id] || []).find(v => v.id === i.variant_id) : undefined;
          const displayName = variant ? `${i.product_name} (${variant.name})` : i.product_name;
          return {
            sales_order_id: editOrder.id,
            product_id: i.product_id || null,
            product_name: displayName,
            unit: i.unit,
            quantity: parseFloat(i.quantity) || 0,
            unit_price: parseFloat(i.unit_price) || 0,
            discount_pct: 0,
            b2b_price: i.b2b_price !== '' ? parseFloat(i.b2b_price) || null : null,
            total_price: i.total_price,
            godown_id: i.godown_id || null,
            product_unit_ids: i.product_unit_ids || [],
            gemstone_weight: (i.gemstone_weight || 0) > 0 ? i.gemstone_weight : null,
            variant_id: i.variant_id || null,
          };
        })
      );
      if (insertItemsErr) throw insertItemsErr;
      const selectedUnitIds = itemsWithProduct.flatMap(i => i.product_unit_ids || []);
      if (selectedUnitIds.length > 0) {
        await markGemPiecesSold({ pieceIds: selectedUnitIds, referenceType: 'sales_order', referenceId: editOrder.id });
      }
      setShowModal(false);
      setEditOrder(null);
      loadData();
    } catch (err) {
      console.error('Failed to update sales order:', err);
      const message = err instanceof Error ? err.message : 'Failed to update sales order';
      toast.error(message);
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (editOrder) {
      await handleEdit();
      return;
    }
    await handleSave();
  };

  const openEdit = async (order: SalesOrder) => {
    const session = await ensureSessionForApi();
    if (!session) return;
    const { data: existingItems } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setEditOrder(order);
    setForm({
      customer_id: order.customer_id || '',
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || '',
      customer_address: order.customer_address || '',
      customer_address2: order.customer_address2 || '',
      customer_city: order.customer_city || '',
      customer_state: order.customer_state || '',
      customer_pincode: order.customer_pincode || '',
      so_date: order.so_date,
      delivery_date: order.delivery_date || '',
      courier_charges: String(order.courier_charges || 0),
      discount_amount: String(order.discount_amount || 0),
      notes: order.notes || '',
      godown_id: '',
      is_b2b: order.is_b2b || false,
      ship_to_mode: (order.ship_to_customer_id ? 'customer' : (order.ship_to_name ? 'manual' : 'customer')) as 'customer' | 'manual',
      ship_to_customer_id: order.ship_to_customer_id || '',
      ship_to_name: order.ship_to_name || '',
      ship_to_address1: order.ship_to_address1 || '',
      ship_to_address2: order.ship_to_address2 || '',
      ship_to_city: order.ship_to_city || '',
      ship_to_state: order.ship_to_state || '',
      ship_to_pin: order.ship_to_pin || '',
      ship_to_phone: order.ship_to_phone || '',
    });
    setItems(
      existingItems && existingItems.length > 0
        ? existingItems.map(i => ({
            product_id: i.product_id || '',
            product_name: i.product_name,
            unit: i.unit,
            quantity: String(i.quantity),
            unit_price: String(i.unit_price),
            b2b_price: (i as Record<string, any>).b2b_price != null ? String((i as Record<string, any>).b2b_price) : String(i.unit_price),
            total_price: i.total_price,
            godown_id: i.godown_id || '',
            product_unit_ids: i.product_unit_ids || [],
            gemstone_weight: (i as Record<string, any>).gemstone_weight || undefined,
            variant_id: (i as Record<string, any>).variant_id || undefined,
            weight_input: String((i as Record<string, any>).gemstone_weight || i.quantity || ''),
          }))
        : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', b2b_price: '', discount_pct: '0', total_price: 0, godown_id: getDefaultGodownId(godowns), product_unit_ids: [] }]
    );
    (existingItems || []).forEach((it, idx) => {
      if (it.product_id && it.godown_id) loadUnitsForLine(idx, it.product_id, it.godown_id);
    });
    setShowModal(true);
  };

  const openView = async (order: SalesOrder) => {
    const session = await ensureSessionForApi();
    if (!session) return;
    const { data: itemsData } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setViewOrder(order);
    setViewItems(itemsData || []);
    setShowViewModal(true);
  };

  const openSOPrint = async (order: SalesOrder, mode: 'normal' | 'b2b' = 'normal') => {
    const session = await ensureSessionForApi();
    if (!session) return;
    const { data: itemsData } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setPrintOrder(order);
    setPrintItems((itemsData || []) as SalesOrderItem[]);
    setPrintMode(mode);
    const firstProdId = (itemsData || []).find(i => i.product_id)?.product_id;
    if (firstProdId) {
      const { data: prod } = await supabase.from('products').select('company_id').eq('id', firstProdId).maybeSingle();
      if (prod?.company_id) {
        const cos = await fetchCompanies();
        setPrintCompany(cos.find(c => c.id === prod.company_id) || undefined);
      } else { setPrintCompany(undefined); }
    } else { setPrintCompany(undefined); }
    setShowPrint(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const session = await ensureSessionForApi();
    if (!session) return;
    setDeleting(true);
    try {
      const soId = deleteTarget.id;

      // 1. Cancel active invoices first (reverses ledger, re-opens DCs).
      const { data: linkedInvs, error: invLookupErr } = await supabase
        .from('invoices').select('id, status').eq('sales_order_id', soId);
      if (invLookupErr) throw invLookupErr;
      for (const inv of (linkedInvs || [])) {
        if (inv.status !== 'cancelled') {
          await cancelInvoice(inv.id);
        }
      }

      // 2. Cancel active DCs (reverses stock movements, re-opens SO).
      const { data: linkedDCs, error: dcLookupErr } = await supabase
        .from('delivery_challans').select('id, status').eq('sales_order_id', soId);
      if (dcLookupErr) throw dcLookupErr;
      for (const dc of (linkedDCs || [])) {
        if (dc.status !== 'cancelled') {
          await cancelDeliveryChallan(dc.id);
        }
      }

      // 2.5 Safety verification: ensure all linked docs are now cancelled
      const { data: verifyInvs, error: verifyInvErr } = await supabase
        .from('invoices').select('id, status').eq('sales_order_id', soId);
      if (verifyInvErr) throw verifyInvErr;
      const { data: verifyDCs, error: verifyDCErr } = await supabase
        .from('delivery_challans').select('id, status').eq('sales_order_id', soId);
      if (verifyDCErr) throw verifyDCErr;
      const hasActiveInvoice = (verifyInvs || []).some(inv => inv.status !== 'cancelled');
      const hasActiveChallan = (verifyDCs || []).some(dc => dc.status !== 'cancelled');
      if (hasActiveInvoice || hasActiveChallan) {
        throw new Error('Cancel safety check failed. Linked documents must be cancelled before deleting this order.');
      }

      // 3. Hard-delete documents (cancel RPCs soft-cancelled them; now remove rows).
      for (const inv of (linkedInvs || [])) {
        await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
        await supabase.from('invoices').delete().eq('id', inv.id);
      }
      for (const dc of (linkedDCs || [])) {
        await supabase.from('delivery_challan_items').delete().eq('delivery_challan_id', dc.id);
        await supabase.from('delivery_challans').delete().eq('id', dc.id);
      }

      await revertGemPiecesSold({ referenceType: 'sales_order', referenceId: soId });

      const { error: soItemsErr } = await supabase.from('sales_order_items').delete().eq('sales_order_id', soId);
      if (soItemsErr) throw soItemsErr;
      const { error: soDelErr } = await supabase.from('sales_orders').delete().eq('id', soId);
      if (soDelErr) throw soDelErr;

      setDeleteTarget(null);
      setLinkedInfo(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete sales order:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete sales order');
    } finally {
      setDeleting(false);
    }
  };

  // Check what's linked before showing confirm
  const initiateDelete = async (o: SalesOrder) => {
    const session = await ensureSessionForApi();
    if (!session) return;
    const [invRes, dcRes] = await Promise.all([
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('sales_order_id', o.id),
      supabase.from('delivery_challans').select('id', { count: 'exact', head: true }).eq('sales_order_id', o.id),
    ]);
    setLinkedInfo({ invoices: invRes.count || 0, challans: dcRes.count || 0 });
    setDeleteTarget(o);
    setShowConfirm(true);
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map(o => ({
        'SO Number': o.so_number,
        'Customer': o.customer_name,
        'Phone': o.customer_phone || '',
        'Date': o.so_date,
        'Delivery Date': o.delivery_date || '',
        'Subtotal': o.subtotal,
        'Courier Charges': o.courier_charges || 0,
        'Discount': o.discount_amount || 0,
        'Total Amount': o.total_amount,
        'Status': o.status,
        'Notes': o.notes || '',
      })),
      'sales-orders'
    );
  };

  const createChallanFromSO = async (order: SalesOrder) => {
    const session = await ensureSessionForApi();
    if (!session) return;
    setConverting(order.id);
    try {
      const challanNumber = await nextDocNumber('DC', supabase);
      await createDeliveryChallan(order.id, {
        challan_number: challanNumber,
        challan_date: new Date().toISOString().split('T')[0],
        dispatch_mode: 'Courier',
      });
      onNavigate('challans');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to convert Sales Order to Delivery Challan');
    } finally {
      setConverting(null);
    }
  };

  const filtered = orders.filter(o => {
    const matchSearch = o.so_number.toLowerCase().includes(search.toLowerCase()) || o.customer_name.toLowerCase().includes(search.toLowerCase());
    const matchDate = o.so_date >= dateRange.from && o.so_date <= dateRange.to;
    const matchCustomer = !filterCustomer || o.customer_name === filterCustomer;
    const matchStatus = !filterStatus || o.status === filterStatus;
    const matchFrom = !filterFrom || o.so_date >= filterFrom;
    const matchTo = !filterTo || o.so_date <= filterTo;
    return matchSearch && matchDate && matchCustomer && matchStatus && matchFrom && matchTo;
  });

  const uniqueSOCustomers = [...new Set(orders.map(o => o.customer_name))].sort();
  const hasSOFilters = filterCustomer || filterStatus || filterFrom || filterTo;

  const statusColors: Record<string, any> = {
    draft: 'text-neutral-500',
    confirmed: 'text-blue-600',
    invoiced: 'text-primary-600',
    dispatched: 'text-amber-600',
    delivered: 'text-success-600',
    cancelled: 'text-error-600',
  };

  const totalValue = orders.reduce((s, o) => s + o.total_amount, 0);
  const pendingOrders = orders.filter(o => o.status === 'confirmed').length;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Sales Orders</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Create orders and convert to invoices or challans</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => {
            setEditOrder(null);
            setForm({ customer_id: '', customer_name: '', customer_phone: '', customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '', so_date: new Date().toISOString().split('T')[0], delivery_date: '', courier_charges: '0', discount_amount: '0', notes: '', godown_id: getDefaultGodownId(godowns), is_b2b: false, ship_to_mode: 'customer', ship_to_customer_id: '', ship_to_name: '', ship_to_address1: '', ship_to_address2: '', ship_to_city: '', ship_to_state: '', ship_to_pin: '', ship_to_phone: '' });
            setGodownStockMap({});
            setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', b2b_price: '', discount_pct: '0', total_price: 0, godown_id: getDefaultGodownId(godowns), product_unit_ids: [] }]);
            setShowModal(true);
          }} className="btn-primary">
            <Plus className="w-4 h-4" /> New Order
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{orders.length}</p>
            <p className="text-[10px] text-neutral-400 mt-1">{orders.filter(o => o.status === 'delivered').length} delivered</p>
          </div>
          <div className="card border-l-4 border-l-blue-400">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Awaiting Action</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{pendingOrders}</p>
            <p className="text-[10px] text-neutral-400 mt-1">Need challan or invoice</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Value</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{formatCurrency(totalValue)}</p>
          </div>
        </div>

        <div className="bg-white border border-neutral-100 rounded-xl px-4 py-3">
          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Sales Flow</p>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: 'Sales Order', color: 'bg-blue-600 text-white border-blue-600', icon: FileText, active: true },
              { label: 'Delivery Note', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: Truck, active: false },
              { label: 'Invoice', color: 'bg-green-50 text-green-700 border-green-200', icon: Receipt, active: false },
              { label: 'Dispatch (optional)', color: 'bg-neutral-50 text-neutral-500 border-neutral-200', icon: Send, active: false },
            ].map((step, i, arr) => (
              <React.Fragment key={i}>
                <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${step.color}`}>
                  <step.icon className="w-3.5 h-3.5" />
                  {step.label}
                </div>
                {i < arr.length - 1 && <ArrowRight className="w-3.5 h-3.5 text-neutral-300" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap bg-white border border-neutral-100 rounded-xl px-3 py-2">
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input text-xs w-44 py-1">
            <option value="">All Customers</option>
            {uniqueSOCustomers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input text-xs w-32 py-1">
            <option value="">All Statuses</option>
            {['draft','confirmed','dispatched','delivered','invoiced','cancelled'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <span>From</span>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input text-xs py-1 w-32" />
            <span>To</span>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input text-xs py-1 w-32" />
          </div>
          {hasSOFilters && (
            <button onClick={() => { setFilterCustomer(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-error-600 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <span className="text-[10px] text-neutral-400 ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header w-8" />
                <th className="table-header text-left">SO #</th>
                <th className="table-header text-left">Customer</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <React.Fragment key={o.id}>
                  <tr className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-3 w-8">
                      <button onClick={() => toggleExpand(o.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-200">
                        {expandedRows.has(o.id) ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
                      </button>
                    </td>
                    <td className="table-cell font-medium text-primary-700 text-xs">{o.so_number}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-neutral-800">{o.customer_name}</p>
                        {o.is_b2b && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full uppercase tracking-wider">B2B</span>}
                      </div>
                      {o.customer_phone && <p className="text-[10px] text-neutral-400 mt-0.5">{o.customer_phone}</p>}
                    </td>
                    <td className="table-cell text-xs text-neutral-500">{formatDate(o.so_date)}</td>
                    <td className="table-cell text-right text-xs font-semibold text-neutral-800">{formatCurrency(o.total_amount)}</td>
                    <td className="table-cell"><StatusBadge status={o.status} /></td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(o.status === 'confirmed' || o.status === 'draft') && (
                          <button
                            onClick={() => createChallanFromSO(o)}
                            disabled={converting === o.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors shadow-sm"
                            title="Next step: Create Delivery Note"
                          >
                            <Truck className="w-3 h-3" />
                            {converting === o.id ? 'Creating...' : 'Delivery Note'}
                          </button>
                        )}
                        <button onClick={() => openView(o)} title="View" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openSOPrint(o)} title="Print Proforma" className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"><Printer className="w-3.5 h-3.5" /></button>
                        {o.status !== 'cancelled' && (
                          <button onClick={() => openEdit(o)} title="Edit" className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        {o.status !== 'cancelled' && o.status !== 'delivered' && (
                          <button onClick={() => setCancelSOTarget(o)} title="Cancel Order" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><XCircle className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => initiateDelete(o)} title="Delete" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(o.id) && (
                    <tr key={`${o.id}-items`} className="bg-neutral-50 border-b border-neutral-100">
                      <td colSpan={7} className="px-10 py-3">
                        {rowItems[o.id] ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-400 uppercase text-[10px]">
                                <th className="text-left pb-1 font-semibold tracking-wider">Product</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-16">Qty</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-20">Unit Price</th>
                                {o.is_b2b && <th className="text-right pb-1 font-semibold tracking-wider w-20">B2B Price</th>}
                                <th className="text-right pb-1 font-semibold tracking-wider w-24">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowItems[o.id].map((item, idx) => (
                                <tr key={idx} className="border-t border-neutral-200">
                                  <td className="py-1.5 text-neutral-700 font-medium">{item.product_name}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{item.quantity} {item.unit}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                                  {o.is_b2b && <td className="py-1.5 text-right text-neutral-500">{item.b2b_price ? formatCurrency(item.b2b_price) : '-'}</td>}
                                  <td className="py-1.5 text-right font-semibold text-neutral-800">{formatCurrency(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-neutral-400">Loading...</p>
                        )}
                        {o.notes && <p className="mt-2 text-xs text-neutral-500 italic">Note: {o.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={FileText} title="No sales orders" description="Create your first sales order." />}
        </div>
      </div>

      {/* keep saveActionRef in sync with current edit/save functions */}
      {(() => { saveActionRef.current = handleSubmit; return null; })()}

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditOrder(null); }} title={editOrder ? `Edit Sales Order — ${editOrder.so_number}` : 'New Sales Order'} size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] text-neutral-400 select-none">Ctrl+Enter to save</span>
            <div className="flex gap-2">
              <button onClick={() => { setShowModal(false); setEditOrder(null); }} className="btn-secondary">Cancel</button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={`btn-primary ${isSubmitting ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {isSubmitting ? (editOrder ? 'Saving...' : 'Creating...') : (editOrder ? 'Save Changes' : 'Create Order')}
              </button>
            </div>
          </div>
        }>
        <div className="space-y-2">
          {/* Mode toggle */}
          <div className="flex items-center gap-3">
            <label className="label mb-0">Mode</label>
            <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs font-medium">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_b2b: false, ship_to_mode: 'customer', ship_to_customer_id: '', ship_to_name: '', ship_to_address1: '', ship_to_address2: '', ship_to_city: '', ship_to_state: '', ship_to_pin: '', ship_to_phone: '' }))}
                className={`px-3 py-1.5 transition-colors ${!form.is_b2b ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
              >Normal</button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_b2b: true, ship_to_mode: 'manual' }))}
                className={`px-3 py-1.5 transition-colors ${form.is_b2b ? 'bg-blue-600 text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}
              >B2B</button>
            </div>
          </div>
          {/* Dates row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">SO Date</label>
              <input type="date" value={form.so_date} onChange={e => setForm(f => ({ ...f, so_date: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="input text-xs" />
            </div>
          </div>

          {form.is_b2b ? (
            /* B2B: side-by-side Bill To / Ship To */
            <div className="grid grid-cols-2 gap-0 border border-neutral-200 rounded-lg overflow-hidden">
              {/* Bill To — dropdown editable, address shown as read-only text */}
              <div className="p-2.5 bg-neutral-50 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Bill To</p>
                <select ref={customerSelectRef} value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} onKeyDown={handleCustomerKeyDown} className="input text-xs w-full">
                  <option value="">-- Select Customer --</option>
                  {customers.filter(c => (c.category || '').toUpperCase() === 'B2B').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  {customers.filter(c => (c.category || '').toUpperCase() === 'B2B').length === 0 && customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {form.customer_id && (
                  <div className="text-[11px] text-neutral-500 leading-relaxed px-0.5">
                    {form.customer_name && <div className="font-medium text-neutral-700">{form.customer_name}</div>}
                    {[form.customer_address, form.customer_address2].filter(Boolean).join(', ') && (
                      <div>{[form.customer_address, form.customer_address2].filter(Boolean).join(', ')}</div>
                    )}
                    {[form.customer_city, form.customer_state, form.customer_pincode].filter(Boolean).join(' ') && (
                      <div>{[form.customer_city, form.customer_state, form.customer_pincode].filter(Boolean).join(' ')}</div>
                    )}
                    {form.customer_phone && <div>{form.customer_phone}</div>}
                  </div>
                )}
              </div>

              {/* Ship To — always manual, fully editable */}
              <div className="p-2.5 border-l border-neutral-200 bg-white space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Ship To</p>
                <input ref={shipToNameRef} value={form.ship_to_name} onChange={e => setForm(f => ({ ...f, ship_to_name: e.target.value }))} className="input text-xs w-full" placeholder="Recipient name *"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setTimeout(() => getProductRef(0).current?.focus(), 20); } }} />
                <input value={form.ship_to_address1} onChange={e => setForm(f => ({ ...f, ship_to_address1: e.target.value }))} className="input text-xs w-full" placeholder="Address Line 1" />
                <input value={form.ship_to_address2} onChange={e => setForm(f => ({ ...f, ship_to_address2: e.target.value }))} className="input text-xs w-full" placeholder="Address Line 2" />
                <div className="grid grid-cols-3 gap-1">
                  <input value={form.ship_to_city} onChange={e => setForm(f => ({ ...f, ship_to_city: e.target.value }))} className="input text-xs" placeholder="City" />
                  <select value={form.ship_to_state} onChange={e => setForm(f => ({ ...f, ship_to_state: e.target.value }))} className="input text-xs">
                    <option value="">State</option>
                    {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={form.ship_to_pin} onChange={e => setForm(f => ({ ...f, ship_to_pin: e.target.value }))} className="input text-xs" placeholder="PIN" maxLength={6} />
                </div>
                <input value={form.ship_to_phone} onChange={e => setForm(f => ({ ...f, ship_to_phone: e.target.value }))} className="input text-xs w-full" placeholder="Phone" />
              </div>
            </div>
          ) : (
            /* Normal mode: stacked customer address */
            <>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="label">Customer</label>
                  <select ref={customerSelectRef} value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} onKeyDown={handleCustomerKeyDown} className="input text-xs">
                    <option value="">-- Select --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Customer Name *</label>
                  <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input text-xs" placeholder="Full name" />
                </div>
                <div className="col-span-2" />
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="label">Address Line 1</label>
                  <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input text-xs" placeholder="Street / House No." />
                </div>
                <div className="col-span-2">
                  <label className="label">Address Line 2</label>
                  <input value={form.customer_address2} onChange={e => setForm(f => ({ ...f, customer_address2: e.target.value }))} className="input text-xs" placeholder="Area / Landmark" />
                </div>
                <div>
                  <label className="label">City</label>
                  <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input text-xs" placeholder="City" />
                </div>
                <div>
                  <label className="label">State</label>
                  <select value={form.customer_state} onChange={e => setForm(f => ({ ...f, customer_state: e.target.value }))} className="input text-xs">
                    <option value="">-- State --</option>
                    {INDIA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">PIN</label>
                  <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input text-xs" placeholder="PIN" maxLength={6} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input text-xs" placeholder="+91..." />
                </div>
              </div>
            </>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">Items</p>
              <button onClick={() => addItem()} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-visible">
              <table className="w-full">
                <thead className="bg-neutral-50 rounded-t-lg">
                  <tr>
                    <th className="table-header text-left rounded-tl-lg">Product</th>
                    <th className="table-header text-left w-32">Godown</th>
                    <th className="table-header text-right w-16">Qty</th>
                    <th className="table-header text-right w-24">Price</th>
                    <th className={`table-header text-right w-24 ${!form.is_b2b ? 'hidden' : ''}`}>B2B Price</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const prod = products.find(p => p.id === item.product_id);
                    const pType: ProductType = prod ? getProductType(prod) : 'simple';
                    const wLabel = prod?.weight_unit === 'carats' ? 'ct' : 'g';
                    const prodVariants = item.product_id ? (variantsMap[item.product_id] || []) : [];
                    const units = lineUnits[i] || [];
                    const s = getStockForItem(item, i);
                    return (
                      <React.Fragment key={i}>
                      <tr className="border-t border-neutral-100">
                        <td className="px-3 py-2">
                          <ProductCombobox
                            products={products}
                            value={item.product_id}
                            onSelect={p => handleProductSelect(i, p)}
                            inputRef={getProductRef(i)}
                            godownStockMap={productTotalStockMap}
                          />
                          {pType === 'variant' && prodVariants.length > 0 && (
                            <select value={item.variant_id || ''} onChange={e => updateItem(i, 'variant_id', e.target.value)} className="input text-xs mt-1">
                              <option value="">-- Select Variant --</option>
                              {prodVariants.map(v => <option key={v.id} value={v.id}>{v.name} (stock: {variantTotalStockMap[v.id] ?? 0})</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-3 py-2 w-32">
                          <select value={item.godown_id} onChange={e => {
                            const gid = e.target.value;
                            setItems(prev => { const next=[...prev]; next[i]={...next[i], godown_id: gid, product_unit_ids: []}; return next; });
                            if (gid && item.product_id) loadGodownStock(gid, [item.product_id]);
                            if (gid && item.product_id) loadUnitsForLine(i, item.product_id, gid);
                          }} className="input text-xs py-1">
                            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                          {item.product_id && s !== null && (
                            <p className={`text-[10px] mt-0.5 text-right font-medium ${s === 0 ? 'text-error-600' : s <= (prod?.low_stock_alert||5) ? 'text-warning-600' : 'text-success-600'}`}>
                              {s} {pType === 'gemstone' ? 'pcs' : 'in stock'}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 w-20">
                          {pType === 'weight' ? (
                            <>
                              <input ref={getQtyRef(i)} type="number" step="0.001" value={item.weight_input || ''} onChange={e => updateItem(i, 'weight_input', e.target.value)} onKeyDown={e => handleQtyKeyDown(e, i)} className="input text-xs text-right" placeholder="0.000" />
                              <p className="text-[10px] text-neutral-400 mt-0.5 text-right">{wLabel}</p>
                            </>
                          ) : pType === 'gemstone' ? (
                            <>
                              <div className="text-right text-sm font-semibold text-neutral-800">{item.quantity}</div>
                              <p className="text-[10px] text-neutral-400 mt-0.5 text-right">pcs (auto)</p>
                            </>
                          ) : (
                            <input ref={getQtyRef(i)} type="number" step="1" min="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} onKeyDown={e => handleQtyKeyDown(e, i)} className="input text-xs text-right" />
                          )}
                        </td>
                        <td className="px-3 py-2 w-24">
                          <input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" />
                          {(pType === 'gemstone' || pType === 'weight') && (
                            <p className="text-[10px] text-neutral-400 mt-0.5 text-right">per {wLabel}</p>
                          )}
                        </td>
                        <td className={`px-3 py-2 w-24 ${!form.is_b2b ? 'hidden' : ''}`}><input type="number" value={item.b2b_price} onChange={e => updateItem(i, 'b2b_price', e.target.value)} placeholder={item.unit_price} className="input text-xs text-right" /></td>
                        <td className="px-3 py-2 w-24 text-right text-sm font-medium">
                          {formatCurrency(item.total_price)}
                          {pType === 'gemstone' && (item.gemstone_weight || 0) > 0 && (
                            <p className="text-[10px] text-neutral-400 font-normal mt-0.5">{item.gemstone_weight}{wLabel} &times; {formatCurrency(parseFloat(item.unit_price)||0)}</p>
                          )}
                          {pType === 'weight' && (parseFloat(item.weight_input||'0')||0) > 0 && (
                            <p className="text-[10px] text-neutral-400 font-normal mt-0.5">{item.weight_input}{wLabel} &times; {formatCurrency(parseFloat(item.unit_price)||0)}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 w-8"><button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-error-500 text-lg leading-none">&times;</button></td>
                      </tr>
                      {pType === 'gemstone' && item.product_id && (
                        <tr key={`units-${i}`} className="border-t border-neutral-50 bg-neutral-50/70">
                          <td colSpan={7} className="px-3 py-2">
                            <p className="text-[10px] font-semibold text-neutral-500 mb-1">Select pieces</p>
                            <div className="flex flex-wrap gap-1.5">
                              {units.map(u => {
                                const checked = (item.product_unit_ids || []).includes(u.id);
                                return (
                                  <label key={u.id} className={`px-2 py-1 rounded-full border text-[10px] cursor-pointer ${checked ? 'bg-primary-50 border-primary-300 text-primary-700' : 'bg-white border-neutral-200 text-neutral-600'}`}>
                                    <input type="checkbox" className="mr-1" checked={checked}
                                      onChange={e => {
                                        setItems(prev => {
                                          const next = [...prev];
                                          const existing = new Set(next[i].product_unit_ids || []);
                                          if (e.target.checked) existing.add(u.id); else existing.delete(u.id);
                                          const ids = Array.from(existing);
                                          const totalWeight = units.filter(pu => ids.includes(pu.id)).reduce((s, pu) => s + (pu.weight || 0), 0);
                                          const unitPrice = parseFloat(next[i].unit_price) || 0;
                                          next[i] = { ...next[i], product_unit_ids: ids, quantity: String(ids.length), gemstone_weight: totalWeight, total_price: totalWeight * unitPrice };
                                          return next;
                                        });
                                      }} />
                                    {u.weight} {u.weight_unit}
                                  </label>
                                );
                              })}
                              {units.length === 0 && <span className="text-[10px] text-neutral-400">No available pieces in this godown</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3 gap-4">
              <div className="flex items-center gap-2">
                <label className="label mb-0">Courier</label>
                <input type="number" value={form.courier_charges} onChange={e => setForm(f => ({ ...f, courier_charges: e.target.value }))} className="input w-24 text-right text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <label className="label mb-0">Discount</label>
                <input type="number" value={form.discount_amount} onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))} className="input w-24 text-right text-xs" />
              </div>
              <div className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                Total: {formatCurrency(total)}
              </div>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => { setShowViewModal(false); setViewOrder(null); }} title={viewOrder ? `Sales Order — ${viewOrder.so_number}` : ''} size="xl"
        footer={
          <div className="flex items-center gap-3">
            <StatusBadge status={viewOrder?.status || ''} />
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => { setShowViewModal(false); setViewOrder(null); }} className="btn-secondary">Close</button>
              {viewOrder && (
                <button onClick={() => { setShowViewModal(false); openSOPrint(viewOrder, 'normal'); }} className="btn-primary flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5" /> Print Proforma
                </button>
              )}
              {viewOrder?.is_b2b && (
                <button onClick={() => { setShowViewModal(false); openSOPrint(viewOrder, 'b2b'); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                  <Printer className="w-3.5 h-3.5" /> Print B2B
                </button>
              )}
            </div>
          </div>
        }>
        {viewOrder && (
          <SalesOrderPrint order={viewOrder} items={viewItems as SalesOrderItem[]} companyOverride={printCompany} printMode={viewOrder.is_b2b ? 'b2b' : 'normal'} />
        )}
      </Modal>

      {showConfirm && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-error-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Sales Order</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Delete <span className="font-semibold text-neutral-800">{deleteTarget.so_number}</span>?
                </p>
                {linkedInfo && (linkedInfo.invoices > 0 || linkedInfo.challans > 0) && (
                  <div className="mt-2 p-2.5 bg-warning-50 border border-warning-200 rounded-lg">
                    <p className="text-xs font-semibold text-warning-700 mb-1">⚠️ This will also delete:</p>
                    <ul className="text-xs text-warning-600 space-y-0.5">
                      {linkedInfo.invoices > 0 && <li>• {linkedInfo.invoices} linked invoice{linkedInfo.invoices > 1 ? 's' : ''}</li>}
                      {linkedInfo.challans > 0 && <li>• {linkedInfo.challans} delivery challan{linkedInfo.challans > 1 ? 's' : ''}</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowConfirm(false); setDeleteTarget(null); setLinkedInfo(null); }} disabled={deleting} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-error-600 hover:bg-error-700 disabled:opacity-60 transition-colors flex items-center gap-1.5">
                {deleting ? <><div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /> Deleting...</> : <><Trash2 className="w-3 h-3" /> Delete All</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!cancelSOTarget}
        onClose={() => setCancelSOTarget(null)}
        onConfirm={async () => {
          if (!cancelSOTarget) return;
          const session = await ensureSessionForApi();
          if (!session) return;
          await revertGemPiecesSold({ referenceType: 'sales_order', referenceId: cancelSOTarget.id });
          await supabase.from('sales_orders').update({ status: 'cancelled' }).eq('id', cancelSOTarget.id);
          setCancelSOTarget(null);
          loadData();
        }}
        title="Cancel Sales Order"
        message={cancelSOTarget ? `Cancel order ${cancelSOTarget.so_number} for ${cancelSOTarget.customer_name}? This cannot be undone.` : ''}
        confirmLabel="Yes, Cancel"
        isDanger
      />

      {/* Full-screen print preview — same UX as Invoice */}
      {showPrint && printOrder && (
        <div className="fixed inset-0 z-50 bg-neutral-100 overflow-auto">
          <div className="no-print flex items-center justify-between bg-white border-b border-neutral-200 px-5 py-3">
            <p className="text-sm font-semibold text-neutral-800">{printMode === 'b2b' ? 'B2B Proforma' : 'Proforma'} — {printOrder.so_number}</p>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-primary"><Printer className="w-3.5 h-3.5" /> Print / Save PDF</button>
              <button onClick={() => setShowPrint(false)} className="btn-secondary">Close</button>
            </div>
          </div>
          <div className="py-6 print-content">
            <SalesOrderPrint order={printOrder} items={printItems} companyOverride={printCompany} printMode={printMode} />
          </div>
        </div>
      )}
    </div>
  );
}
