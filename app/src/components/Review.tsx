import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { chain, explorerUrl } from '../config';
import { useT } from '../i18n';
import type { Described } from '../lib/describe';
import { eth, shortAddress } from '../lib/format';

type Confirm = (steps: Described[]) => Promise<boolean>;
const ReviewContext = createContext<Confirm>(async () => true);

/** Asks the person to review, in plain language, what their wallet is about to show. */
export const useReview = () => useContext(ReviewContext);

export function ReviewProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ steps: Described[]; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback<Confirm>(
    (steps) => new Promise<boolean>((resolve) => setPending({ steps, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };
  return (
    <ReviewContext.Provider value={confirm}>
      {children}
      {pending && <ReviewDialog steps={pending.steps} onClose={close} />}
    </ReviewContext.Provider>
  );
}

function ReviewDialog({ steps, onClose }: { steps: Described[]; onClose: (ok: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    // Focus the dialog itself, not a button, so a stray Enter confirms nothing.
    box.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeRef.current(false);
      if (e.key !== 'Tab' || !box.current) return;
      // Keep Tab inside the dialog.
      const items = [...box.current.querySelectorAll<HTMLElement>('a[href], button, summary, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keys);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keys);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, []);

  const t = useT();
  const many = steps.length > 1;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title" tabIndex={-1} ref={box} style={{ outline: 'none' }}>
        <div className="dialog-head">
          <h2 id="review-title">{many ? t('Review {n} steps', { n: steps.length }) : t('Review before you sign')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>
            {many ? t('Your wallet will ask you to confirm each step in turn.') : t('Your wallet will ask you to confirm this next.')}
          </p>
        </div>
        <ol className="review-steps">
          {steps.map((s, i) => (
            <li key={i} className="review-step" translate="no">
              {many && <span className="review-num">{i + 1}</span>}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="review-title">{s.title}</div>
                {s.details.length > 0 && (
                  <ul className="review-details">
                    {s.details.map((d, j) => <li key={j}>{d}</li>)}
                  </ul>
                )}
                {s.warning && <p className="review-warning">{s.warning}</p>}
                <dl className="review-facts">
                  <div><dt>{t('Contract')}</dt><dd>{explorerUrl ? <a href={`${explorerUrl}/address/${s.contract}`} target="_blank" rel="noreferrer">{t(s.contractName)} · <span className="mono">{shortAddress(s.contract)}</span></a> : <>{t(s.contractName)} · <span className="mono">{shortAddress(s.contract)}</span></>}</dd></div>
                  <div><dt>{t('Action')}</dt><dd className="mono">{s.functionName}</dd></div>
                  {s.value > 0n && <div><dt>{t('ETH sent')}</dt><dd>{eth(s.value)}</dd></div>}
                </dl>
                <details className="review-raw">
                  <summary>{t('What your wallet will show')}</summary>
                  <p className="hint">
                    {t('Your wallet may show this as raw data, or say “Unknown signature type” or “Simulation not supported”, because it does not recognise {network} yet. Check that it is sent to {contract} and that the data starts with {selector}.', {
                      network: chain.name,
                      contract: <span key="c" className="mono">{s.contract}</span>,
                      selector: <span key="s" className="mono">{s.selector}</span>,
                    })}
                  </p>
                  <code className="raw">{s.data}</code>
                </details>
              </div>
            </li>
          ))}
        </ol>
        <div className="dialog-foot">
          <button type="button" className="btn btn-plain" onClick={() => onClose(false)}>{t('Cancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => onClose(true)}>{t('Continue in wallet')}</button>
        </div>
      </div>
    </div>
  );
}
