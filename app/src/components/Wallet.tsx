import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { chain } from '../config';
import { shortAddress } from '../lib/format';
import { usePrimaryName } from '../lib/hooks';

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
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
        Switch to {chain.name}
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="wallet" ref={ref}>
        <button type="button" className="btn btn-plain mono" aria-expanded={open} onClick={() => setOpen(!open)}>
          {primary.data ?? shortAddress(address)}
        </button>
        {open && (
          <div className="menu" role="menu">
            <span className="small faint mono" style={{ padding: '8px 12px' }}>{shortAddress(address)}</span>
            <Link role="menuitem" to="/names" onClick={() => setOpen(false)}>My names</Link>
            <button role="menuitem" type="button" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
          </div>
        )}
      </div>
    );
  }

  // EIP-6963 announces each installed wallet; the generic injected one is a fallback.
  const announced = connectors.filter((c) => c.id !== 'injected');
  const choices = announced.length ? announced : connectors;

  return (
    <div className="wallet" ref={ref}>
      <button type="button" className="btn btn-dark" disabled={isPending} aria-expanded={open} onClick={() => setOpen(!open)}>
        {isPending ? 'Connecting…' : 'Connect wallet'}
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
              {c.id === 'injected' ? 'Browser wallet' : c.name}
            </button>
          ))}
          {!choices.length && <span className="small faint" style={{ padding: 12 }}>No browser wallet found. Install one such as MetaMask or Rabby.</span>}
          {error && <span className="small" style={{ padding: 12, color: 'var(--warn)' }}>{error.message.split('\n')[0]}</span>}
        </div>
      )}
    </div>
  );
}

/** Shown in place of an action that needs a wallet. */
export function ConnectPrompt({ what }: { what: string }) {
  return (
    <div className="notice info">
      <p>Connect a wallet to {what}.</p>
      <WalletButton />
    </div>
  );
}
