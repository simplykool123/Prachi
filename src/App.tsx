import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { DateRangeProvider } from './contexts/DateRangeContext';
import { ToastProvider } from './components/ui/Toast';
import DateRangeBar from './components/layout/DateRangeBar';
import Sidebar from './components/layout/Sidebar';
import AppLoader from './components/AppLoader';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import GodownStock from './pages/inventory/GodownStock';
import GodownTransfer from './pages/inventory/GodownTransfer';
import Bundles from './pages/inventory/Bundles';
import BulkWeightEditor from './pages/inventory/BulkWeightEditor';
import ShippingRates from './pages/ShippingRates';
import Purchase from './pages/Purchase';
import SalesOrders from './pages/sales/SalesOrders';
import Invoices from './pages/sales/Invoices';
import DeliveryChallan from './pages/sales/DeliveryChallan';
import CRM from './pages/CRM';
import CalendarPage from './pages/Calendar';
import SalesReturns from './pages/sales/SalesReturns';
import Ledger from './pages/finance/Ledger';
import Expenses from './pages/finance/Expenses';
import Journal from './pages/finance/Journal';
import Courier from './pages/Courier';
import Reports from './pages/Reports';
import Automation from './pages/Automation';
import Settings from './pages/Settings';
import InquiryLeads from './pages/InquiryLeads';
// Deprecated - replaced by B2B Sales Order flow
// import DropShipments from './pages/sales/DropShipments';
import type { ActivePage, DeliveryChallan as DCType } from './types';

export interface PageState {
  prefillDCForShipment?: DCType;
  prefillDCForInvoice?: DCType;
}

const PAGE_TITLES: Partial<Record<ActivePage, string>> = {
  dashboard: 'Dashboard',
  crm: 'Clients',
  calendar: 'Schedule',
  'sales-orders': 'Sales Orders',
  invoices: 'Invoices',
  challans: 'Delivery Challans',
  'sales-returns': 'Returns',
  courier: 'Shipments',
  inventory: 'Products',
  'godown-stock': 'Godown Stock',
  'godown-transfer': 'Stock Transfers',
  purchase: 'Purchases',
  finance: 'Finance',
  ledger: 'Ledger',
  expenses: 'Expenses',
  journal: 'Journal',
  reports: 'Reports',
  automation: 'Automation',
  settings: 'Settings',
  'inquiry-leads': 'Inquiry Leads',
  bundles: 'Bundles & Combos',
  'bulk-weight': 'Bulk Weight Editor',
  'shipping-rates': 'Shipping Rates',
};

function AppShell() {
  const { user, isAuthLoading, isAdmin, canAccessFinance, canAccessSales, canAccessInventory, canAccessExpenses } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [pageState, setPageState] = useState<PageState>({});

  if (isAuthLoading && !user) return <AppLoader />;

  if (!user) return <Login />;

  const navigate = (page: ActivePage, state?: PageState) => {
    setPageState(state || {});
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />;
      case 'crm': return <CRM />;
      case 'calendar': return <CalendarPage />;
      case 'sales-orders': return canAccessSales ? <SalesOrders onNavigate={navigate} /> : <Dashboard onNavigate={navigate} />;
      case 'invoices': return canAccessSales ? <Invoices onNavigate={navigate} prefillFromDC={pageState.prefillDCForInvoice} /> : <Dashboard onNavigate={navigate} />;
      case 'challans': return canAccessSales ? <DeliveryChallan onNavigate={navigate} /> : <Dashboard onNavigate={navigate} />;
      case 'sales-returns': return canAccessSales ? <SalesReturns /> : <Dashboard onNavigate={navigate} />;
      case 'inventory': return canAccessInventory ? <Inventory /> : <Dashboard onNavigate={navigate} />;
      case 'godown-stock': return canAccessInventory ? <GodownStock /> : <Dashboard onNavigate={navigate} />;
      case 'godown-transfer': return canAccessInventory ? <GodownTransfer /> : <Dashboard onNavigate={navigate} />;
      case 'bundles': return canAccessInventory ? <Bundles /> : <Dashboard onNavigate={navigate} />;
      case 'bulk-weight': return canAccessInventory ? <BulkWeightEditor /> : <Dashboard onNavigate={navigate} />;
      case 'shipping-rates': return isAdmin ? <ShippingRates /> : <Dashboard onNavigate={navigate} />;
      case 'purchase': return isAdmin ? <Purchase /> : <Dashboard onNavigate={navigate} />;
      case 'finance':
      case 'ledger': return canAccessFinance ? <Ledger /> : <Dashboard onNavigate={navigate} />;
      case 'expenses': return canAccessExpenses ? <Expenses /> : <Dashboard onNavigate={navigate} />;
      case 'journal': return canAccessFinance ? <Journal /> : <Dashboard onNavigate={navigate} />;
      case 'courier': return <Courier prefillFromDC={pageState.prefillDCForShipment} />;
      case 'reports': return <Reports />;
      case 'automation': return isAdmin ? <Automation /> : <Dashboard onNavigate={navigate} />;
      case 'settings': return isAdmin ? <Settings /> : <Dashboard onNavigate={navigate} />;
      case 'inquiry-leads': return <InquiryLeads />;
      // Deprecated - replaced by B2B Sales Order flow
      case 'drop-shipments': return <Dashboard onNavigate={navigate} />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      <div className="no-print">
        <Sidebar activePage={activePage} onNavigate={navigate} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-neutral-100 px-4 py-2 flex items-center justify-between no-print">
          <p className="text-xs font-semibold text-neutral-400 tracking-wide">
            {PAGE_TITLES[activePage] || ''}
          </p>
          <DateRangeBar />
        </div>
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DateRangeProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </DateRangeProvider>
  );
}
