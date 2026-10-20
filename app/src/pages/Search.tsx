import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { zeroAddress, zeroHash } from 'viem';
import { useReadContract } from 'wagmi';
import { controllerAbi, guardAbi } from '../abi';
import { deployment, GRACE_PERIOD, parentName, YEAR } from '../config';
import { NameText, Status } from '../components/Bits';
import { useT } from '../i18n';
import { ago, date, usd } from '../lib/format';
import { useAlphabets, useControllerInfo, useNameStatus, useRegisteredLabels } from '../lib/hooks';
import { fullName, parseLabel } from '../lib/names';
import { useResolveDemo } from '../components/ResolveDemo';
import { Street } from '../components/Street';
import { GettingStarted } from '../components/GettingStarted';
import { Tour, tourSeen } from '../components/Tour';

const EXAMPLES = ['sage', 'Sage', 'a1ice', 'robinhood', 'nvda', 'привет', 'नमस्ते', '東京タワー'];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function Search() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const query = useDebounced(text, 250);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true });
  }, [query, setParams]);
  // Ready to type, without scrolling the headline away on short screens.
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  const pick = (name: string) => {
    setText(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    input.current?.focus({ preventScroll: true });
  };
  const findName = () => {
    setTour(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // After the tour has closed and let go of focus.
    setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
  };
  const [tour, setTour] = useState(false);
  const [firstVisit] = useState(() => !tourSeen());
  const [tone, setTone] = useState<'good' | 'bad' | 'neutral'>('neutral');

  const demo = useResolveDemo(!text);
  const [pill, setPill] = useState('');
  const registered = useRegisteredLabels();
  const streetNames = useMemo(
    () => [...(registered.data?.values() ?? [])].sort((a, b) => Number(b.block - a.block)),
    [registered.data],
  );
  const typed = !!query.trim();
  const onResult = useCallback((tn: 'good' | 'bad' | 'neutral', p: string) => {
    setTone(tn);
    setPill(p);
  }, []);

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <section className="hero">
        <div className="hero-copy">
          <h1>{t('One name for your wallet on Robinhood Chain.')}</h1>
          <p>
            {t('Send to {example} instead of a long address. Written in your own alphabet, and nobody can register a name that looks like yours.', {
              example: <NameText key="e">{`sage.${parentName}`}</NameText>,
            })}
          </p>
          <button type="button" className={'tour-link' + (firstVisit ? ' fresh' : '')} onClick={() => setTour(true)}>
            <span className="play" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.8v8.4L10 6 3 1.8Z" fill="currentColor" /></svg>
            </span>
            {firstVisit ? t('New here? See how it works in 30 seconds') : t('How it works')}
          </button>
        </div>
        <form
          className="sign"
          role="search"
          data-tone={typed ? tone : undefined}
          onSubmit={(e) => e.preventDefault()}
          onClick={() => input.current?.focus()}
        >
          <span className="sign-top" translate="no">
            {typed ? (
              <span className="sign-status" key={pill}>{pill}</span>
            ) : (
              <span className="mono" key={demo.address} aria-hidden="true">{demo.address}</span>
            )}
            <span className="sign-net" translate="no">Robinhood Chain</span>
          </span>
          <span className="sign-line">
            <label htmlFor="name-search" className="sr-only">{t('Search for a name')}</label>
            <span className="sign-field">
              <span className="sign-mirror" aria-hidden="true">{text || demo.shown}</span>
              <input
                id="name-search"
                ref={input}
                size={1}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                translate="no"
                placeholder={t('Search a name')}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              {!text && (
                <span className={'sign-demo' + (demo.settled ? ' settled' : '')} aria-hidden="true" translate="no">
                  <bdi>{demo.shown}</bdi>
                </span>
              )}
            </span>
            <span className="sign-end" translate="no">.{parentName}</span>
          </span>
        </form>
        <div className="pills">
          <span className="small faint">{t('Try')}</span>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="pill-btn" translate="no" onClick={() => pick(x)}>{x}</button>
          ))}
        </div>
        {typed && <Result input={query} onTone={onResult} />}
      </section>

      <section className="block" aria-label={t('Just registered')}>
        <Street names={streetNames} />
        <div className="block-cap">
          {streetNames.length > 0 && (
            <p>{t('Every neon window is a name registered on Robinhood Chain. Point at one to read it.')}</p>
          )}
          <JustRegistered />
        </div>
      </section>


      <GettingStarted onFindName={findName} compact />
      <Tour open={tour} onClose={() => setTour(false)} onFinish={findName} />

      <section className="promises" aria-label={t('How names stay safe')}>
        <Promise
          specimen={<><s translate="no">a1ice</s><span className="arrow">{t('can’t pass for')}</span><span translate="no">alice</span></>}
          title={t('No lookalikes')}
        >
          {t('Swapped digits, accents and letters from other alphabets are caught on-chain, so a name that looks like yours can’t be registered while you hold it.')}
        </Promise>
        <Promise
          specimen={<><span translate="no">alice.{parentName}</span><span className="arrow">{t('sold, records cleared')}</span></>}
          title={t('Buy a name, get the name')}
        >
          {t('The moment a name changes hands, the new owner controls it and the seller’s address and records stop resolving. No extra step to forget.')}
        </Promise>
        <Promise
          specimen={<><span translate="no">alice.{parentName}</span><span className="arrow">{t('expired, switched off')}</span></>}
          title={t('Expired means off')}
        >
          {t('An expired name stops resolving the second it expires, so money is never sent to an address that may no longer hold it.')}
        </Promise>
      </section>

      <Alphabets onPick={pick} />
    </div>
  );
}

function Promise({ specimen, title, children }: { specimen: ReactNode; title: string; children: string }) {
  return (
    <div className="promise">
      <div className="specimen" aria-hidden="true">{specimen}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

/** The latest registrations: a small window on real use, linked to the stats. */
function JustRegistered() {
  const t = useT();
  const registered = useRegisteredLabels();
  const latest = useMemo(
    () => [...(registered.data?.values() ?? [])].sort((a, b) => Number(b.block - a.block)).slice(0, 6),
    [registered.data],
  );
  if (!latest.length) return null;
  return (
    <div className="tape">
      <span>{t('Just registered')}</span>
      <ol>
        {latest.map((r) => (
          <li key={r.labelhash}>
            <Link to={`/name/${encodeURIComponent(r.label)}`}><NameText>{fullName(r.label)}</NameText></Link>
            {r.timestamp && <span>{ago(r.timestamp)}</span>}
          </li>
        ))}
      </ol>
      <Link to="/stats">{t('See how names are used')}</Link>
    </div>
  );
}

function Alphabets({ onPick }: { onPick: (name: string) => void }) {
  const t = useT();
  const all = useAlphabets();
  const live = all.filter((a) => a.live !== false);
  const later = all.filter((a) => a.live === false);
  return (
    <section className="alphabets">
      <div className="stack" style={{ gap: 10 }}>
        <h2 className="section">{t('Write it your way')}</h2>
        <p className="lede">
          {t('Names can use any of {n} alphabets, one per name. Capitals are folded, so {a} and {b} are the same name.', {
            n: String(live.length),
            a: <NameText key="a">Sage</NameText>,
            b: <NameText key="b">sage</NameText>,
          })}
        </p>
      </div>
      <div className="alpha-wall">
        {live.map((a) => (
          <button key={a.script} type="button" className="alpha" onClick={() => onPick(a.example)}>
            <bdi className="w" translate="no" dir={a.rtl ? 'rtl' : undefined}>{a.example}</bdi>
            <span className="n">{t(a.languages)}</span>
          </button>
        ))}
        {later.map((a) => (
          <div key={a.script} className="alpha soon">
            <bdi className="w" translate="no" dir={a.rtl ? 'rtl' : undefined}>{a.example}</bdi>
            <span className="n">{t('{languages}: coming with the next contract upgrade', { languages: t(a.languages) })}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Result({ input, onTone }: { input: string; onTone: (tone: 'good' | 'bad' | 'neutral', pill: string) => void }) {
  const t = useT();
  const parsed = parseLabel(input);
  const label = parsed.ok ? parsed.label : undefined;
  const status = useNameStatus(label);
  const { paused } = useControllerInfo();
  const registered = useRegisteredLabels();
  const s = status.data;

  const similar = useReadContract({
    address: deployment?.HoodNameGuard,
    abi: guardAbi,
    functionName: 'similarTo',
    args: label ? [label] : undefined,
    query: { enabled: !!label && s?.state === 'Similar' },
  });
  const quote = useReadContract({
    address: deployment?.HoodRegistrarController,
    abi: controllerAbi,
    functionName: 'quoteRegistration',
    args: label ? [label, zeroAddress, YEAR, zeroHash, zeroAddress, { token: zeroAddress, usePoints: false, maxTokenAmount: 0n }] : undefined,
    query: { enabled: !!label && s?.state === 'Available' },
  });

  const shown = parsed.ok ? parsed.label : parsed.typed;
  let tone: 'good' | 'bad' | 'neutral' = 'neutral';
  let pill = t('Checking');
  let body: string = '';
  let note = '';

  if (!parsed.ok) {
    pill = t('Not allowed');
    body = parsed.reason;
  } else if (!deployment) {
    pill = t('Not live yet');
    body = t('The contracts are not deployed on this network yet.');
  } else if (status.isError) {
    pill = t('Unavailable');
    body = t('Could not reach the network. Try again in a moment.');
  } else if (s) {
    const name = fullName(parsed.label);
    switch (s.state) {
      case 'Available':
        tone = 'good';
        pill = t('Available');
        body = t('{name} is free to register.', { name });
        break;
      case 'Active':
        pill = t('Taken');
        body = t('{name} is registered until {date}.', { name, date: date(s.expires) });
        note = t('If it is not renewed, it is released 90 days after it expires.');
        break;
      case 'Grace':
        pill = t('Expired');
        tone = 'bad';
        body = t('{name} expired on {date} and has stopped working. Its owner can still renew it until {until}.', {
          name,
          date: date(s.expires),
          until: date(s.expires + GRACE_PERIOD),
        });
        break;
      case 'Reserved':
        pill = t('Reserved');
        tone = 'bad';
        body = t('{name} is reserved for its rightful holder and is not sold to the public. Reserving a name also reserves everything that looks like it.', { name });
        break;
      case 'Similar': {
        pill = t('Looks taken');
        tone = 'bad';
        const other = similar.data ? registered.data?.get(similar.data)?.label : undefined;
        body = other
          ? t('{label} reads the same as {other}, which is registered. A name that could be mistaken for a live one cannot be registered.', { label: parsed.label, other: fullName(other) })
          : t('{label} reads the same as a name that is registered. A name that could be mistaken for a live one cannot be registered.', { label: parsed.label });
        note = t('It becomes available only if that name lapses and is released.');
        break;
      }
      case 'Invalid':
        pill = t('Not allowed');
        body = t('Names use one alphabet each and cannot read like a wallet address. Right-to-left names (Arabic, Hebrew) are letters only. This one does not fit.');
        break;
    }
    if (parsed.folded && s.state !== 'Invalid')
      note = `${t('Capitals are folded: you typed {typed}, the name is {label}.', { typed: parsed.typed, label: parsed.label })} ${note}`;
  }

  const q = quote.data;
  const canBuy = parsed.ok && s?.state === 'Available';
  const shownTone = !parsed.ok ? 'bad' : s?.state === 'Active' ? 'neutral' : tone;
  useEffect(() => onTone(shownTone, pill), [shownTone, pill, onTone]);

  return (
    <section className="result" aria-live="polite">
      <div className="card">
        <div className="result-head">
          <div className="result-name" translate="no">
            <bdi>{shown}</bdi>
            <span className="dim">.{parentName}</span>
          </div>
          <Status tone={tone}>{pill}</Status>
        </div>
        <div className="result-body">
          {body && <p translate="no">{body}</p>}
          {note && <p className="faint" style={{ fontSize: 15 }} translate="no">{note}</p>}
          {s?.state === 'Active' && label && (
            <Link to={`/name/${encodeURIComponent(label)}`}>{t('View {name}', { name: fullName(label) })}</Link>
          )}
        </div>
        {canBuy && label && (
          <div className="card-foot" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <div style={{ marginRight: 'auto' }}>
              <div className="price" translate="no">{q ? usd(q.usdBase) : '…'}<small> / {t('year')}</small></div>
              <div className="small faint" style={{ marginTop: 2 }}>
                {q && q.usdPremium > 0n
                  ? t('Plus a release premium of {amount} that falls every day.', { amount: usd(q.usdPremium) })
                  : t('Pay in ETH or a dollar stablecoin.')}
              </div>
            </div>
            {paused ? (
              <span className="small faint">{t('Sales open soon')}</span>
            ) : (
              <Link className="btn btn-primary btn-lg" to={`/register/${encodeURIComponent(label)}`}>
                {t('Register {name}', { name: fullName(label) })}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
