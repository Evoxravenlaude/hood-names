import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { encodeFunctionData, erc20Abi, type Address, type Hex, toHex, zeroAddress, zeroHash } from 'viem';
import { useAccount, useBalance, useConfig, useReadContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { controllerAbi, guardAbi, pointsLedgerAbi, resolverAbi } from '../abi';
import { deployment, modules, parentName, YEAR } from '../config';
import { Status, TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { eth, token, usd } from '../lib/format';
import { refHash, useControllerInfo, useNameStatus, usePrimaryName, useStablecoin } from '../lib/hooks';
import { fullName, nodeOf, parseLabel } from '../lib/names';
import { useTx } from '../lib/tx';

type Pay = 'eth' | 'token' | 'points';

interface Registration {
  label: string;
  owner: Address;
  duration: bigint;
  secret: Hex;
  resolver: Address;
  data: Hex[];
  reverseRecord: number;
  referrer: Hex;
}

interface Pending {
  reg: Registration;
  committedAt: number;
}

const storeKey = (label: string, owner: Address) => `hood:commit:${deployment?.chainId}:${owner.toLowerCase()}:${label}`;

function loadPending(label: string, owner: Address | undefined): Pending | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(storeKey(label, owner));
    if (!raw) return null;
    const p = JSON.parse(raw) as { reg: Omit<Registration, 'duration'> & { duration: string }; committedAt: number };
    return { committedAt: p.committedAt, reg: { ...p.reg, duration: BigInt(p.reg.duration) } };
  } catch {
    return null;
  }
}

function savePending(p: Pending | null, label: string, owner: Address) {
  try {
    if (!p) localStorage.removeItem(storeKey(label, owner));
    else localStorage.setItem(storeKey(label, owner), JSON.stringify({ committedAt: p.committedAt, reg: { ...p.reg, duration: p.reg.duration.toString() } }));
  } catch {
    // Private mode: the flow still works within this page visit.
  }
}

const randomSecret = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)));

export function Register() {
  const params = useParams();
  const parsed = parseLabel(decodeURIComponent(params.label ?? ''));
  if (!parsed.ok) {
    return (
      <div className="page narrow">
        <Link to="/" className="back">← Back to search</Link>
        <p className="error-text">{parsed.reason}</p>
      </div>
    );
  }
  return <RegisterName label={parsed.label} />;
}

function RegisterName({ label }: { label: string }) {
  const config = useConfig();
  const { address } = useAccount();
  const status = useNameStatus(label);
  const { paused, minAge, maxAge } = useControllerInfo();
  const coin = useStablecoin();
  const ethBalance = useBalance({ address, query: { enabled: !!address } });
  const points = useReadContract({
    address: deployment?.HoodPointsLedger,
    abi: pointsLedgerAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: modules.points && !!address },
  });

  const [years, setYears] = useState(1);
  const [pay, setPay] = useState<Pay>(coin.enabled ? 'token' : 'eth');
  const currentPrimary = usePrimaryName(address);
  const [primary, setPrimary] = useState(true);
  // Only offer to replace a primary name the wallet already has if asked.
  useEffect(() => {
    if (currentPrimary.data) setPrimary(false);
  }, [currentPrimary.data]);
  const [refText, setRefText] = useState('');
  const [pending, setPending] = useState<Pending | null>(() => loadPending(label, address));
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [registered, setRegistered] = useState(false);
  const tx = useTx();

  useEffect(() => setPending(loadPending(label, address)), [label, address]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (coin.enabled && pay === 'eth' && !pending) setPay('token');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coin.enabled]);

  const ref = parseLabel(refText);
  const referrerLabel = modules.referrals && refText.trim() && ref.ok && ref.label !== label ? ref.label : undefined;
  const referrerPayee = useReadContract({
    address: deployment?.HoodNameGuard,
    abi: guardAbi,
    functionName: 'referrerPayee',
    args: referrerLabel ? [refHash(referrerLabel)] : undefined,
    query: { enabled: !!referrerLabel },
  });
  const referrerOk = !!referrerPayee.data && referrerPayee.data !== zeroAddress && referrerPayee.data.toLowerCase() !== address?.toLowerCase();

  // What the commitment covers. Locked once the first step is done.
  const duration = pending?.reg.duration ?? BigInt(years) * YEAR;
  const referrer: Hex = pending?.reg.referrer ?? (referrerOk && referrerLabel ? refHash(referrerLabel) : zeroHash);

  const payment = useMemo(
    () => ({
      token: pay === 'token' && coin.address ? coin.address : zeroAddress,
      usePoints: pay === 'points',
      maxTokenAmount: 0n,
    }),
    [pay, coin.address],
  );

  const quote = useReadContract({
    address: deployment?.HoodRegistrarController,
    abi: controllerAbi,
    functionName: 'quoteRegistration',
    args: [label, address ?? zeroAddress, duration, referrer, address ?? zeroAddress, payment],
    query: { enabled: !!deployment, refetchInterval: 20_000 },
  });
  const pricing = useReadContract({
    address: deployment?.HoodNameGuard,
    abi: guardAbi,
    functionName: 'pricing',
    args: [label],
    query: { enabled: !!deployment },
  });
  const allowance = useReadContract({
    address: coin.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && deployment ? [address, deployment!.HoodRegistrarController] : undefined,
    query: { enabled: coin.enabled && !!address },
  });

  const q = quote.data;
  const ready = pending ? now >= pending.committedAt + Number(minAge ?? 60n) + 3 : false;
  const expired = pending ? now > pending.committedAt + Number(maxAge ?? 86400n) - 60 : false;
  const waitLeft = pending ? Math.max(0, Math.ceil(pending.committedAt + Number(minAge ?? 60n) + 3 - now)) : 0;
  const step = registered ? 3 : !pending ? 0 : ready && !expired ? 2 : 1;

  const s = status.data;
  const length = [...label].length;
  const pricedShorter = pricing.data && pricing.data[0] < BigInt(length);

  if (s && s.state !== 'Available' && !pending && !registered) {
    return (
      <div className="page narrow">
        <Link to={`/?q=${encodeURIComponent(label)}`} className="back">← Back to search</Link>
        <div className="notice warn" style={{ marginTop: 16 }}>
          <p>{fullName(label)} cannot be registered right now ({s.state === 'Similar' ? 'it looks like a registered name' : s.state.toLowerCase()}).</p>
        </div>
      </div>
    );
  }

  const startCommit = async () => {
    if (!address || !deployment) return;
    const node = nodeOf(label);
    const reg: Registration = {
      label,
      owner: address,
      duration,
      secret: randomSecret(),
      resolver: deployment!.PublicResolver,
      data: [encodeFunctionData({ abi: resolverAbi, functionName: 'setAddr', args: [node, address] })],
      reverseRecord: primary ? 1 : 0,
      referrer,
    };
    const ok = await tx.run([
      {
        label: 'Reserving the name',
        args: async () => {
          const commitment = await readContract(config, {
            address: deployment!.HoodRegistrarController,
            abi: controllerAbi,
            functionName: 'makeCommitment',
            args: [reg] as never,
          });
          return { address: deployment!.HoodRegistrarController, abi: controllerAbi, functionName: 'commit', args: [commitment] };
        },
      },
    ]);
    if (ok) {
      const p = { reg, committedAt: Math.floor(Date.now() / 1000) };
      savePending(p, label, address);
      setPending(p);
      tx.reset();
    }
  };

  const finish = async () => {
    if (!address || !deployment || !pending) return;
    const fresh = await readContract(config, {
      address: deployment!.HoodRegistrarController,
      abi: controllerAbi,
      functionName: 'quoteRegistration',
      args: [label, address, pending.reg.duration, pending.reg.referrer, address, payment],
    });
    const steps: Parameters<typeof tx.run>[0] = [];
    const isToken = payment.token !== zeroAddress;
    if (isToken && (allowance.data ?? 0n) < fresh.amountDue) {
      steps.push({
        label: `Allowing ${coin.symbol} payment`,
        args: () => ({ address: payment.token, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodRegistrarController, fresh.amountDue] }),
      });
    }
    steps.push({
      label: 'Registering',
      args: () => ({
        address: deployment!.HoodRegistrarController,
        abi: controllerAbi,
        functionName: 'registerWithPayment',
        args: [pending.reg, { ...payment, maxTokenAmount: isToken ? fresh.amountDue : 0n }],
        // ETH: a 1% cushion for price movement, refunded by the contract.
        value: isToken ? 0n : fresh.amountDue + fresh.amountDue / 100n,
      }),
    });
    const ok = await tx.run(steps);
    if (ok) {
      savePending(null, label, address);
      setPending(null);
      setRegistered(true);
    }
  };

  const startOver = () => {
    if (address) savePending(null, label, address);
    setPending(null);
    tx.reset();
  };

  const amount = q
    ? payment.token !== zeroAddress
      ? token(q.amountDue, coin.decimals, coin.symbol)
      : q.amountDue === 0n
        ? 'Covered by points'
        : eth(q.amountDue)
    : '…';
  const clock = `${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, '0')}`;

  const steps = [
    ['Reserve the name', 'First wallet confirmation. Only the network fee.'],
    ['Wait about a minute', 'Keeps your choice private until it is locked in.'],
    ['Confirm and pay', 'Second confirmation. The name is yours.'],
  ];

  return (
    <div className="page">
      <Link to={`/?q=${encodeURIComponent(label)}`} className="back">← Back to search</Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '12px 20px', margin: '16px 0 32px' }}>
        <h1 className="name-title">{label}<span className="dim">.{parentName}</span></h1>
        {registered ? <Status tone="good">Yours</Status> : <Status tone="good">Available</Status>}
      </div>

      {registered ? (
        <div className="card card-pad stack" style={{ maxWidth: 640 }}>
          <h2>{fullName(label)} is yours.</h2>
          <p className="muted" style={{ margin: 0 }}>It already points to your wallet{primary ? ' and is your primary name' : ''}. Add your socials and an avatar next.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to={`/name/${encodeURIComponent(label)}`}>Set up {fullName(label)}</Link>
            <Link className="btn btn-plain" to="/names">My names</Link>
          </div>
          <TxNotice state={tx.state} success="Registered." />
        </div>
      ) : (
        <div className="row">
          <div className="main-col">
            <section className="card card-pad stack">
              <h2>How long</h2>
              <div className="choice-grid" role="group" aria-label="Registration length">
                {[1, 2, 3, 5].map((y) => (
                  <button key={y} type="button" className="choice" aria-pressed={Number(duration / YEAR) === y} disabled={!!pending} onClick={() => setYears(y)}>
                    {y} {y === 1 ? 'year' : 'years'}
                  </button>
                ))}
              </div>
              <p className="hint">Renew any time before it expires. After expiry there are 90 days to renew before anyone else can take it.</p>
            </section>

            <section className="card card-pad stack">
              <h2>Pay with</h2>
              <div className="choice-grid" role="group" aria-label="Payment">
                {coin.enabled && (
                  <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>
                    {coin.symbol}
                    <span className="sub">Balance {token(coin.balance, coin.decimals, coin.symbol)}</span>
                  </button>
                )}
                <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>
                  ETH
                  <span className="sub">Balance {eth(ethBalance.data?.value, 4)}</span>
                </button>
                {modules.points && (
                  <button type="button" className="choice" aria-pressed={pay === 'points'} onClick={() => setPay('points')}>
                    Points
                    <span className="sub">{usd(points.data ?? 0n)} from gift cards, rest in ETH</span>
                  </button>
                )}
              </div>
              {coin.isTest && <p className="hint">tUSD is a free test dollar on this network. Get some from <Link to="/names">My names</Link>.</p>}
            </section>

            <section className="card card-pad stack" style={{ gap: 18 }}>
              <h2>Set up</h2>
              <label className="check">
                <input type="checkbox" checked={pending ? pending.reg.reverseRecord === 1 : primary} disabled={!!pending} onChange={() => setPrimary(!primary)} />
                <span>
                  <span style={{ display: 'block', fontWeight: 500 }}>Make it my primary name</span>
                  <span className="hint">
                    {currentPrimary.data
                      ? `Apps show ${fullName(label)} instead of ${currentPrimary.data}.`
                      : `Apps show ${fullName(label)} instead of your address.`}
                  </span>
                </span>
              </label>
              {modules.referrals && (
                <div className="field">
                  <label htmlFor="ref">Referred by <span className="faint" style={{ fontWeight: 400 }}>(optional)</span></label>
                  <div className="input-wrap" style={{ maxWidth: 360 }}>
                    <input id="ref" value={refText} disabled={!!pending} onChange={(e) => setRefText(e.target.value)} autoCapitalize="off" spellCheck={false} />
                    <span className="mono dim">.{parentName}</span>
                  </div>
                  {referrerLabel && (
                    <p className="hint">
                      {referrerPayee.isLoading ? 'Checking…' : referrerOk ? `${fullName(referrerLabel)} earns a commission and you get a discount.` : `${fullName(referrerLabel)} can't be used as a referrer, so no discount applies.`}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="side-col">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-pad stack" style={{ gap: 14 }}>
                <h2>Summary</h2>
                <div className="line"><span className="k">{fullName(label)} × {Number(duration / YEAR)} {duration / YEAR === 1n ? 'year' : 'years'}</span><span>{usd(q?.usdBase)}</span></div>
                {q && q.usdPremium > 0n && <div className="line"><span className="k">Release premium</span><span>{usd(q.usdPremium)}</span></div>}
                {q && q.pointsUsed > 0n && <div className="line"><span className="k">Points</span><span>−{usd(q.pointsUsed)}</span></div>}
                {q && q.refereeDiscount > 0n && (
                  <div className="line"><span className="k">Referral discount</span><span>−{payment.token !== zeroAddress ? token(q.refereeDiscount, coin.decimals, coin.symbol) : eth(q.refereeDiscount)}</span></div>
                )}
                <div className="total"><span style={{ fontWeight: 600 }}>You pay</span><span className="price">{amount}</span></div>
                {pricedShorter && pricing.data && (
                  <p className="hint">Priced as a {pricing.data[0].toString()}-character name, because it reads like one.</p>
                )}
                <p className="hint" style={{ textAlign: 'right' }}>Plus the network fee.</p>
              </div>
              <div className="card-foot stack">
                <ol className="steps">
                  {steps.map(([t, sub], i) => (
                    <li key={t}>
                      <span className={'dot' + (step > i ? ' done' : step === i ? ' now' : '')}>{step > i ? '✓' : i + 1}</span>
                      <span><span className="t">{t}</span><span className="s">{sub}</span></span>
                    </li>
                  ))}
                </ol>
                {!address ? (
                  <ConnectPrompt what="register a name" />
                ) : paused ? (
                  <p className="hint">Registration has not opened yet.</p>
                ) : expired ? (
                  <>
                    <p className="error-text">The reservation expired before it was completed.</p>
                    <button type="button" className="btn btn-plain" onClick={startOver}>Start again</button>
                  </>
                ) : step === 0 ? (
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={tx.state.busy || !q} onClick={startCommit}>
                    Reserve {fullName(label)}
                  </button>
                ) : step === 1 ? (
                  <button type="button" className="btn btn-lg btn-block" disabled style={{ background: 'var(--faint)', color: '#fff' }}>
                    Waiting… {clock}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={tx.state.busy || !q} onClick={finish}>
                    Confirm and pay
                  </button>
                )}
                <TxNotice state={tx.state} />
                {pending && !tx.state.busy && (
                  <button type="button" className="linkish" onClick={startOver}>Change the options and start again</button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
