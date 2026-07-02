import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'error' | 'success' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastApi {
  push: (kind: ToastKind, title: string, body?: string) => void;
}

const Ctx = createContext<ToastApi>({ push: () => {} });
export const useToast = () => useContext(Ctx);

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq;
    setToasts(t => [...t, { id, kind, title, body }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 8000);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast--${t.kind}`} onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}>
            <strong>{t.title}</strong>
            {t.body && <pre>{t.body}</pre>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
