import { createContext, useContext, useState } from 'react';

interface DateRange {
  from: string;
  to: string;
}

interface DateRangeContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  resetToThisMonth: () => void;
  resetToThisYear: () => void;
  resetToYearToDate: () => void;
  label: string;
}

const getThisMonthRange = (): DateRange => {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
  };
};

// Year-to-date — Jan 1 of the current calendar year through today.
// Used as the system-wide default so reports / lists open with the
// full year's data already in view.
const getYearToDateRange = (): DateRange => {
  const now = new Date();
  return {
    from: `${now.getFullYear()}-01-01`,
    to: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
};

const DateRangeContext = createContext<DateRangeContextType | null>(null);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRange>(getYearToDateRange());

  const setDateRange = (range: DateRange) => setDateRangeState(range);

  const resetToThisMonth = () => setDateRangeState(getThisMonthRange());
  const resetToYearToDate = () => setDateRangeState(getYearToDateRange());

  const resetToThisYear = () => {
    const now = new Date();
    setDateRangeState({
      from: `${now.getFullYear()}-01-01`,
      to: `${now.getFullYear()}-12-31`,
    });
  };

  const formatLabel = () => {
    const from = new Date(dateRange.from);
    const to = new Date(dateRange.to);
    const fromStr = from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    const toStr = to.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    return `${fromStr} – ${toStr}`;
  };

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange, resetToThisMonth, resetToThisYear, resetToYearToDate, label: formatLabel() }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error('useDateRange must be used within DateRangeProvider');
  return ctx;
}
