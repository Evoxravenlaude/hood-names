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
import { Plate } from '../components/Plate';
import { saveNameCard } from '../lib/card';
import { currentPalette, currentTheme } from '../lib/theme';
import { Confetti, WaitRing } from '../components/Celebrate';
import { useToast } from '../components/Toast';
import { chain } from '../config';
import { useT } from '../i18n';

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
  /** When the reservation was sent, as this browser saw it. The chain's own record wins once readable. */
  committedAt?: number;
}

const storeKey = (label: string, owner: Address) => `hood:commit:${deployment?.chainId}:${owner.toLowerCase()}:${label}`;

function loadPending(label: string, owner: Address | undefined): Pending | null {
  if (!owner) return null;
  try {
    const raw = localStorage.getItem(storeKey(label, owner));
    if (!raw) return null;
    const p = JSON.parse(raw) as { reg: Omit<Registration, 'duration'> & { duration: string }; committedAt?: number };
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
  const t = useT();
  const params = useParams();
  const parsed = parseLabel(decodeURIComponent(params.label ?? ''));
  if (!parsed.ok) {
    return (
      <div className="page narrow">
        <Link to="/" className="back">← {t('Back to search')}</Link>
        <p className="error-text">{parsed.reason}</p>
      </div>
    );
  }
  return <RegisterName label={parsed.label} />;
}

function RegisterName({ label }: { label: string }) {
  const t = useT();
  const toast = useToast();
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
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
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
  const q = quote.data;
  // The reservation's time as the chain recorded it, so a refresh, another
  // tab or a lost receipt cannot strand it.
  const commitment = useReadContract({
    address: deployment?.HoodRegistrarController,
    abi: controllerAbi,
    functionName: 'makeCommitment',
    args: pending ? ([pending.reg] as never) : undefined,
    query: { enabled: !!pending && !!deployment },
  });
  const onChain = useReadContract({
    address: deployment?.HoodRegistrarController,
    abi: controllerAbi,
    functionName: 'commitments',
    args: commitment.data ? [commitment.data as Hex] : undefined,
    query: { enabled: !!commitment.data, refetchInterval: 5_000 },
  });
  const committedAt = onChain.data && onChain.data > 0n ? Number(onChain.data) : pending?.committedAt;
  const ready = committedAt ? now >= committedAt + Number(minAge ?? 60n) + 3 : false;
  const expired = committedAt ? now > committedAt + Number(maxAge ?? 86400n) - 60 : false;
  const waitLeft = committedAt ? Math.max(0, Math.ceil(committedAt + Number(minAge ?? 60n) + 3 - now)) : 0;
  const step = registered ? 3 : !pending || !committedAt ? 0 : ready && !expired ? 2 : 1;

  const s = status.data;
  const length = [...label].length;
  const pricedShorter = pricing.data && pricing.data[0] < BigInt(length);

  if (s && s.state !== 'Available' && !pending && !registered) {
    return (
      <div className="page narrow">
        <Link to={`/?q=${encodeURIComponent(label)}`} className="back">← {t('Back to search')}</Link>
        <div className="notice warn" style={{ marginTop: 16 }}>
          <p>
            {s.state === 'Similar'
              ? t('{name} cannot be registered right now: it looks like a registered name.', { name: fullName(label) })
              : s.state === 'Reserved'
                ? t('{name} cannot be registered: it is reserved.', { name: fullName(label) })
                : s.state === 'Invalid'
                  ? t('{name} cannot be registered: it is not an allowed name.', { name: fullName(label) })
                  : t('{name} cannot be registered right now: it is taken.', { name: fullName(label) })}
          </p>
        </div>
      </div>
    );
  }

  const startCommit = async () => {
    if (!address || !deployment) return;
    const node = nodeOf(label);
    // A reservation saved earlier but never confirmed is sent again as it is.
    const reg: Registration = pending?.reg ?? {
      label,
      owner: address,
      duration,
      secret: randomSecret(),
      resolver: deployment!.PublicResolver,
      data: [encodeFunctionData({ abi: resolverAbi, functionName: 'setAddr', args: [node, address] })],
      reverseRecord: primary ? 1 : 0,
      referrer,
    };
    await tx.run([
      {
        label: t('Reserving the name'),
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
    ], {
      // The secret is saved before the wallet sends anything, so it is never lost.
      onReviewed: () => {
        const p = { reg };
        savePending(p, label, address);
        setPending(p);
      },
      onSent: () => {
        const p = { reg, committedAt: Math.floor(Date.now() / 1000) };
        savePending(p, label, address);
        setPending(p);
      },
      onSuccess: () => tx.reset(),
    });
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
    const allowed = isToken
      ? await readContract(config, { address: payment.token, abi: erc20Abi, functionName: 'allowance', args: [address, deployment!.HoodRegistrarController] })
      : 0n;
    if (isToken && allowed < fresh.amountDue) {
      steps.push({
        label: t('Allowing {token} payment', { token: coin.symbol }),
        args: () => ({ address: payment.token, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodRegistrarController, fresh.amountDue] }),
      });
    }
    steps.push({
      label: t('Registering'),
      args: () => ({
        address: deployment!.HoodRegistrarController,
        abi: controllerAbi,
        functionName: 'registerWithPayment',
        args: [pending.reg, { ...payment, maxTokenAmount: isToken ? fresh.amountDue : 0n }],
        // ETH: a 1% cushion for price movement, refunded by the contract.
        value: isToken ? 0n : fresh.amountDue + fresh.amountDue / 100n,
      }),
    });
    await tx.run(steps, {
      onSuccess: () => {
        savePending(null, label, address);
        setPending(null);
        setRegistered(true);
      },
    });
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
        ? t('Covered by points')
        : eth(q.amountDue)
    : '…';
  const clock = `${Math.floor(waitLeft / 60)}:${String(waitLeft % 60).padStart(2, '0')}`;

  const steps = [
    [t('Reserve the name'), t('First wallet confirmation. Only the network fee.')],
    [t('Wait about a minute'), t('Keeps your choice private until it is locked in.')],
    [t('Confirm and pay'), t('Second confirmation. The name is yours.')],
  ];
  const waitTotal = Number(minAge ?? 60n) + 3;
  const yearsLabel = (n: number) => (n === 1 ? t('1 year') : t('{n} years', { n }));

  return (
    <div className="page">
      <Link to={`/?q=${encodeURIComponent(label)}`} className="back">← {t('Back to search')}</Link>
      {!registered && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', margin: '16px 0 32px' }}>
          <h1 className="name-head"><Plate label={label} size="lg" /></h1>
          <Status tone="good">{t('Available')}</Status>
        </div>
      )}

      {registered ? (
        <div className="yours">
          <Confetti />
          <Plate label={label} size="xl" className="plate-in" top={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : undefined} />
          <h2>{t('{name} is yours.', { name: fullName(label) })}</h2>
          <p className="lede">
            {primary
              ? t('It already points to your wallet and is your primary name. Add your socials and a profile picture next.')
              : t('It already points to your wallet. Add your socials and a profile picture next.')}
          </p>
          <div className="share-row">
            <button
              type="button"
              className="btn btn-plain"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/name/${encodeURIComponent(label)}`);
                  toast(t('Link copied'));
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              {t('Copy link')}
            </button>
            <a
              className="btn btn-plain"
              target="_blank"
              rel="noreferrer"
              href={`https://x.com/intent/post?text=${encodeURIComponent(t('I just got {name} on {network}.', { name: fullName(label), network: chain.name }))}&url=${encodeURIComponent(`${window.location.origin}/name/${encodeURIComponent(label)}`)}`}
            >
              {t('Share on X')}
            </a>
            <button
              type="button"
              className="btn btn-plain"
              onClick={() => saveNameCard(label, address, currentTheme(), currentPalette()).then(() => toast(t('Picture saved')), () => toast(t('Could not make the picture.'), 'bad'))}
            >
              {t('Save picture')}
            </button>
          </div>
          <div className="next-grid">
            <Link className="next-card" to={`/name/${encodeURIComponent(label)}`}>
              <span className="t">{t('Add a profile picture')}</span>
              <span className="s">{t('It shows wherever your name does.')}</span>
            </Link>
            <Link className="next-card" to={`/name/${encodeURIComponent(label)}`}>
              <span className="t">{t('Add your socials')}</span>
              <span className="s">{t('X, Telegram, a website and a short bio.')}</span>
            </Link>
            <Link className="next-card" to={`/check?name=${encodeURIComponent(label)}`}>
              <span className="t">{t('See it as a sender would')}</span>
              <span className="s">{t('Check where money sent to it goes.')}</span>
            </Link>
          </div>
          <Link className="btn btn-primary btn-lg" to={`/name/${encodeURIComponent(label)}`}>{t('Set up {name}', { name: fullName(label) })}</Link>
        </div>
      ) : (
        <div className="row">
          <div className="main-col">
            <section className="card card-pad stack">
              <h2>{t('How long')}</h2>
              <div className="choice-grid" role="group" aria-label={t('Registration length')}>
                {[1, 2, 3, 5].map((y) => (
                  <button key={y} type="button" className="choice" aria-pressed={Number(duration / YEAR) === y} disabled={!!pending} onClick={() => setYears(y)}>
                    {yearsLabel(y)}
                  </button>
                ))}
              </div>
              <p className="hint">{t('Renew any time before it expires. After expiry there are 90 days to renew before anyone else can take it.')}</p>
            </section>

            <section className="card card-pad stack">
              <h2>{t('Pay with')}</h2>
              <div className="choice-grid" role="group" aria-label={t('Payment')}>
                {coin.enabled && (
                  <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>
                    {coin.symbol}
                    <span className="sub" translate="no">{t('Balance {amount}', { amount: token(coin.balance, coin.decimals, coin.symbol) })}</span>
                  </button>
                )}
                <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>
                  ETH
                  <span className="sub" translate="no">{t('Balance {amount}', { amount: eth(ethBalance.data?.value, 4) })}</span>
                </button>
                {modules.points && (
                  <button type="button" className="choice" aria-pressed={pay === 'points'} onClick={() => setPay('points')}>
                    {t('Points')}
                    <span className="sub" translate="no">{t('{amount} from gift cards, rest in ETH', { amount: usd(points.data ?? 0n) })}</span>
                  </button>
                )}
              </div>
              {coin.isTest && <p className="hint">{t('tUSD is a free test dollar on this network. Claim some on the {link} page.', { link: <Link key="f" to="/faucet">{t('test tokens')}</Link> })}</p>}
            </section>

            <section className="card card-pad stack" style={{ gap: 18 }}>
              <h2>{t('Set up')}</h2>
              <label className="check">
                <input type="checkbox" checked={pending ? pending.reg.reverseRecord === 1 : primary} disabled={!!pending} onChange={() => setPrimary(!primary)} />
                <span>
                  <span style={{ display: 'block', fontWeight: 600 }}>{t('Make it my primary name')}</span>
                  <span className="hint">
                    {currentPrimary.data
                      ? t('Apps show {name} instead of {other}.', { name: fullName(label), other: currentPrimary.data })
                      : t('Apps show {name} instead of your address.', { name: fullName(label) })}
                  </span>
                </span>
              </label>
              {modules.referrals && (
                <div className="field">
                  <label htmlFor="ref">{t('Referred by')} <span className="faint" style={{ fontWeight: 400 }}>{t('(optional)')}</span></label>
                  <div className="input-wrap" style={{ maxWidth: 360 }}>
                    <input id="ref" value={refText} disabled={!!pending} onChange={(e) => setRefText(e.target.value)} autoCapitalize="off" spellCheck={false} translate="no" />
                    <span className="nameface dim" translate="no">.{parentName}</span>
                  </div>
                  {referrerLabel && (
                    <p className="hint">
                      {referrerPayee.isLoading
                        ? t('Checking…')
                        : referrerOk
                          ? t('{name} earns a commission and you get a discount.', { name: fullName(referrerLabel) })
                          : t('{name} can’t be used as a referrer, so no discount applies.', { name: fullName(referrerLabel) })}
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="side-col">
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="card-pad stack" style={{ gap: 14 }}>
                <h2>{t('Summary')}</h2>
                <div className="line" translate="no"><span className="k">{fullName(label)} × {yearsLabel(Number(duration / YEAR))}</span><span>{usd(q?.usdBase)}</span></div>
                {q && q.usdPremium > 0n && <div className="line" translate="no"><span className="k">{t('Release premium')}</span><span>{usd(q.usdPremium)}</span></div>}
                {q && q.pointsUsed > 0n && <div className="line" translate="no"><span className="k">{t('Points')}</span><span>−{usd(q.pointsUsed)}</span></div>}
                {q && q.refereeDiscount > 0n && (
                  <div className="line" translate="no"><span className="k">{t('Referral discount')}</span><span>−{payment.token !== zeroAddress ? token(q.refereeDiscount, coin.decimals, coin.symbol) : eth(q.refereeDiscount)}</span></div>
                )}
                <div className="total" translate="no"><span style={{ fontWeight: 600 }}>{t('You pay')}</span><span className="price">{amount}</span></div>
                {pricedShorter && pricing.data && (
                  <p className="hint">{t('Priced as a {n}-character name, because it reads like one.', { n: pricing.data[0].toString() })}</p>
                )}
                <p className="hint" style={{ textAlign: 'right' }}>{t('Plus the network fee.')}</p>
              </div>
              <div className="card-foot stack">
                <div className="stepper">
                <span className="progress" aria-hidden="true" style={{ transform: `scaleX(${Math.min(step, 2) / 2})` }} />
                <ol className="stepper-list" aria-label={t('Steps')}>
                  {steps.map(([title], i) => (
                    <li key={i} className={'node' + (step > i ? ' done' : step === i ? ' now' : '')} aria-current={step === i ? 'step' : undefined}>
                      <span className="dot">{step > i ? '✓' : i + 1}</span>
                      <span className="t">{title}</span>
                    </li>
                  ))}
                </ol>
                </div>
                {step < 3 && <p className="step-help" key={step}>{steps[Math.min(step, 2)][1]}</p>}
                {!address ? (
                  <ConnectPrompt what={t('register a name')} />
                ) : paused ? (
                  <p className="hint">{t('Registration has not opened yet.')}</p>
                ) : expired ? (
                  <>
                    <p className="error-text">{t('The reservation expired before it was completed.')}</p>
                    <button type="button" className="btn btn-plain" onClick={startOver}>{t('Start again')}</button>
                  </>
                ) : step === 0 ? (
                  <button type="button" className="btn btn-primary btn-lg btn-block" disabled={tx.state.busy || !q} onClick={startCommit}>
                    {t('Reserve {name}', { name: fullName(label) })}
                  </button>
                ) : step === 1 ? (
                  <>
                    <WaitRing left={waitLeft} total={waitTotal} label={t('Waiting… {time}', { time: clock })} />
                    <button type="button" className="btn btn-lg btn-block wait-btn" disabled>
                      <span className="wait-text">{t('Waiting… {time}', { time: clock })}</span>
                    </button>
                    <p className="hint" style={{ textAlign: 'center' }}>{t('Your place is saved. You can leave this page and come back.')}</p>
                  </>
                ) : (
                  <button type="button" className="btn btn-primary btn-lg btn-block ready-btn" disabled={tx.state.busy || !q} onClick={finish}>
                    {t('Confirm and pay')}
                  </button>
                )}
                <TxNotice state={tx.state} />
                {pending && !tx.state.busy && (
                  <button type="button" className="linkish" onClick={startOver}>{t('Change the options and start again')}</button>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
