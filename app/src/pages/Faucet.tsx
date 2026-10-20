import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useBalance } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { testUsdAbi } from '../abi';
import { chain, explorerUrl } from '../config';
import { TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { eth, token } from '../lib/format';
import { useCountdown, useStablecoin } from '../lib/hooks';
import { useTx } from '../lib/tx';
import { mark, t, useT } from '../i18n';

/** Places that give out Robinhood Chain testnet ETH. Checked October 2026. */
const FAUCETS = [
  {
    name: 'Robinhood Chain faucet',
    url: 'https://faucet.testnet.chain.robinhood.com/',
    note: mark('The official one. Test ETH and test Stock Tokens; just a wallet address.'),
  },
  {
    name: 'Alchemy',
    url: 'https://www.alchemy.com/faucets/robinhood-testnet',
    note: mark('0.1 ETH a day. Needs a little mainnet ETH and history on the address.'),
  },
  {
    name: 'QuickNode',
    url: 'https://faucet.quicknode.com/robinhood/testnet',
    note: mark('Every 12 hours. Needs 0.001 mainnet ETH.'),
  },
  {
    name: 'ethfaucet.com',
    url: 'https://ethfaucet.com/networks/robinhood/robinhood-testnet',
    note: mark('Up to 0.1 ETH a day after an identity check. No mainnet balance needed.'),
  },
];

function clock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h ? t('{h}h {m}m', { h, m: String(m).padStart(2, '0') }) : `${m}:${String(s).padStart(2, '0')}`;
}

export function Faucet() {
  const t = useT();
  const { address } = useAccount();
  const ethBalance = useBalance({ address, query: { enabled: !!address, refetchInterval: 15_000 } });
  const coin = useStablecoin();
  const wait = useCountdown(coin.nextClaimAt);
  const tx = useTx();
  const [copied, setCopied] = useState(false);

  if (!chain.testnet)
    return (
      <div className="page narrow">
        <p className="muted">{t('Test tokens are only for the test network.')}</p>
      </div>
    );

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 12 }}>
        <h1 className="title">{t('Test tokens')}</h1>
        <p className="lede">
          {t('Everything here is for {network} and has no value. You need a little test ETH for network fees, and test dollars if you want to try paying in a stablecoin.', { network: chain.name })}
        </p>
      </div>

      {!address ? (
        <ConnectPrompt what={t('see your balances and claim test dollars')} />
      ) : (
        <div className="card card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 40px', alignItems: 'center' }}>
          <div>
            <div className="small faint">{t('Test ETH')}</div>
            <div className="figure" translate="no">{eth(ethBalance.data?.value, 4)}</div>
          </div>
          {coin.isTest && (
            <div>
              <div className="small faint">{t('Test dollars')}</div>
              <div className="figure" translate="no">{token(coin.balance ?? 0n, coin.decimals, coin.symbol)}</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="mono small muted" style={{ overflowWrap: 'anywhere' }} translate="no">{address}</span>
            <button
              type="button"
              className="btn btn-plain"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* clipboard blocked; the address is shown */
                }
              }}
            >
              {copied ? t('Copied') : t('Copy address')}
            </button>
          </div>
        </div>
      )}

      <div className="row">
        <section className="main-col card card-pad" style={{ gap: 14 }}>
          <h2>{t('Test ETH, for network fees')}</h2>
          <Drip />
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {t('Claim from one of these: paste your address there and come back. Your balance above updates on its own.')}
          </p>
          <ul className="rows">
            {FAUCETS.map((f) => (
              <li key={f.url}>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div className="small faint">{t(f.note)}</div>
                </div>
                <a className="btn btn-plain" href={f.url} target="_blank" rel="noreferrer">{t('Open')}</a>
              </li>
            ))}
          </ul>
        </section>

        {coin.isTest && (
          <aside className="side-col">
            <section className="card card-pad stack" style={{ gap: 12 }}>
              <h2>{t('Test dollars (tUSD)')}</h2>
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                {t('1,000 at a time, once every six hours. Use them to pay for names and gift cards.')}
              </p>
              {address && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={tx.state.busy || wait > 0}
                    onClick={() =>
                      tx.run([{ label: t('Claiming'), args: () => ({ address: coin.address!, abi: testUsdAbi, functionName: 'claim', args: [] }) }])
                    }
                  >
                    {wait > 0 ? t('Next claim in {time}', { time: clock(wait) }) : t('Claim 1,000 tUSD')}
                  </button>
                  {(ethBalance.data?.value ?? 0n) === 0n && <p className="hint">{t('Claiming needs a little test ETH for the network fee.')}</p>}
                  <TxNotice state={tx.state} success={t('Added to your wallet.')} />
                </>
              )}
            </section>
            <p className="hint">
              {t('Then {find} or {buy}.', { find: <Link key="f" to="/">{t('find a name')}</Link>, buy: <Link key="b" to="/gift-cards">{t('buy a gift card')}</Link> })}
              {explorerUrl && coin.address && <> {t('The token contract is {link}.', { link: <a key="l" href={`${explorerUrl}/address/${coin.address}`} target="_blank" rel="noreferrer">{t('on the explorer')}</a> })}</>}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}

/** A one-click drip from this site's own faucet, when the host has one set up. */
function Drip() {
  const t = useT();
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [info, setInfo] = useState<{ enabled: boolean; amount?: string } | null>(null);
  const [state, setState] = useState<{ busy?: boolean; message?: string; error?: string }>({});

  useEffect(() => {
    let live = true;
    fetch('/api/faucet')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => live && setInfo(j))
      .catch(() => live && setInfo({ enabled: false }));
    return () => {
      live = false;
    };
  }, []);

  if (!info?.enabled || !address) return null;
  return (
    <div className="notice info">
      <p>{info.amount ? t('Get {amount} test ETH from this site, enough for a few registrations.', { amount: info.amount }) : t('Get a little test ETH from this site, enough for a few registrations.')}</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={state.busy}
        onClick={async () => {
          setState({ busy: true });
          try {
            const r = await fetch('/api/faucet', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ address }),
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ? t(j.error) : t('The faucet could not send right now.'));
            setState({ message: t('Sent. It arrives in a few seconds.') });
            setTimeout(() => queryClient.invalidateQueries(), 4000);
          } catch (e) {
            setState({ error: e instanceof Error ? e.message : t('The faucet could not send right now.') });
          }
        }}
      >
        {state.busy ? t('Sending…') : t('Send me test ETH')}
      </button>
      {state.message && <p className="small" style={{ flexBasis: '100%', margin: 0 }}>{state.message}</p>}
      {state.error && <p className="error-text" style={{ flexBasis: '100%' }}>{state.error}</p>}
    </div>
  );
}
