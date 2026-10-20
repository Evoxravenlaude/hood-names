import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Tone = 'good' | 'bad';
interface Toast {
  id: number;
  text: string;
  tone: Tone;
  leaving?: boolean;
}
type Show = (text: string, tone?: Tone) => void;

const ToastContext = createContext<Show>(() => {});

/** Short confirmations ("Saved", "Copied") that slide in and leave on their own. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const show = useCallback<Show>((text, tone = 'good') => {
    const id = next.current++;
    setToasts((all) => [...all.filter((t) => t.text !== text).slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t))), 3600);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 3900);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast' + (t.tone === 'bad' ? ' bad' : '') + (t.leaving ? ' leaving' : '')}>
            <span className="dot" aria-hidden="true" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
