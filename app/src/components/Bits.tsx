import { explorerUrl } from '../config';
import type { TxState } from '../lib/tx';

export function Status({ tone, children }: { tone: 'good' | 'bad' | 'neutral'; children: string }) {
  return <span className={`status ${tone}`}>{children}</span>;
}

/** Progress and outcome of a transaction run by useTx. */
export function TxNotice({ state, success }: { state: TxState; success?: string }) {
  const link = state.hash && explorerUrl ? `${explorerUrl}/tx/${state.hash}` : undefined;
  if (state.busy)
    return (
      <p className="hint" role="status">
        {state.step === 'Preparing' ? 'Preparing…' : <>{state.step ?? 'Working'}… {state.hash ? 'waiting for the network.' : 'confirm in your wallet.'}</>}{' '}
        {link && <a href={link} target="_blank" rel="noreferrer">View</a>}
      </p>
    );
  if (state.error)
    return <p className="error-text" role="alert">{state.error}</p>;
  if (state.done && success)
    return (
      <p className="hint" role="status" style={{ color: 'var(--accent)' }}>
        {success} {link && <a href={link} target="_blank" rel="noreferrer">View transaction</a>}
      </p>
    );
  return null;
}

export function SearchIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6B6F76" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}
