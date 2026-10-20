import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { explorerUrl, modules } from '../config';
import { NameText } from '../components/Bits';
import { locale, mark, tn, useT } from '../i18n';
import { date, num, pct } from '../lib/format';
import { fullName } from '../lib/names';
import { alphabetName } from '../lib/scripts';
import { comingBack, holderSpread, isLive, perDay, renewalRate, weekHours, type Stats as StatsData, useStats } from '../lib/stats';

const DAY = 86_400;
const RAMP = ['var(--s100)', 'var(--s200)', 'var(--s300)', 'var(--s400)', 'var(--s500)', 'var(--s600)', 'var(--s700)'];
const RANGES = [
  { days: 7, label: mark('Last 7 days') },
  { days: 30, label: mark('Last 30 days') },
  { days: 90, label: mark('Last 90 days') },
] as const;

/* A tooltip that follows the pointer, or sits over the focused mark. */
interface Tip { x: number; y: number; title: string; body: string }
function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bind = (title: string, body: string) => ({
    onPointerMove: (e: React.PointerEvent) => setTip({ x: e.clientX, y: e.clientY, title, body }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, title, body });
    },
    onBlur: () => setTip(null),
  });
  const node = tip && (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      <strong>{tip.title}</strong>
      {tip.body}
    </div>
  );
  return { bind, node };
}

export function Stats() {
  const t = useT();
  const stats = useStats();
  return (
    <div className="page viz stack" style={{ gap: 28 }}>
      <div className="stats-head">
        <h1 className="title">{t('How names are used')}</h1>
        <p className="lede">
          {t('Worked out live from the contracts’ public records, so every number can be checked on the explorer. Updated every couple of minutes.')}
        </p>
      </div>
      {stats.isLoading ? (
        <p className="muted">{t('Reading the chain…')}</p>
      ) : stats.isError || !stats.data ? (
        <div className="notice warn"><p>{t('Could not read the activity right now. Try again in a moment.')}</p></div>
      ) : (
        <Body s={stats.data} />
      )}
    </div>
  );
}

function Body({ s }: { s: StatsData }) {
  const t = useT();
  const now = s.now;
  const live = s.names.filter((n) => isLive(n, now));
  const thisWeek = s.names.filter((n) => n.registeredAt > now - 7 * DAY).length;
  const renew = renewalRate(s.names, now);
  const back = comingBack(s.names, now);
  const pointShare = live.length ? s.pointing / live.length : 0;

  if (!s.names.length)
    return (
      <div className="panel">
        <p className="headline">{t('No names yet. The first one could be yours.')}</p>
        <Link className="btn btn-primary" style={{ justifySelf: 'start' }} to="/">{t('Search for a name')}</Link>
      </div>
    );

  return (
    <>
      <p className="headline">
        {tn(s.names.length, '{n} name so far, and {p} of the live ones point to a wallet you can send to.', '{n} names so far, and {p} of the live ones point to a wallet you can send to.', {
          n: num(s.names.length),
          p: pct(pointShare),
        })}
      </p>

      <section className="kpis" aria-label={t('At a glance')}>
        <Kpi label={t('Names registered')} value={num(s.names.length)} note={t('{n} in the last 7 days.', { n: num(thisWeek) })} />
        <Kpi
          label={t('Point to a wallet')}
          value={pct(pointShare)}
          meter={pointShare}
          note={tn(live.length, '{n} of {m} live name can receive money. One that points nowhere is only a reservation.', '{n} of {m} live names can receive money. One that points nowhere is only a reservation.', { n: num(s.pointing), m: num(live.length) })}
        />
        <Kpi
          label={t('Kept when due')}
          value={renew.due ? pct(renew.kept / renew.due) : t('Not yet')}
          meter={renew.due ? renew.kept / renew.due : undefined}
          note={
            renew.due
              ? tn(renew.due, '{kept} of {due} name that came up for renewal was renewed.', '{kept} of {due} names that came up for renewal were renewed.', { kept: num(renew.kept), due: num(renew.due) })
              : renew.firstDue
                ? t('Too early to tell. The first names come up for renewal on {date}.', { date: date(renew.firstDue) })
                : t('Too early to tell.')
          }
        />
        <Kpi
          label={t('Coming back soon')}
          value={num(back.length)}
          note={t('Expired, or expiring in the next 60 days. Listed further down.')}
        />
      </section>

      <Activity s={s} />

      <div className="stack" style={{ gap: 12 }}>
        <h2 className="section" style={{ fontSize: 24 }}>{t('More detail')}</h2>
        <p className="muted" style={{ margin: 0 }}>{t('Open any of these for the figures most name services leave out.')}</p>
      </div>
      <Alphabets s={s} />
      <Lengths s={s} />
      <Holders s={s} />
      <Payments s={s} />
      <ComingBack s={s} />
      <Protection s={s} />
    </>
  );
}

function Kpi({ label, value, note, meter }: { label: string; value: string; note: string; meter?: number }) {
  return (
    <div className="kpi">
      <span className="label">{label}</span>
      <span className="value" translate="no">{value}</span>
      {meter !== undefined && (
        <div className="meter" aria-hidden="true">
          <span style={{ width: `${Math.round(Math.min(1, meter) * 100)}%` }} />
        </div>
      )}
      <span className="note">{note}</span>
    </div>
  );
}

/* ---- When people are active ------------------------------------------------ */

function weekdays() {
  // 5 Jan 2026 is a Monday.
  const f = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
  const long = new Intl.DateTimeFormat(locale(), { weekday: 'long' });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2026, 0, 5 + i);
    return { short: f.format(d), long: long.format(d) };
  });
}
const hourLabel = (h: number) => new Intl.DateTimeFormat(locale(), { hour: 'numeric' }).format(new Date(2026, 0, 5, h));

function Activity({ s }: { s: StatsData }) {
  const t = useT();
  const [days, setDays] = useState<number>(30);
  const [table, setTable] = useState(false);
  const tip = useTip();
  const since = s.now - days * DAY;
  const grid = useMemo(() => weekHours(s.actions, since), [s.actions, since]);
  const daily = useMemo(() => perDay(s.actions, s.now, days), [s.actions, s.now, days]);
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...grid.flat());
  const names = weekdays();

  let peak = { d: 0, h: 0, v: 0 };
  grid.forEach((row, d) => row.forEach((v, h) => v > peak.v && (peak = { d, h, v })));
  const dayTotals = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const busiestDay = dayTotals.indexOf(Math.max(...dayTotals));
  const level = (v: number) => (v === 0 ? 'var(--empty)' : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * (RAMP.length - 1e-9)))]);
  const enough = total >= 8;

  const dailyMax = Math.max(1, ...daily.map((d) => d.count));
  const ticks = niceTicks(dailyMax);
  const dayFmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' });

  return (
    <section className="panel" aria-labelledby="activity-h">
      <div className="stack" style={{ gap: 8 }}>
        <h2 id="activity-h">{t('When people use Hood Names')}</h2>
        <p className="takeaway">
          {!total
            ? t('Nothing happened in this period.')
            : enough
              ? t('Busiest on {day}s, and around {hour} your time. {n} actions in this period.', {
                  day: names[busiestDay].long,
                  hour: hourLabel(peak.h),
                  n: num(total),
                })
              : tn(total, 'Only {n} action in this period, too few for a pattern yet.', 'Only {n} actions in this period, too few for a pattern yet.', { n: num(total) })}
        </p>
      </div>
      <div className="panel-tools">
        <div className="seg" role="group" aria-label={t('Period')}>
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)}>{t(r.label)}</button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? t('Show as a chart') : t('Show as a table')}
        </button>
      </div>

      {table ? (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">{t('Actions by weekday and hour, your time')}</caption>
            <thead>
              <tr><th scope="col">{t('Day')}</th>{[0, 6, 12, 18].map((h) => <th key={h} scope="col">{hourLabel(h)}–{hourLabel((h + 6) % 24)}</th>)}<th scope="col">{t('Total')}</th></tr>
            </thead>
            <tbody>
              {grid.map((row, d) => (
                <tr key={d}>
                  <th scope="row">{names[d].long}</th>
                  {[0, 6, 12, 18].map((h) => <td key={h}>{row.slice(h, h + 6).reduce((a, b) => a + b, 0)}</td>)}
                  <td>{dayTotals[d]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="heat" role="grid" aria-label={t('Actions by weekday and hour, your time')}>
            {grid.map((row, d) => (
              <div key={d} role="row" style={{ display: 'contents' }}>
                <span className="dl" role="rowheader">{names[d].short}</span>
                {row.map((v, h) => (
                  <button
                    key={h}
                    type="button"
                    role="gridcell"
                    className={'cell' + (enough && d === peak.d && h === peak.h ? ' peak' : '')}
                    style={{ background: level(v) }}
                    aria-label={`${names[d].long} ${hourLabel(h)}: ${v}`}
                    {...tip.bind(`${num(v)}`, `${names[d].long}, ${hourLabel(h)}–${hourLabel((h + 1) % 24)}`)}
                  />
                ))}
              </div>
            ))}
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="hl" style={{ gridColumn: h + 2 }} aria-hidden="true">{h % 3 === 0 ? hourLabel(h) : ''}</span>
            ))}
          </div>
          <div className="scale" aria-hidden="true">
            {t('Fewer')} {RAMP.map((c) => <i key={c} style={{ background: c }} />)} {t('More')}
            {enough && <span style={{ marginLeft: 12 }}>{t('The outlined square is the busiest hour.')}</span>}
          </div>

          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>{t('Actions per day')}</h3>
            <div className="chart-y">
              <div className="columns">
                {ticks.map((v) => (
                  <div key={v} className="gridline" style={{ bottom: `${(v / ticks[ticks.length - 1]) * (100 - 10)}%` }}>
                    <span>{num(v)}</span>
                  </div>
                ))}
                {daily.map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    className={'col' + (d.count ? '' : ' zero')}
                    aria-label={`${dayFmt.format(new Date(d.day * 1000))}: ${d.count}`}
                    {...tip.bind(num(d.count), dayFmt.format(new Date(d.day * 1000)))}
                  >
                    <span style={{ height: `${(d.count / ticks[ticks.length - 1]) * 90}%` }} />
                  </button>
                ))}
              </div>
              <div className="col-axis" aria-hidden="true">
                <span>{dayFmt.format(new Date(daily[0].day * 1000))}</span>
                <span>{t('Today')}</span>
              </div>
            </div>
            <p className="hint">{t('An action is a registration, renewal, record change, primary name, gift card or sale.')}</p>
          </div>
        </>
      )}
      {tip.node}
    </section>
  );
}

/** Clean axis steps from zero up to at least `max`. */
function niceTicks(max: number) {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : Math.pow(10, Math.floor(Math.log10(max))) * (max / Math.pow(10, Math.floor(Math.log10(max))) > 5 ? 2 : 1);
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = step; v <= top; v += step) out.push(v);
  return out;
}

/* ---- The details --------------------------------------------------------- */

function More({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <details className="more">
      <summary>
        <span className="t">{title}</span>
        <span className="s">{summary}</span>
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}

function Bars({ rows }: { rows: { label: ReactNode; value: number; key: string }[] }) {
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className="hbar">
          <span>{r.label}</span>
          <span className="track"><span style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="v">{num(r.value)} · {pct(r.value / total)}</span>
        </div>
      ))}
    </div>
  );
}

function Alphabets({ s }: { s: StatsData }) {
  const t = useT();
  const counts = new Map<string, number>();
  for (const n of s.names) counts.set(n.script, (counts.get(n.script) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const other = rows.filter(([k]) => k !== 'Latin').reduce((a, [, v]) => a + v, 0);
  return (
    <More
      title={t('Which alphabets names use')}
      summary={t('{p} are written in something other than Latin letters.', { p: pct(s.names.length ? other / s.names.length : 0) })}
    >
      <Bars rows={rows.map(([k, v]) => ({ key: k, label: t(alphabetName(k as never)), value: v }))} />
    </More>
  );
}

function Lengths({ s }: { s: StatsData }) {
  const t = useT();
  const buckets = [
    { key: '3', label: t('3 characters'), test: (n: number) => n === 3 },
    { key: '4', label: t('4 characters'), test: (n: number) => n === 4 },
    { key: '5', label: t('5 to 9 characters'), test: (n: number) => n >= 5 && n <= 9 },
    { key: '10', label: t('10 or more'), test: (n: number) => n >= 10 },
  ];
  const lengths = s.names.map((n) => n.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
  return (
    <More title={t('How long names are')} summary={t('Half are {n} characters or shorter. Shorter names cost more each year.', { n: num(median) })}>
      <Bars rows={buckets.map((b) => ({ key: b.key, label: b.label, value: s.names.filter((n) => b.test(n.length)).length }))} />
    </More>
  );
}

function Holders({ s }: { s: StatsData }) {
  const t = useT();
  const h = holderSpread(s.names, s.now);
  return (
    <More
      title={t('Who holds the names')}
      summary={
        h.wallets === 1
          ? t('Every live name is held by a single wallet.')
          : t('{w} wallets hold the {n} live names. The 10 biggest hold {p} of them.', { w: num(h.wallets), n: num(h.total), p: pct(h.topTenShare) })
      }
    >
      <p className="muted" style={{ margin: 0 }}>{t('Are names spread across many people, or bunched up in a few wallets? Wallets by how many names they hold:')}</p>
      <Bars
        rows={[
          { key: '1', label: t('One name'), value: h.one },
          { key: '2', label: t('2 to 5 names'), value: h.few },
          { key: '6', label: t('6 or more'), value: h.many },
        ]}
      />
      <p className="hint">{tn(h.largest, 'The biggest single holder has {n} name.', 'The biggest single holder has {n} names.', { n: num(h.largest) })}</p>
    </More>
  );
}

function Payments({ s }: { s: StatsData }) {
  const t = useT();
  const p = s.payments;
  const parts = [
    { key: 'eth', label: t('ETH'), value: p.eth, color: 'var(--series-1)' },
    { key: 'usd', label: t('Dollar stablecoin'), value: p.dollars, color: 'var(--series-2)' },
    ...(modules.points ? [{ key: 'pts', label: t('Gift-card points'), value: p.points, color: 'var(--series-3)' }] : []),
  ];
  const total = p.total || 1;
  return (
    <More
      title={t('How people pay')}
      summary={p.total ? t('{p} of payments came through someone’s referral.', { p: pct(p.referred / total) }) : t('No payments yet.')}
    >
      <div className="stackbar" role="img" aria-label={parts.map((x) => `${x.label} ${pct(x.value / total)}`).join(', ')}>
        {parts.filter((x) => x.value).map((x) => <span key={x.key} style={{ width: `${(x.value / total) * 100}%`, background: x.color }} />)}
      </div>
      <ul className="legend">
        {parts.map((x) => (
          <li key={x.key}><i style={{ background: x.color }} />{x.label} <strong>{pct(x.value / total)}</strong> <span className="faint">({num(x.value)})</span></li>
        ))}
      </ul>
      <p className="hint">{t('Counts registrations and renewals. Gift-card points are dollars someone paid earlier for a card.')}</p>
    </More>
  );
}

function ComingBack({ s }: { s: StatsData }) {
  const t = useT();
  const rows = comingBack(s.names, s.now);
  return (
    <More title={t('Names coming back')} summary={rows.length ? tn(rows.length, '{n} name may be free to register soon.', '{n} names may be free to register soon.', { n: num(rows.length) }) : t('None in the next 60 days.')}>
      <p className="muted" style={{ margin: 0 }}>
        {t('A name that is not renewed stops working when it expires, and anyone can register it 90 days later. Most sites never tell you when that is.')}
      </p>
      {rows.length ? (
        <ul className="rows">
          {rows.slice(0, 30).map((r) => (
            <li key={r.label}>
              <Link className="name-link grow" to={`/name/${encodeURIComponent(r.label)}`}><NameText>{fullName(r.label)}</NameText></Link>
              <span className="faint small">{r.expired ? t('Expired {date}', { date: date(r.expires) }) : t('Expires {date}', { date: date(r.expires) })}</span>
              <span className="small" style={{ fontWeight: 600 }}>{t('Free from {date} if not renewed', { date: date(r.freeFrom) })}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </More>
  );
}

function Protection({ s }: { s: StatsData }) {
  const t = useT();
  const unredeemed = Math.max(0, s.giftCards.boughtUsd - s.giftCards.redeemedUsd);
  const usd = (v: number) => v.toLocaleString(locale(), { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  return (
    <More title={t('Safety, sales and gift cards')} summary={t('{n} names are held back so nobody can pose as a brand or as support.', { n: num(s.reserved) })}>
      <dl className="facts">
        <div><dt>{t('Reserved names')}</dt><dd>{t('{n}, each with everything that looks like it', { n: num(s.reserved) })}</dd></div>
        <div><dt>{t('Wallets showing a name instead of an address')}</dt><dd>{num(s.primaryWallets)}</dd></div>
        <div><dt>{t('Names with a profile picture')}</dt><dd>{num(s.withPicture)}</dd></div>
        <div><dt>{t('Names that changed hands')}</dt><dd>{num(s.transfers)}</dd></div>
        {modules.giftCards && (
          <>
            <div><dt>{t('Gift cards bought')}</dt><dd>{usd(s.giftCards.boughtUsd)}</dd></div>
            <div><dt>{t('Gift cards not yet redeemed')}</dt><dd>{usd(unredeemed)}</dd></div>
          </>
        )}
      </dl>
      {explorerUrl && <p className="hint">{t('Every figure here comes from public contract events you can look up on the explorer.')}</p>}
    </More>
  );
}
