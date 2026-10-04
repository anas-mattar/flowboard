import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { messages } from '../../i18n/messages';

export type ToastVariant = 'info' | 'success' | 'danger';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 4000;
const MAX_STACKED = 3;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

/**
 * Toast primitive (FS X-01, FB-03 spec §3): renders within one frame of being
 * called, announced via `aria-live="polite"`, auto-dismisses after 4 s unless
 * hovered or focused, and stacks at most 3 at a time (oldest drops first).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number) => {
      const timer = setTimeout(() => {
        dismiss(id);
      }, AUTO_DISMISS_MS);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const resume = useCallback(
    (id: number) => {
      scheduleDismiss(id);
    },
    [scheduleDismiss],
  );

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => [...current.slice(-(MAX_STACKED - 1)), { id, message, variant }]);
      scheduleDismiss(id);
    },
    [scheduleDismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast--${toast.variant}`}
            onMouseEnter={() => {
              pause(toast.id);
            }}
            onMouseLeave={() => {
              resume(toast.id);
            }}
            onFocus={() => {
              pause(toast.id);
            }}
            onBlur={() => {
              resume(toast.id);
            }}
          >
            <span className="toast__message">{toast.message}</span>
            <button
              type="button"
              className="toast__dismiss"
              onClick={() => {
                dismiss(toast.id);
              }}
            >
              {messages.toast.dismiss}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
