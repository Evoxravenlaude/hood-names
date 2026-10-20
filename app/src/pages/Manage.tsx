import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { concat, encodeEventTopics, encodeFunctionData, erc20Abi, hexToString, keccak256, type Address, type Hex, zeroAddress } from 'viem';
import { useAccount, useConfig, usePublicClient, useReadContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { useQuery } from '@tanstack/react-query';
import { baseRegistrarAbi, controllerAbi, nameWrapperAbi, policyAbi, registryAbi, resolverAbi, reverseRegistrarAbi } from '../abi';
import { deployment, GRACE_PERIOD, modules, parentName, YEAR } from '../config';
import { Status, TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { date, eth, heldFor, isAddress, shortAddress, toAddress, token } from '../lib/format';
import { useNameStatus, usePrimaryName, useRecipient, useStablecoin, type NameStatus } from '../lib/hooks';
import { Plate } from '../components/Plate';
import { Avatar } from '../components/Avatar';
import { RecipientField } from './GiftCards';
import { avatarSrc, toAvatarDataUrl } from '../lib/image';
import { decode, fetchLogs } from '../lib/logs';
import { fullName, labelhash, nodeOf, parseLabel, subnodeOf } from '../lib/names';
import { useTx } from '../lib/tx';
import { mark, useT } from '../i18n';
import { NameText } from '../components/Bits';

type Tab = 'records' | 'subnames' | 'ownership';

export function Manage() {
  const t = useT();
  const params = useParams();
  const parsed = parseLabel(decodeURIComponent(params.label ?? ''));
  const label = parsed.ok ? parsed.label : undefined;
  const status = useNameStatus(label);
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('tab') as Tab) || 'records';
  const { address } = useAccount();
  const primary = usePrimaryName(address);

  // Teaches the page this name, so transactions about it read as its name.
  if (label) nodeOf(label);
  if (!label) return <div className="page narrow"><Link to="/" className="back">← {t('Search')}</Link><p className="error-text">{!parsed.ok && parsed.reason}</p></div>;
  const s = status.data;
  const name = fullName(label);

  if (!s) return <div className="page narrow"><p className="muted">{status.isError ? t('Could not reach the network.') : t('Loading…')}</p></div>;
  if (s.state !== 'Active' && s.state !== 'Grace')
    return (
      <div className="page narrow stack">
        <Link to="/names" className="back">← {t('My names')}</Link>
        <h1 className="name-head"><Plate label={label} size="lg" /></h1>
        <p className="muted">{t('{name} is not registered.', { name })}</p>
        <Link to={`/?q=${encodeURIComponent(label)}`}>{t('Check if it is available')}</Link>
      </div>
    );

  const isHolder = !!address && s.holder.toLowerCase() === address.toLowerCase();
  const isManager = !!address && s.manager.toLowerCase() === address.toLowerCase();
  const setTab = (next: Tab) => setSearch(next === 'records' ? {} : { tab: next }, { replace: true });
  const grace = s.state === 'Grace';

  return (
    <div className="page">
      <Link to="/names" className="back">← {t('My names')}</Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 24px', margin: '16px 0 28px' }}>
        <Avatar label={label} size={72} remote={isHolder} />
        <div style={{ marginRight: 'auto', minWidth: 0 }}>
          <h1 className="name-head"><Plate label={label} size="lg" top={grace ? undefined : shortAddress(s.holder)} tone={grace ? 'bad' : undefined} /></h1>
          <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 15, marginTop: 6 }}>
            <span translate="no">{grace ? t('Expired {date}', { date: date(s.expires) }) : t('Expires {date}', { date: date(s.expires) })}</span>
            {primary.data === name && <span>{t('Your primary name')}</span>}
            {s.wrapped && <span>{t('Wrapped')}</span>}
          </div>
        </div>
        {grace ? <Status tone="bad">{t('Expired')}</Status> : isHolder ? <Status tone="good">{t('Yours')}</Status> : <Status tone="neutral">{t('Registered')}</Status>}
      </div>

      {grace && (
        <div className="notice warn" style={{ marginBottom: 24 }}>
          <p>{t('This name has stopped working. Renew it by {date}, or anyone can register it after that.', { date: date(s.expires + GRACE_PERIOD) })}</p>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label={t('Manage')}>
        {(grace ? (['ownership'] as Tab[]) : (['records', 'subnames', 'ownership'] as Tab[])).map((k) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={(grace ? 'ownership' : tab) === k} onClick={() => setTab(k)}>
            {k === 'records' ? t('Records') : k === 'subnames' ? t('Subnames') : grace ? t('Renew') : t('Ownership')}
          </button>
        ))}
      </div>

      {!grace && tab === 'records' && <Records label={label} s={s} canEdit={isManager} />}
      {!grace && tab === 'subnames' && <Subnames label={label} s={s} canEdit={isManager} />}
      {(grace || tab === 'ownership') && <Ownership label={label} s={s} isHolder={isHolder} />}
    </div>
  );
}

const TEXT_KEYS: [string, string, string][] = [
  ['com.twitter', 'X', '@handle'],
  ['org.telegram', 'Telegram', '@handle'],
  ['url', mark('Website'), 'https://'],
  ['avatar', mark('Profile picture'), mark('Image link')],
  ['description', mark('Bio'), mark('A line about you')],
];

function Records({ label, s, canEdit }: { label: string; s: NameStatus; canEdit: boolean }) {
  const t = useT();
  const { address } = useAccount();
  const client = usePublicClient();
  const primary = usePrimaryName(address);
  const tx = useTx();
  const name = fullName(label);
  const usable = s.resolver !== zeroAddress && s.resolverAllowed;

  const current = useQuery({
    queryKey: ['records', s.node, s.resolver, s.holder],
    enabled: usable && !!client,
    queryFn: async () => {
      const addr = (await client!.readContract({ address: s.resolver, abi: resolverAbi, functionName: 'addr', args: [s.node] })) as Address;
      const texts = await Promise.all(
        TEXT_KEYS.map(([k]) => client!.readContract({ address: s.resolver, abi: resolverAbi, functionName: 'text', args: [s.node, k] })),
      );
      return { addr, texts };
    },
  });

  const [addr, setAddr] = useState('');
  const [texts, setTexts] = useState<string[]>(TEXT_KEYS.map(() => ''));
  // The form shows what is on-chain until the owner starts editing; a
  // refresh never overwrites unsaved changes.
  const [edited, setEdited] = useState(false);
  useEffect(() => {
    if (!current.data || edited) return;
    setAddr(current.data.addr === zeroAddress ? '' : current.data.addr);
    setTexts(current.data.texts);
  }, [current.data, edited]);
  const locked = !canEdit || !current.data;

  const changes = useMemo(() => {
    if (!current.data) return [] as Hex[];
    const out: Hex[] = [];
    const before = current.data.addr === zeroAddress ? '' : current.data.addr;
    const typed = addr.trim() === '' ? zeroAddress : toAddress(addr);
    if (typed && typed.toLowerCase() !== (before || zeroAddress).toLowerCase())
      out.push(encodeFunctionData({ abi: resolverAbi, functionName: 'setAddr', args: [s.node, typed] }));
    TEXT_KEYS.forEach(([k], i) => {
      if (texts[i] !== current.data!.texts[i])
        out.push(encodeFunctionData({ abi: resolverAbi, functionName: 'setText', args: [s.node, k, texts[i]] }));
    });
    return out;
  }, [addr, texts, current.data, s.node]);

  const addrInvalid = addr.trim() !== '' && !isAddress(addr);

  if (!usable)
    return (
      <div className="card card-pad stack">
        <h2>{t('This name has no working resolver')}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {s.resolver === zeroAddress
            ? t('It is not set up to point anywhere yet.')
            : t('It uses a resolver that has not been approved for it, so it does not resolve.')}
        </p>
        {canEdit && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={tx.state.busy}
              onClick={() =>
                tx.run([
                  {
                    label: t('Switching to the standard resolver'),
                    args: () =>
                      s.wrapped
                        ? { address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'setResolver', args: [s.node, deployment!.PublicResolver] }
                        : { address: deployment!.ENSRegistry, abi: registryAbi, functionName: 'setResolver', args: [s.node, deployment!.PublicResolver] },
                  },
                ])
              }
            >
              {t('Use the standard resolver')}
            </button>
            <TxNotice state={tx.state} success={t('Done.')} />
          </>
        )}
      </div>
    );

  return (
    <div className="row">
      <section className="main-col card card-pad" style={{ gap: 20 }}>
        <h2>{t('What {name} points to', { name })}</h2>
        <div className="field">
          <label htmlFor="r-addr">{t('Wallet address')}</label>
          <input id="r-addr" className="input mono" value={addr} disabled={locked} placeholder="0x…" translate="no" onChange={(e) => { setEdited(true); setAddr(e.target.value); }} />
          {addrInvalid && <p className="error-text">{t('That is not a wallet address.')}</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {TEXT_KEYS.map(([k, title, ph], i) => k === 'avatar' ? (
            <AvatarField
              key={k}
              label={label}
              value={texts[i]}
              saved={current.data?.texts[i] ?? ''}
              disabled={locked}
              onChange={(v) => {
                setEdited(true);
                setTexts((prev) => prev.map((x, j) => (j === i ? v : x)));
              }}
            />
          ) : (
            <div className="field" key={k}>
              <label htmlFor={`r-${k}`}>{t(title)}</label>
              <input
                id={`r-${k}`}
                className="input"
                value={texts[i]}
                placeholder={t(ph)}
                translate="no"
                disabled={locked}
                onChange={(e) => {
                  setEdited(true);
                  const v = e.target.value;
                  setTexts((prev) => prev.map((x, j) => (j === i ? v : x)));
                }}
              />
            </div>
          ))}
        </div>
        {canEdit ? (
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!changes.length || addrInvalid || tx.state.busy}
                onClick={async () => {
                  const ok = await tx.run([
                    {
                      label: t('Saving records'),
                      args: () => ({ address: s.resolver, abi: resolverAbi, functionName: 'multicall', args: [changes] }),
                    },
                  ]);
                  if (ok) setEdited(false);
                }}
              >
                {t('Save changes')}
              </button>
              <span className="hint">{t('One wallet confirmation for all changes.')}</span>
            </div>
            <TxNotice state={tx.state} success={t('Saved.')} />
          </div>
        ) : (
          <p className="hint">{t('Only the owner can change these.')}</p>
        )}
      </section>
      <aside className="side-col">
        <PrimaryCard name={name} s={s} isPrimary={primary.data === name} />
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 18 }}>{t('If you sell or give it away')}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
            {t('These records are yours, not the name’s. The next owner starts with a blank name, and none of this keeps pointing at you.')}
          </p>
        </div>
      </aside>
    </div>
  );
}

function PrimaryCard({ name, s, isPrimary }: { name: string; s: NameStatus; isPrimary: boolean }) {
  const t = useT();
  const { address } = useAccount();
  const tx = useTx();
  if (!address) return null;
  const pointsHere = s.resolvedAddress.toLowerCase() === address.toLowerCase();
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 18 }}>{t('Primary name')}</h2>
      {isPrimary ? (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>{t('{name} is what apps show for your wallet.', { name })}</p>
      ) : pointsHere ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>{t('Show {name} instead of your address in apps.', { name })}</p>
          <button
            type="button"
            className="btn btn-plain"
            style={{ alignSelf: 'flex-start' }}
            disabled={tx.state.busy}
            onClick={() =>
              tx.run([{ label: t('Setting primary name'), args: () => ({ address: deployment!.ReverseRegistrar, abi: reverseRegistrarAbi, functionName: 'setName', args: [name] }) }])
            }
          >
            {t('Make it my primary name')}
          </button>
          <TxNotice state={tx.state} success={t('Done.')} />
        </>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>{t('To make it your primary name, first point its wallet address at your wallet.')}</p>
      )}
    </div>
  );
}

interface Sub {
  labelhash: Hex;
  label?: string;
  node: Hex;
  owner: Address;
  live: boolean;
}

const LABEL_CACHE = 'hood:labels';
function rememberLabel(label: string) {
  try {
    const map = JSON.parse(localStorage.getItem(LABEL_CACHE) ?? '{}');
    map[labelhash(label)] = label;
    localStorage.setItem(LABEL_CACHE, JSON.stringify(map));
  } catch {
    /* not essential */
  }
}
function knownLabel(hash: Hex): string | undefined {
  try {
    return JSON.parse(localStorage.getItem(LABEL_CACHE) ?? '{}')[hash];
  } catch {
    return undefined;
  }
}

function Subnames({ label, s, canEdit }: { label: string; s: NameStatus; canEdit: boolean }) {
  const t = useT();
  const { address } = useAccount();
  const client = usePublicClient();
  const tx = useTx();
  const name = fullName(label);
  const [newLabel, setNewLabel] = useState('');
  const [newOwner, setNewOwner] = useState('');

  const subs = useQuery({
    queryKey: ['subnames', s.node, s.holder],
    enabled: !!client && !!deployment,
    queryFn: async (): Promise<Sub[]> => {
      const topic0 = encodeEventTopics({ abi: registryAbi, eventName: 'NewOwner' })[0];
      const logs = await fetchLogs(client!, deployment!.ENSRegistry, [topic0, s.node], BigInt(deployment!.deployBlock));
      const hashes = new Set<Hex>();
      for (const l of logs) {
        const ev = decode(registryAbi, l);
        if (ev?.eventName === 'NewOwner') hashes.add((ev.args as { label: Hex }).label);
      }
      const out: Sub[] = [];
      for (const h of hashes) {
        const node = keccak256(concat([s.node, h]));
        let owner = (await client!.readContract({ address: deployment!.ENSRegistry, abi: registryAbi, functionName: 'owner', args: [node] })) as Address;
        let text = knownLabel(h);
        if (owner.toLowerCase() === deployment!.NameWrapper.toLowerCase()) {
          owner = (await client!.readContract({ address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'ownerOf', args: [BigInt(node)] })) as Address;
          if (!text) {
            const dns = (await client!.readContract({ address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'names', args: [node] })) as Hex;
            if (dns && dns !== '0x') {
              const len = parseInt(dns.slice(2, 4), 16);
              text = hexToString(('0x' + dns.slice(4, 4 + len * 2)) as Hex);
            }
          }
        }
        if (owner === zeroAddress) continue;
        const live = (await client!.readContract({ address: deployment!.HoodResolverPolicy, abi: policyAbi, functionName: 'isSubnameLive', args: [s.node, node] })) as boolean;
        out.push({ labelhash: h, label: text, node, owner, live });
      }
      return out;
    },
  });

  const parsedNew = parseLabel(newLabel);
  const ownerAddr = newOwner.trim() ? toAddress(newOwner) : address;
  const ownerOk = !!ownerAddr;

  const create = async () => {
    if (!parsedNew.ok || !ownerOk || !deployment || !address) return;
    const sl = parsedNew.label;
    const subnode = subnodeOf(s.node, sl);
    rememberLabel(sl);
    const self = ownerAddr!.toLowerCase() === address.toLowerCase();
    const steps: Parameters<typeof tx.run>[0] = [
      {
        label: t('Creating the subname'),
        args: () =>
          s.wrapped
            ? { address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'setSubnodeRecord', args: [s.node, sl, ownerAddr!, deployment!.PublicResolver, 0n, 0, 0n] }
            : { address: deployment!.ENSRegistry, abi: registryAbi, functionName: 'setSubnodeRecord', args: [s.node, labelhash(sl), ownerAddr!, deployment!.PublicResolver, 0n] },
      },
    ];
    if (self)
      steps.push({
        label: t('Pointing it at your wallet'),
        args: () => ({ address: deployment!.PublicResolver, abi: resolverAbi, functionName: 'setAddr', args: [subnode, address] }),
      });
    steps.push({
      label: t('Switching it on'),
      args: () => ({ address: deployment!.HoodResolverPolicy, abi: policyAbi, functionName: 'approveSubnames', args: [[subnode], true] }),
    });
    if (await tx.run(steps)) {
      setNewLabel('');
      setNewOwner('');
    }
  };

  const toggle = (sub: Sub) =>
    tx.run([
      {
        label: sub.live ? t('Switching it off') : t('Switching it on'),
        args: () => ({ address: deployment!.HoodResolverPolicy, abi: policyAbi, functionName: 'approveSubnames', args: [[sub.node], !sub.live] }),
      },
    ]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <h2>{t('Subnames')}</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>
            {t('Names like {example}. A subname only works while you have switched it on. If its owner or resolver changes, switch it on again.', { example: `pay.${name}` })}
          </p>
        </div>
        {subs.isLoading ? (
          <p className="card-pad muted" style={{ margin: 0 }}>{t('Looking for subnames…')}</p>
        ) : !subs.data?.length ? (
          <p className="card-pad muted" style={{ margin: 0 }}>{t('No subnames yet.')}</p>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th scope="col">{t('Name')}</th><th scope="col">{t('Owner')}</th><th scope="col">{t('Status')}</th><th scope="col">{t('Resolving')}</th></tr></thead>
              <tbody>
                {subs.data.map((sub) => (
                  <tr key={sub.node}>
                    <td className="nameface" translate="no" style={{ fontWeight: 600 }}>{sub.label ? `${sub.label}.${name}` : `[${sub.labelhash.slice(0, 10)}…].${name}`}</td>
                    <td className="mono muted" translate="no">{address && sub.owner.toLowerCase() === address.toLowerCase() ? t('You') : shortAddress(sub.owner)}</td>
                    <td style={{ color: sub.live ? 'var(--good)' : 'var(--warn)' }}>{sub.live ? t('Working') : t('Switched off')}</td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        className="switch"
                        aria-checked={sub.live}
                        aria-label={sub.label ? t('Resolve {name}', { name: sub.label }) : t('Resolve this subname')}
                        disabled={!canEdit || tx.state.busy}
                        onClick={() => toggle(sub)}
                      >
                        <span />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canEdit && (
        <section className="card card-pad stack">
          <h2>{t('New subname')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="sub-label">{t('Name')}</label>
              <div className="input-wrap">
                <input id="sub-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="pay" autoCapitalize="off" spellCheck={false} translate="no" />
                <span className="nameface dim" translate="no">.{name}</span>
              </div>
              {newLabel && !parsedNew.ok && <p className="error-text">{parsedNew.reason}</p>}
            </div>
            <div className="field">
              <label htmlFor="sub-owner">{t('Owner')} <span className="faint" style={{ fontWeight: 400 }}>{t('(blank = you)')}</span></label>
              <input id="sub-owner" className="input mono" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x…" translate="no" />
              {newOwner && !isAddress(newOwner) && <p className="error-text">{t('That is not a wallet address.')}</p>}
            </div>
          </div>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!parsedNew.ok || !ownerOk || tx.state.busy} onClick={create}>
            {t('Create subname')}
          </button>
          <TxNotice state={tx.state} success={t('Subname created and switched on.')} />
        </section>
      )}
    </div>
  );
}

function Ownership({ label, s, isHolder }: { label: string; s: NameStatus; isHolder: boolean }) {
  const t = useT();
  const config = useConfig();
  const { address } = useAccount();
  const coin = useStablecoin();
  const tx = useTx();
  const send = useTx();
  const name = fullName(label);
  const [years, setYears] = useState(1);
  const [pay, setPay] = useState<'eth' | 'token' | 'points'>(coin.enabled ? 'token' : 'eth');
  const [to, setTo] = useState('');
  const [sure, setSure] = useState(false);
  const duration = BigInt(years) * YEAR;
  const payment = { token: pay === 'token' && coin.address ? coin.address : zeroAddress, usePoints: pay === 'points', maxTokenAmount: 0n } as const;

  const quote = useReadContract({
    address: deployment?.HoodRegistrarController,
    abi: controllerAbi,
    functionName: 'quoteRenewal',
    args: [label, duration, address ?? zeroAddress, payment],
    query: { enabled: !!deployment },
  });

  // Recipient: an address, or a name that resolves to one.
  const target = useRecipient(to);
  const recipient = target.address;
  const self = !!recipient && !!address && recipient.toLowerCase() === address.toLowerCase();

  const renew = async () => {
    if (!deployment || !address) return;
    const fresh = await readContract(config, {
      address: deployment!.HoodRegistrarController,
      abi: controllerAbi,
      functionName: 'quoteRenewal',
      args: [label, duration, address, payment],
    });
    const isToken = payment.token !== zeroAddress;
    const steps: Parameters<typeof tx.run>[0] = [];
    if (isToken) {
      const allowance = await readContract(config, { address: payment.token, abi: erc20Abi, functionName: 'allowance', args: [address, deployment!.HoodRegistrarController] });
      if (allowance < fresh.amountDue)
        steps.push({ label: t('Allowing {token} payment', { token: coin.symbol }), args: () => ({ address: payment.token, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodRegistrarController, fresh.amountDue] }) });
    }
    steps.push({
      label: t('Renewing'),
      args: () => ({
        address: deployment!.HoodRegistrarController,
        abi: controllerAbi,
        functionName: 'renewWithPayment',
        args: [label, duration, ('0x' + '0'.repeat(64)) as Hex, { ...payment, maxTokenAmount: isToken ? fresh.amountDue : 0n }],
        value: isToken ? 0n : fresh.amountDue + fresh.amountDue / 100n,
      }),
    });
    await tx.run(steps);
  };

  const transfer = () => {
    if (!recipient || !address || !deployment) return;
    send.run([
      {
        label: t('Sending {name}', { name }),
        args: () =>
          s.wrapped
            ? { address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'safeTransferFrom', args: [address, recipient, BigInt(s.node), 1n, '0x'] }
            : { address: deployment!.BaseRegistrar, abi: baseRegistrarAbi, functionName: 'safeTransferFrom', args: [address, recipient, BigInt(s.labelhash)] },
      },
    ]);
  };

  const q = quote.data;
  const grace = s.state === 'Grace';

  return (
    <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
      <section className="card card-pad stack">
        <h2>{t('Renew')}</h2>
        <p className="hint">{t('Anyone can renew a name, for themselves or as a gift. It stays with its owner.')}</p>
        <div className="choice-grid" role="group" aria-label={t('Renewal length')}>
          {[1, 2, 3, 5].map((y) => (
            <button key={y} type="button" className="choice" aria-pressed={years === y} onClick={() => setYears(y)}>{y === 1 ? t('1 year') : t('{n} years', { n: y })}</button>
          ))}
        </div>
        <div className="choice-grid" role="group" aria-label={t('Payment')}>
          {coin.enabled && <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>{coin.symbol}</button>}
          <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>ETH</button>
          {modules.points && <button type="button" className="choice" aria-pressed={pay === 'points'} onClick={() => setPay('points')}>{t('Points')}</button>}
        </div>
        <div className="total" translate="no">
          <span style={{ fontWeight: 600 }}>{t('You pay')}</span>
          <span className="price">{q ? (payment.token !== zeroAddress ? token(q.amountDue, coin.decimals, coin.symbol) : q.amountDue === 0n ? t('Covered by points') : eth(q.amountDue)) : '…'}</span>
        </div>
        <p className="hint" translate="no">{t('New expiry {date}.', { date: date(s.expires + duration) })}</p>
        {!address ? (
          <ConnectPrompt what={t('renew')} />
        ) : (
          <button type="button" className="btn btn-primary" disabled={tx.state.busy || !q} onClick={renew}>{t('Renew {name}', { name })}</button>
        )}
        <TxNotice state={tx.state} success={t('Renewed.')} />
      </section>

      {!grace && (
        <section className="card card-pad stack">
          <h2>{t('Send this name')}</h2>
          {isHolder ? (
            <>
              <RecipientField id="to" label={t('To')} placeholder={t('name.{parent} or 0x…', { parent: parentName })} value={to} onChange={(v) => { setTo(v); setSure(false); }} recipient={target} />
              {self && <p className="error-text">{t('That is your own wallet.')}</p>}
              <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
                {t('The recipient controls it straight away and starts with no records. Your subnames stop working until they switch them on.')}
              </p>
              <label className="check">
                <input type="checkbox" checked={sure} onChange={() => setSure(!sure)} disabled={!recipient || self} />
                <span>{t('I want to give {name} away. This cannot be undone.', { name })}</span>
              </label>
              <button type="button" className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={!recipient || self || !sure || send.state.busy} onClick={transfer}>
                {t('Send {name}', { name })}
              </button>
              <TxNotice state={send.state} success={t('Sent.')} />
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{t('Only the owner can send this name.')}</p>
          )}
        </section>
      )}

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2>{t('Details')}</h2>
        {!grace && <div className="line"><span className="k">{t('Owner')}</span><span className="mono" translate="no">{shortAddress(s.holder)}</span></div>}
        {!grace && <div className="line"><span className="k">{t('Held for')}</span><span translate="no">{s.wrapped ? t('Not tracked') : heldFor(s.heldSince)}</span></div>}
        <div className="line"><span className="k">{t('Expires')}</span><span translate="no">{date(s.expires)}</span></div>
        <div className="line"><span className="k">{t('Grace period ends')}</span><span translate="no">{date(s.expires + GRACE_PERIOD)}</span></div>
        {!grace && <div className="line"><span className="k">{t('Resolver')}</span><span>{s.resolver === zeroAddress ? t('None') : s.customResolver ? t('Custom (approved)') : s.resolverAllowed ? t('Standard (trusted)') : t('Not approved')}</span></div>}
      </section>
    </div>
  );
}

/** The avatar record: upload a picture (stored on-chain, a few KB) or paste a link. */
function AvatarField({ label, value, saved, disabled, onChange }: { label: string; value: string; saved: string; disabled: boolean; onChange: (v: string) => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isUpload = value.startsWith('data:');
  const preview = avatarSrc(value);
  return (
    <div className="field" style={{ gridColumn: '1 / -1' }}>
      <span className="label">{t('Profile picture')}</span>
      <div className="avatar-edit">
        <Avatar label={label} record={value} size={64} />
        <label className={'btn btn-plain' + (disabled || busy ? ' disabled' : '')} style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
          {busy ? t('Preparing…') : t('Upload a picture')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            className="sr-only"
            disabled={disabled || busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              setError('');
              setBusy(true);
              try {
                onChange(await toAvatarDataUrl(file));
              } catch (err) {
                setError(err instanceof Error ? t(err.message) : t('That picture could not be used.'));
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {value && !disabled && (
          <button type="button" className="linkish" onClick={() => onChange('')}>{t('Remove')}</button>
        )}
      </div>
      {isUpload ? (
        <p className="hint">
          {value === saved
            ? t('Stored on-chain with your records ({kb} KB).', { kb: Math.max(1, Math.round(value.length / 1024)) })
            : t('Picture ready ({kb} KB). It is stored on-chain with your records when you save.', { kb: Math.max(1, Math.round(value.length / 1024)) })}
        </p>
      ) : (
        <input
          id="r-avatar"
          aria-label={t('Picture link')}
          className="input"
          value={value}
          translate="no"
          placeholder={t('Or paste an image link (https:// or ipfs://)')}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {value && !preview && <p className="error-text">{t('That link can’t be shown as a picture. Use https:// or ipfs://.')}</p>}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
