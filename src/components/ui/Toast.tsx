import { useState, createContext, useContext, useCallback } from 'react';
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const ctx: ToastContextValue = {
    showToast,
    success: (msg) => showToast('success', msg),
    error: (msg) => showToast('error', msg),
    warning: (msg) => showToast('warning', msg),
    info: (msg) => showToast('info', msg),
  };

  const iconMap = { success: CheckCircle, error: XCircle, warning: AlertTriangle, info: Info };
  const styleMap = {
    success: 'bg-success-50 border-success-200 text-success-800',
    error: 'bg-error-50 border-error-200 text-error-800',
    warning: 'bg-warning-50 border-warning-200 text-warning-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  const iconColorMap = {
    success: 'text-success-600',
    error: 'text-error-600',
    warning: 'text-warning-600',
    info: 'text-blue-600',
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = iconMap[t.type];
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg min-w-[260px] max-w-sm pointer-events-auto animate-in slide-in-from-right-4 duration-300 ${styleMap[t.type]}`}
            >
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconColorMap[t.type]}`} />
              <p className="text-xs font-medium flex-1 leading-relaxed">{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="opacity-50 hover:opacity-100 transition-opacity shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
