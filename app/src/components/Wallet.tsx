import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { chain } from '../config';
import { shortAddress } from '../lib/format';
import { usePrimaryName } from '../lib/hooks';
import { Avatar } from './Avatar';
import { useT } from '../i18n';

export function WalletButton() {
  const t = useT();
  const { address, isConnected, chainId, status } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const primary = usePrimaryName(address);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (isConnected && chainId !== chain.id) {
    return (
      <button type="button" className="btn btn-dark" onClick={() => switchChain({ chainId: chain.id })}>
        {t('Switch to {network}', { network: chain.name })}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="wallet" ref={ref}>
        <button type="button" className={'btn btn-plain' + (primary.data ? ' nameface' : ' mono')} translate="no" aria-expanded={open} onClick={() => setOpen(!open)} style={{ paddingLeft: primary.data ? 8 : undefined }}>
          {primary.data && primary.data.split('.').length === 2 && <Avatar label={primary.data.split('.')[0]} size={28} />}
          {primary.data ?? shortAddress(address)}
        </button>
        {open && (
          <div className="menu" role="menu">
            <span className="small faint mono" style={{ padding: '8px 12px' }} translate="no">{shortAddress(address)}</span>
            <Link role="menuitem" to="/names" onClick={() => setOpen(false)}>{t('My names')}</Link>
            <button role="menuitem" type="button" onClick={() => { disconnect(); setOpen(false); }}>{t('Disconnect')}</button>
          </div>
        )}
      </div>
    );
  }

  // While the wallet from the last visit is being reconnected, don't offer
  // to connect again: a second connection would race the first.
  if (status === 'reconnecting')
    return (
      <button type="button" className="btn btn-plain" disabled>
        {t('Connecting…')}
      </button>
    );

  // EIP-6963 announces each installed wallet; the generic injected one is a fallback.
  const announced = connectors.filter((c) => c.id !== 'injected');
  const choices = announced.length ? announced : connectors;

  return (
    <div className="wallet" ref={ref}>
      <button type="button" className="btn btn-dark" disabled={isPending} aria-expanded={open} onClick={() => setOpen(!open)}>
        {isPending ? t('Connecting…') : t('Connect wallet')}
      </button>
      {open && (
        <div className="menu" role="menu">
          {choices.map((c) => (
            <button
              key={c.uid}
              role="menuitem"
              type="button"
              onClick={() => {
                connect({ connector: c, chainId: chain.id });
                setOpen(false);
              }}
            >
              {c.icon && <img src={c.icon} alt="" />}
              {c.id === 'injected' ? t('Browser wallet') : c.name}
            </button>
          ))}
          <span className="small faint" style={{ padding: '8px 12px', lineHeight: 1.45 }}>
            {t('Connecting only shares your wallet address with this site. Nothing is signed or sent until you confirm a step.')}
          </span>
          {!choices.length && <span className="small faint" style={{ padding: 12 }}>{t('No browser wallet found. Install one such as MetaMask or Rabby.')}</span>}
          {error && <span className="small" style={{ padding: 12, color: 'var(--warn)' }}>{error.message.split('\n')[0]}</span>}
        </div>
      )}
    </div>
  );
}

/** Shown in place of an action that needs a wallet. */
export function ConnectPrompt({ what }: { what: string }) {
  const t = useT();
  return (
    <div className="notice info">
      <p>{t('Connect a wallet to {what}.', { what })}</p>
      <WalletButton />
    </div>
  );
}
