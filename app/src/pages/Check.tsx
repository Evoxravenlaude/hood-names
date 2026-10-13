import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReadContract } from 'wagmi';
import { guardAbi } from '../abi';
import { deployment, GRACE_PERIOD, parentName } from '../config';
import { ago, date, shortAddress } from '../lib/format';
import { useNameStatus, useRegisteredLabels } from '../lib/hooks';
import { fullName, parseLabel } from '../lib/names';
import { Avatar } from '../components/Avatar';

const RECENT = 30 * 86400;

export function Check() {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('name') ?? '');
  const [query, setQuery] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(text);
      setParams(text ? { name: text } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
  }, [text, setParams]);

  return (
    <div className="page narrow stack" style={{ gap: 24, paddingTop: 56 }}>
      <div className="stack" style={{ gap: 12 }}>
        <h1 className="title">Check a name before you send</h1>
        <p className="muted" style={{ margin: 0, fontSize: 18, lineHeight: 1.5, maxWidth: 640 }}>
          See who a name points to right now, and whether anything about it should make you pause.
        </p>
      </div>
      <div className="field">
        <label htmlFor="chk">Name</label>
        <div className="searchbox" style={{ marginTop: 0, maxWidth: 'none', padding: '4px 18px' }}>
          <input id="chk" value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="off" spellCheck={false} placeholder="name" style={{ fontSize: 22 }} />
          <span className="suffix" style={{ fontSize: 22 }}>.{parentName}</span>
        </div>
      </div>
      {query.trim() && <Verdict input={query} />}
    </div>
  );
}

function Verdict({ input }: { input: string }) {
  const parsed = parseLabel(input);
  const label = parsed.ok ? parsed.label : undefined;
  const status = useNameStatus(label);
  const registered = useRegisteredLabels();
  const s = status.data;
  const similar = useReadContract({
    address: deployment?.HoodNameGuard,
    abi: guardAbi,
    functionName: 'similarTo',
    args: label ? [label] : undefined,
    query: { enabled: !!label && !!s && s.state !== 'Active' },
  });

  let band = 'info';
  let headline = 'Checking…';
  let detail = '';
  const facts: { k: string; v: string; mono?: boolean; flag?: boolean }[] = [];

  if (!parsed.ok) {
    band = 'dark';
    headline = 'Not a valid name';
    detail = parsed.reason;
  } else if (s) {
    const name = fullName(parsed.label);
    const lookalike = similar.data && similar.data !== '0x' + '0'.repeat(64) ? registered.data?.get(similar.data)?.label : undefined;
    if (s.state === 'Active') {
      const recent = !s.wrapped && s.heldSince > 0n && Date.now() / 1000 - Number(s.heldSince) < RECENT;
      const sendsTo = s.resolvedAddress !== '0x0000000000000000000000000000000000000000' ? s.resolvedAddress : undefined;
      if (!s.resolverAllowed || (!sendsTo && !s.customResolver)) {
        band = 'dark';
        headline = 'Do not send: this name points nowhere';
        detail = `${name} is registered, but it does not resolve to a wallet right now.`;
      } else if (s.customResolver) {
        band = 'warn';
        headline = 'Uses a custom resolver';
        detail = 'Its owner approved a resolver of their own. Your wallet resolves the address through it; confirm the address with the person before sending.';
      } else if (recent) {
        band = 'warn';
        headline = `Changed hands ${ago(s.heldSince)} ago`;
        detail = 'If you are paying someone you have paid before, confirm the address with them first. It may no longer be theirs.';
      } else {
        band = 'info';
        headline = 'Looks fine to send';
        detail = s.wrapped
          ? 'It resolves to the address below. Wrapped names do not record when they last changed hands.'
          : `Held by the same owner for ${ago(s.heldSince)}, and points to the address below.`;
      }
      if (sendsTo) facts.push({ k: 'Sends to', v: sendsTo, mono: true });
      facts.push({ k: 'Owner', v: shortAddress(s.holder), mono: true });
      if (!s.wrapped) facts.push({ k: 'Held since', v: `${date(s.heldSince)} (${ago(s.heldSince)} ago)`, flag: recent });
      facts.push({ k: 'Expires', v: date(s.expires) });
      facts.push({ k: 'Resolver', v: s.customResolver ? 'Custom (approved by owner)' : 'Standard (trusted)' });
    } else if (s.state === 'Grace') {
      band = 'dark';
      headline = 'Do not send: this name has expired';
      detail = 'An expired name does not resolve. Someone else may be able to register it soon.';
      facts.push({ k: 'Expired', v: date(s.expires), flag: true });
      facts.push({ k: 'Can be taken from', v: date(s.expires + GRACE_PERIOD) });
    } else {
      band = 'dark';
      headline = `${name} is not a registered name`;
      detail = lookalike
        ? `It looks like ${fullName(lookalike)}, which is registered. Check you have the right one.`
        : 'There is nothing to send to.';
    }
  } else if (status.isError) {
    headline = 'Could not reach the network';
  }

  return (
    <section className="card" style={{ overflow: 'hidden' }} aria-live="polite">
      <div
        style={{
          padding: '22px 28px',
          background: band === 'warn' ? 'var(--warn-soft)' : band === 'dark' ? 'var(--ink)' : 'var(--accent-soft)',
          color: band === 'warn' ? 'var(--warn-ink)' : band === 'dark' ? '#fff' : '#14248a',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600 }}>{headline}</div>
        {detail && <div style={{ fontSize: 16, lineHeight: 1.5, marginTop: 4 }}>{detail}</div>}
      </div>
      {facts.length > 0 && label && s?.state === 'Active' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 28px 0' }}>
          <Avatar label={label} size={48} remote={false} />
          <span className="mono" style={{ fontSize: 20, fontWeight: 500 }}>{fullName(label)}</span>
        </div>
      )}
      {facts.length > 0 && (
        <dl className="facts" style={{ padding: '8px 28px 20px' }}>
          {facts.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd className={(f.mono ? 'mono ' : '') + (f.flag ? 'flag' : '')}>{f.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
