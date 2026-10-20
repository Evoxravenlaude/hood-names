import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useBalance, useSwitchChain } from 'wagmi';
import { chain } from '../config';
import { useT } from '../i18n';
import { useAvatar, useOwnedNames, usePrimaryName } from '../lib/hooks';
import { WalletButton } from './Wallet';

const KEY = 'hood-names-setup-hidden';

interface Step {
  id: string;
  title: string;
  body: string;
  done: boolean;
  action?: ReactNode;
}

/**
 * The way in, as a checklist that ticks itself: each step is worked out
 * from the wallet and the chain, not from clicks, so it is right on any
 * device. It hides itself once everything is done.
 */
export function GettingStarted({ onFindName, compact }: { onFindName?: () => void; compact?: boolean }) {
  const t = useT();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === chain.id;
  const balance = useBalance({ address, chainId: chain.id, query: { enabled: !!address, refetchInterval: 15_000 } });
  const owned = useOwnedNames(onChain ? address : undefined);
  const primary = usePrimaryName(onChain ? address : undefined);
  const mine = owned.data?.find((n) => n.status.state === 'Active');
  const pictureFor = primary.data?.split('.').length === 2 ? primary.data.split('.')[0] : mine?.label;
  const avatar = useAvatar(pictureFor);
  const { switchChain, isPending: switching } = useSwitchChain();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  const steps: Step[] = [
    {
      id: 'wallet',
      title: t('Connect a wallet'),
      body: t('A wallet app holds your money and confirms each step. No wallet yet? MetaMask and Rabby are free browser apps.'),
      done: isConnected,
      action: !isConnected && (
        <span className="step-actions">
          <WalletButton />
          <a className="btn btn-ghost" href="https://rabby.io" target="_blank" rel="noreferrer" translate="no">Rabby</a>
          <a className="btn btn-ghost" href="https://metamask.io/download/" target="_blank" rel="noreferrer" translate="no">MetaMask</a>
        </span>
      ),
    },
    {
      id: 'network',
      title: t('Switch to {network}', { network: chain.name }),
      body: t('One tap adds the network to your wallet if it is not there yet.'),
      done: onChain,
      action: isConnected && !onChain && (
        <button type="button" className="btn btn-primary" disabled={switching} onClick={() => switchChain({ chainId: chain.id })}>
          {switching ? t('Check your wallet…') : t('Add {network}', { network: chain.name })}
        </button>
      ),
    },
    {
      id: 'fees',
      title: t('Get a little ETH for fees'),
      body: chain.testnet
        ? t('Test ETH is free from a faucet. Each confirmation uses a tiny amount.')
        : t('Each confirmation costs a small network fee, paid in ETH.'),
      done: !!balance.data && balance.data.value > 0n,
      action: onChain && chain.testnet && !(balance.data && balance.data.value > 0n) && (
        <Link className="btn btn-plain" to="/faucet">{t('Get test tokens')}</Link>
      ),
    },
    {
      id: 'name',
      title: t('Pick your name'),
      body: t('Search for it, then confirm twice, about a minute apart.'),
      done: !!mine,
      action: onChain && !mine && (onFindName ? (
        <button type="button" className="btn btn-plain" onClick={onFindName}>{t('Find a name')}</button>
      ) : (
        <Link className="btn btn-plain" to="/">{t('Find a name')}</Link>
      )),
    },
    {
      id: 'primary',
      title: t('Make it your primary name'),
      body: t('Apps then show your name instead of your address.'),
      done: !!primary.data,
      action: mine && !primary.data && <Link className="btn btn-plain" to={`/name/${encodeURIComponent(mine.label)}`}>{t('Set it up')}</Link>,
    },
    {
      id: 'picture',
      title: t('Add a profile picture'),
      body: t('It is stored with your name and shows wherever your name does.'),
      done: !!avatar.data,
      action: mine && !avatar.data && pictureFor && (
        <Link className="btn btn-plain" to={`/name/${encodeURIComponent(pictureFor)}`}>{t('Add a picture')}</Link>
      ),
    },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const complete = !next;

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* fine */
    }
  };

  return (
    <section className={'setup' + (compact ? ' compact' : '')} aria-labelledby="setup-h">
      <div className="setup-head">
        <div>
          <h2 id="setup-h">{complete ? t('You’re all set') : t('Get started')}</h2>
          <p className="muted">
            {complete ? t('Your name is live. People can send to it instead of your address.') : t('{done} of {total} done', { done, total: steps.length })}
          </p>
        </div>
        <button type="button" className="btn btn-ghost small" onClick={dismiss}>{complete ? t('Close') : t('Hide')}</button>
      </div>
      <div className="setup-bar" aria-hidden="true"><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="setup-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={(s.done ? 'done' : '') + (s === next ? ' next' : '')}>
            <span className="setup-mark" aria-hidden="true">
              {s.done ? (
                <svg width="14" height="14" viewBox="0 0 14 14"><path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="setup-text">
              <span className="setup-title">
                {s.title}
                <span className="sr-only">{s.done ? t('(done)') : ''}</span>
              </span>
              {s === next && <span className="setup-body">{s.body}</span>}
              {s === next && s.action && <div className="setup-action">{s.action}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
