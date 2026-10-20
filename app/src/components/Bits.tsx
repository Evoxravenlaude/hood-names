import { explorerUrl } from '../config';
import { useT } from '../i18n';
import type { TxState } from '../lib/tx';

export function Status({ tone, children }: { tone: 'good' | 'bad' | 'neutral'; children: string }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

/** Progress and outcome of a transaction run by useTx. Step labels arrive translated. */
export function TxNotice({ state, success }: { state: TxState; success?: string }) {
  const t = useT();
  const link = state.hash && explorerUrl ? `${explorerUrl}/tx/${state.hash}` : undefined;
  if (state.busy)
    return (
      <p className="hint" role="status">
        {state.step === 'Preparing' ? (
          t('Preparing…')
        ) : (
          <>
            {state.step ?? t('Working')}… {state.hash ? t('waiting for the network.') : t('confirm in your wallet.')}
          </>
        )}{' '}
        {link && <a href={link} target="_blank" rel="noreferrer">{t('View')}</a>}
      </p>
    );
  if (state.error)
    return <p className="error-text" role="alert">{state.error}</p>;
  if (state.done && success)
    return (
      <p className="hint" role="status" style={{ color: 'var(--good)' }}>
        {success} {link && <a href={link} target="_blank" rel="noreferrer">{t('View transaction')}</a>}
      </p>
    );
  return null;
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** A name as text: never rewritten by a browser translator, set in the name face. */
export function NameText({ children, className }: { children: string; className?: string }) {
  return (
    <bdi className={'nameface ' + (className ?? '')} translate="no">
      {children}
    </bdi>
  );
}
