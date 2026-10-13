import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { zeroAddress, zeroHash } from 'viem';
import { useReadContract } from 'wagmi';
import { controllerAbi, guardAbi } from '../abi';
import { deployment, GRACE_PERIOD, parentName, YEAR } from '../config';
import { Status, SearchIcon } from '../components/Bits';
import { date, usd } from '../lib/format';
import { useControllerInfo, useNameStatus, useRegisteredLabels } from '../lib/hooks';
import { fullName, parseLabel } from '../lib/names';

const EXAMPLES = ['sage', 'Sage', 'a1ice', 'robinhood', 'nvda', 'привет', '東京タワー', 'corn'];

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const query = useDebounced(text, 250);
  useEffect(() => {
    setParams(query ? { q: query } : {}, { replace: true });
  }, [query, setParams]);

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <section className="hero">
        <h1>One name for your wallet on Robinhood Chain.</h1>
        <p>
          Send to <span className="mono" style={{ color: 'var(--ink)' }}>sage.{parentName}</span> instead of a long address. Written in your own
          alphabet, and nobody can register a name that looks like yours.
        </p>
        <form className="searchbox" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="name-search" className="sr-only">Search for a name</label>
          <SearchIcon />
          <input
            id="name-search"
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Search a name"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="suffix">.{parentName}</span>
        </form>
        <div className="pills">
          <span className="small faint">Try</span>
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="pill-btn" onClick={() => setText(x)}>{x}</button>
          ))}
        </div>
      </section>

      {query.trim() && <Result input={query} />}

      <section className="grid-3" style={{ marginBottom: 64 }}>
        <Promise eyebrow="No lookalikes" title="a1ice can't pose as alice">
          Swapped digits, accents and letters from other alphabets are caught on-chain, so a name that looks like yours can't be registered while you hold it.
        </Promise>
        <Promise eyebrow="Sold names start clean" title="Buy a name, get the name">
          The moment a name changes hands, the new owner controls it and the seller's address and records stop resolving. No extra step to forget.
        </Promise>
        <Promise eyebrow="Expired means off" title="No payments to a lapsed name">
          An expired name stops resolving the second it expires, so money is never sent to an address that may no longer hold it.
        </Promise>
      </section>

      <section className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 48 }}>
        <div style={{ flex: '1 1 320px' }} className="stack">
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Write it your way</h2>
          <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.55, maxWidth: 420 }}>
            Names can use any of six writing systems, one per name. Capitals are folded, so <span className="mono">Sage</span> and{' '}
            <span className="mono">sage</span> are the same name.
          </p>
        </div>
        <div style={{ flex: '2 1 560px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {[
            ['café', 'Latin'],
            ['привет', 'Cyrillic'],
            ['ελλάδα', 'Greek'],
            ['東京都', 'Chinese'],
            ['東京タワー', 'Japanese'],
            ['서울특별시', 'Korean'],
          ].map(([n, s]) => (
            <button key={n} type="button" className="card" style={{ padding: '16px 18px', textAlign: 'left', cursor: 'pointer' }} onClick={() => { setText(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 500 }}>{n}</div>
              <div className="small faint" style={{ marginTop: 4 }}>{s}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Promise({ eyebrow, title, children }: { eyebrow: string; title: string; children: string }) {
  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <div className="eyebrow">{eyebrow}</div>
      <h2 style={{ fontSize: 22 }}>{title}</h2>
      <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}

function Result({ input }: { input: string }) {
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
  let pill = 'Checking';
  let body: string = '';
  let note = '';

  if (!parsed.ok) {
    pill = 'Not allowed';
    body = parsed.reason;
  } else if (!deployment) {
    pill = 'Not live yet';
    body = 'The contracts are not deployed on this network yet.';
  } else if (status.isError) {
    pill = 'Unavailable';
    body = 'Could not reach the network. Try again in a moment.';
  } else if (s) {
    const name = fullName(parsed.label);
    switch (s.state) {
      case 'Available':
        tone = 'good';
        pill = 'Available';
        body = `${name} is free to register.`;
        break;
      case 'Active':
        pill = 'Taken';
        body = `${name} is registered until ${date(s.expires)}.`;
        note = 'If it is not renewed, it is released 90 days after it expires.';
        break;
      case 'Grace':
        pill = 'Expired';
        tone = 'bad';
        body = `${name} expired on ${date(s.expires)} and has stopped working. Its owner can still renew it until ${date(s.expires + GRACE_PERIOD)}.`;
        break;
      case 'Reserved':
        pill = 'Reserved';
        tone = 'bad';
        body = `${name} is reserved for its rightful holder and is not sold to the public. Reserving a name also reserves everything that looks like it.`;
        break;
      case 'Similar': {
        pill = 'Looks taken';
        tone = 'bad';
        const other = similar.data ? registered.data?.get(similar.data)?.label : undefined;
        body = other
          ? `${parsed.label} reads the same as ${fullName(other)}, which is registered. A name that could be mistaken for a live one cannot be registered.`
          : `${parsed.label} reads the same as a name that is registered. A name that could be mistaken for a live one cannot be registered.`;
        note = 'It becomes available only if that name lapses and is released.';
        break;
      }
      case 'Invalid':
        pill = 'Not allowed';
        body = 'Names here use one alphabet each (Latin, Cyrillic, Greek, Chinese, Japanese or Korean) and cannot read like a wallet address. This one does not fit.';
        break;
    }
    if (parsed.folded && s.state !== 'Invalid') note = `Capitals are folded: you typed ${parsed.typed}, the name is ${parsed.label}. ${note}`;
  }

  const q = quote.data;
  const canBuy = parsed.ok && s?.state === 'Available';

  return (
    <section className="result" aria-live="polite">
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="result-head">
          <div className="result-name">{shown}<span className="dim">.{parentName}</span></div>
          <Status tone={tone}>{pill}</Status>
        </div>
        <div className="result-body">
          {body && <p>{body}</p>}
          {note && <p className="faint" style={{ fontSize: 15 }}>{note}</p>}
          {s?.state === 'Active' && label && <Link to={`/name/${encodeURIComponent(label)}`}>View {fullName(label)}</Link>}
        </div>
        {canBuy && label && (
          <div className="card-foot" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <div style={{ marginRight: 'auto' }}>
              <div className="price">{q ? usd(q.usdBase) : '…'}<small> / year</small></div>
              <div className="small faint" style={{ marginTop: 2 }}>
                {q && q.usdPremium > 0n
                  ? `Plus a release premium of ${usd(q.usdPremium)} that falls every day.`
                  : 'Pay in ETH or a dollar stablecoin.'}
              </div>
            </div>
            {paused ? (
              <span className="small faint">Sales open soon</span>
            ) : (
              <Link className="btn btn-primary btn-lg" to={`/register/${encodeURIComponent(label)}`}>Register {fullName(label)}</Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
