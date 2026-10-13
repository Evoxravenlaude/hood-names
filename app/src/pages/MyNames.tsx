import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { zeroAddress } from 'viem';
import { useAccount, useReadContract } from 'wagmi';
import { pointsLedgerAbi, referralHubAbi } from '../abi';
import { chain, deployment, explorerUrl, GRACE_PERIOD, modules } from '../config';
import { Avatar } from '../components/Avatar';
import { TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { date, eth, token, usd } from '../lib/format';
import { useOwnedNames, usePointsActivity, usePrimaryName, useStablecoin } from '../lib/hooks';
import { fullName } from '../lib/names';
import { useTx } from '../lib/tx';

const DAY = 86400n;

export function MyNames() {
  const { address } = useAccount();
  const owned = useOwnedNames(address);
  const primary = usePrimaryName(address);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const lapsed = owned.data?.filter((n) => n.status.state === 'Grace') ?? [];

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
        <h1 className="title" style={{ marginRight: 'auto' }}>My names</h1>
        <Link className="btn btn-primary" to="/">Get a name</Link>
      </div>

      {!address ? (
        <ConnectPrompt what="see your names" />
      ) : (
        <>
          {lapsed.map((n) => (
            <div key={n.label} className="notice warn" role="alert">
              <p><strong>{fullName(n.label)} has expired.</strong> It has stopped working. Renew by {date(n.status.expires + GRACE_PERIOD)} or anyone can register it.</p>
              <Link className="btn btn-danger" to={`/name/${encodeURIComponent(n.label)}?tab=ownership`}>Renew now</Link>
            </div>
          ))}

          <section className="card" style={{ overflow: 'hidden' }}>
            {owned.isLoading ? (
              <p className="card-pad muted" style={{ margin: 0 }}>Looking up your names…</p>
            ) : owned.isError ? (
              <p className="card-pad error-text" style={{ margin: 0 }}>Could not load your names. Try again in a moment.</p>
            ) : !owned.data?.length ? (
              <div className="card-pad stack">
                <p className="muted" style={{ margin: 0 }}>You don't hold any names yet.</p>
                <Link to="/">Search for one</Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="list fluid">
                  <thead>
                    <tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col" className="hide-sm">Expires</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {owned.data.map(({ label, status }) => {
                      const name = fullName(label);
                      const soon = status.state === 'Active' && status.expires - now < 30n * DAY;
                      return (
                        <tr key={label}>
                          <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <Avatar label={label} size={32} />
                            <Link className="name-link" to={`/name/${encodeURIComponent(label)}`}>{name}</Link>
                            {primary.data === name && <span className="tag">Primary</span>}
                          </td>
                          <td style={{ color: status.state === 'Grace' || soon ? 'var(--warn)' : undefined }}>
                            {status.state === 'Grace' ? 'Expired · grace period' : soon ? `Expires in ${Number((status.expires - now) / DAY)} days` : 'Active'}
                          </td>
                          <td className="hide-sm">{date(status.expires)}</td>
                          <td>
                            <Link to={`/name/${encodeURIComponent(label)}${status.state === 'Grace' || soon ? '?tab=ownership' : ''}`}>
                              {status.state === 'Grace' || soon ? 'Renew' : 'Manage'}
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid-3">
            {modules.points && <Points />}
            {modules.referrals && <Referrals />}
            <TestDollars />
          </div>
          {modules.points && <PointsActivity />}
        </>
      )}
    </div>
  );
}

function Points() {
  const { address } = useAccount();
  const points = useReadContract({
    address: deployment?.HoodPointsLedger,
    abi: pointsLedgerAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="eyebrow" style={{ color: 'var(--faint)' }}>Gift-card points</div>
      <div className="figure">{usd(points.data ?? 0n)}</div>
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>Spend them on a registration or renewal. Points never expire.</p>
      {modules.giftCards && <Link to="/gift-cards">Buy or redeem gift cards</Link>}
    </section>
  );
}

function Referrals() {
  const { address } = useAccount();
  const coin = useStablecoin();
  const tx = useTx();
  const common = { address: deployment?.HoodReferralHub, abi: referralHubAbi, functionName: 'balances' } as const;
  const inEth = useReadContract({ ...common, args: address ? [address, zeroAddress] : undefined, query: { enabled: !!address } });
  const inToken = useReadContract({
    ...common,
    args: address && coin.address ? [address, coin.address] : undefined,
    query: { enabled: !!address && coin.enabled },
  });
  const withdraw = (t: `0x${string}`) =>
    tx.run([{ label: 'Withdrawing', args: () => ({ address: deployment!.HoodReferralHub, abi: referralHubAbi, functionName: 'withdraw', args: [t] }) }]);
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="eyebrow" style={{ color: 'var(--faint)' }}>Referral earnings</div>
      <div className="figure">{eth(inEth.data ?? 0n, 5)}</div>
      {coin.enabled && <div className="muted">{token(inToken.data ?? 0n, coin.decimals, coin.symbol)}</div>}
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>Anyone who enters one of your names as their referrer earns you a commission, and gets a discount.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" className="btn btn-plain" disabled={!inEth.data || tx.state.busy} onClick={() => withdraw(zeroAddress)}>Withdraw ETH</button>
        {coin.enabled && (
          <button type="button" className="btn btn-plain" disabled={!inToken.data || tx.state.busy} onClick={() => withdraw(coin.address!)}>Withdraw {coin.symbol}</button>
        )}
      </div>
      <TxNotice state={tx.state} success="Sent to your wallet." />
    </section>
  );
}

/** Testnet only: where to get test tokens. */
function TestDollars() {
  const coin = useStablecoin();
  if (!chain.testnet) return null;
  return (
    <section className="card card-pad stack" style={{ gap: 10 }}>
      <div className="eyebrow" style={{ color: 'var(--faint)' }}>Test tokens</div>
      {coin.isTest && <div className="figure">{token(coin.balance ?? 0n, coin.decimals, coin.symbol)}</div>}
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>Test ETH for fees and test dollars for paying, all without value.</p>
      <Link className="btn btn-plain" to="/faucet">Get test tokens</Link>
    </section>
  );
}

function PointsActivity() {
  const { address } = useAccount();
  const activity = usePointsActivity(address);
  useEffect(() => {
    if (activity.data?.length && window.location.hash === '#points')
      document.getElementById('points')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activity.data?.length]);
  if (!activity.data?.length) return null;
  return (
    <section id="points" className="card card-pad stack" style={{ gap: 6 }}>
      <h2>Points activity</h2>
      <p className="muted" style={{ margin: 0, fontSize: 15 }}>Gift cards you redeemed, and the names they paid for.</p>
      <ul className="rows" style={{ marginTop: 8 }}>
        {activity.data.map((a) => (
          <li key={a.tx + a.kind}>
            <span className="grow">{a.what}</span>
            <span className="faint small">{a.timestamp ? date(a.timestamp) : `block ${a.block}`}</span>
            <span style={{ fontWeight: 600, color: a.kind === 'credit' ? 'var(--accent)' : undefined, minWidth: 90, textAlign: 'right' }}>
              {a.kind === 'credit' ? '+' : '−'}{usd(a.amount)}
            </span>
            {explorerUrl && <a className="small" href={`${explorerUrl}/tx/${a.tx}`} target="_blank" rel="noreferrer">View</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
