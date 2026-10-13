import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { concat, encodeEventTopics, encodeFunctionData, erc20Abi, hexToString, keccak256, type Address, type Hex, zeroAddress } from 'viem';
import { useAccount, useConfig, usePublicClient, useReadContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { useQuery } from '@tanstack/react-query';
import { baseRegistrarAbi, controllerAbi, lensAbi, nameWrapperAbi, policyAbi, registryAbi, resolverAbi, reverseRegistrarAbi } from '../abi';
import { deployment, GRACE_PERIOD, modules, parentName, YEAR } from '../config';
import { Status, TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { ago, date, eth, isAddress, shortAddress, token } from '../lib/format';
import { STATES, useNameStatus, usePrimaryName, useStablecoin, type NameStatus } from '../lib/hooks';
import { decode, fetchLogs } from '../lib/logs';
import { fullName, labelhash, parseLabel, subnodeOf } from '../lib/names';
import { useTx } from '../lib/tx';

type Tab = 'records' | 'subnames' | 'ownership';

export function Manage() {
  const params = useParams();
  const parsed = parseLabel(decodeURIComponent(params.label ?? ''));
  const label = parsed.ok ? parsed.label : undefined;
  const status = useNameStatus(label);
  const [search, setSearch] = useSearchParams();
  const tab = (search.get('tab') as Tab) || 'records';
  const { address } = useAccount();
  const primary = usePrimaryName(address);

  if (!label) return <div className="page narrow"><Link to="/" className="back">← Search</Link><p className="error-text">{!parsed.ok && parsed.reason}</p></div>;
  const s = status.data;
  const name = fullName(label);

  if (!s) return <div className="page narrow"><p className="muted">{status.isError ? 'Could not reach the network.' : 'Loading…'}</p></div>;
  if (s.state !== 'Active' && s.state !== 'Grace')
    return (
      <div className="page narrow stack">
        <Link to="/names" className="back">← My names</Link>
        <h1 className="name-title">{label}<span className="dim">.{parentName}</span></h1>
        <p className="muted">{name} is not registered.</p>
        <Link to={`/?q=${encodeURIComponent(label)}`}>Check if it is available</Link>
      </div>
    );

  const isHolder = !!address && s.holder.toLowerCase() === address.toLowerCase();
  const isManager = !!address && s.manager.toLowerCase() === address.toLowerCase();
  const setTab = (t: Tab) => setSearch(t === 'records' ? {} : { tab: t }, { replace: true });
  const grace = s.state === 'Grace';

  return (
    <div className="page">
      <Link to="/names" className="back">← My names</Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px 24px', margin: '16px 0 28px' }}>
        <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--ink)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 30px var(--mono)' }}>
          {[...label][0]}
        </div>
        <div style={{ marginRight: 'auto', minWidth: 0 }}>
          <h1 className="name-title" style={{ fontSize: 44 }}>{label}<span className="dim">.{parentName}</span></h1>
          <div className="muted" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 15, marginTop: 6 }}>
            <span>{grace ? `Expired ${date(s.expires)}` : `Expires ${date(s.expires)}`}</span>
            {primary.data === name && <span>· Your primary name</span>}
            {!grace && <span className="mono">· {shortAddress(s.holder)}</span>}
            {s.wrapped && <span>· Wrapped</span>}
          </div>
        </div>
        {grace ? <Status tone="bad">Expired</Status> : isHolder ? <Status tone="good">Yours</Status> : <Status tone="neutral">Registered</Status>}
      </div>

      {grace && (
        <div className="notice warn" style={{ marginBottom: 24 }}>
          <p>This name has stopped working. Renew it by {date(s.expires + GRACE_PERIOD)}, or anyone can register it after that.</p>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Manage">
        {(grace ? (['ownership'] as Tab[]) : (['records', 'subnames', 'ownership'] as Tab[])).map((t) => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={(grace ? 'ownership' : tab) === t} onClick={() => setTab(t)}>
            {t === 'records' ? 'Records' : t === 'subnames' ? 'Subnames' : grace ? 'Renew' : 'Ownership'}
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
  ['url', 'Website', 'https://'],
  ['avatar', 'Avatar', 'Image link'],
  ['description', 'Bio', 'A line about you'],
];

function Records({ label, s, canEdit }: { label: string; s: NameStatus; canEdit: boolean }) {
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
    if (addr.trim() !== before && (addr.trim() === '' || isAddress(addr)))
      out.push(encodeFunctionData({ abi: resolverAbi, functionName: 'setAddr', args: [s.node, (addr.trim() || zeroAddress) as Address] }));
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
        <h2>This name has no working resolver</h2>
        <p className="muted" style={{ margin: 0 }}>
          {s.resolver === zeroAddress
            ? 'It is not set up to point anywhere yet.'
            : 'It uses a resolver that has not been approved for it, so it does not resolve.'}
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
                    label: 'Switching to the standard resolver',
                    args: () =>
                      s.wrapped
                        ? { address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'setResolver', args: [s.node, deployment!.PublicResolver] }
                        : { address: deployment!.ENSRegistry, abi: registryAbi, functionName: 'setResolver', args: [s.node, deployment!.PublicResolver] },
                  },
                ])
              }
            >
              Use the standard resolver
            </button>
            <TxNotice state={tx.state} success="Done." />
          </>
        )}
      </div>
    );

  return (
    <div className="row">
      <section className="main-col card card-pad" style={{ gap: 20 }}>
        <h2>What {name} points to</h2>
        <div className="field">
          <label htmlFor="r-addr">Wallet address</label>
          <input id="r-addr" className="input mono" value={addr} disabled={locked} placeholder="0x…" onChange={(e) => { setEdited(true); setAddr(e.target.value); }} />
          {addrInvalid && <p className="error-text">That is not a wallet address.</p>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {TEXT_KEYS.map(([k, title, ph], i) => (
            <div className="field" key={k}>
              <label htmlFor={`r-${k}`}>{title}</label>
              <input
                id={`r-${k}`}
                className="input"
                value={texts[i]}
                placeholder={ph}
                disabled={locked}
                onChange={(e) => {
                  setEdited(true);
                  setTexts(texts.map((t, j) => (j === i ? e.target.value : t)));
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
                      label: 'Saving records',
                      args: () => ({ address: s.resolver, abi: resolverAbi, functionName: 'multicall', args: [changes] }),
                    },
                  ]);
                  if (ok) setEdited(false);
                }}
              >
                Save changes
              </button>
              <span className="hint">One wallet confirmation for all changes.</span>
            </div>
            <TxNotice state={tx.state} success="Saved." />
          </div>
        ) : (
          <p className="hint">Only the owner can change these.</p>
        )}
      </section>
      <aside className="side-col">
        <PrimaryCard name={name} s={s} isPrimary={primary.data === name} />
        <div className="card card-pad stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 17 }}>If you sell or give it away</h2>
          <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
            These records are yours, not the name's. The next owner starts with a blank name, and none of this keeps pointing at you.
          </p>
        </div>
      </aside>
    </div>
  );
}

function PrimaryCard({ name, s, isPrimary }: { name: string; s: NameStatus; isPrimary: boolean }) {
  const { address } = useAccount();
  const tx = useTx();
  if (!address) return null;
  const pointsHere = s.resolvedAddress.toLowerCase() === address.toLowerCase();
  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <h2 style={{ fontSize: 17 }}>Primary name</h2>
      {isPrimary ? (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>{name} is what apps show for your wallet.</p>
      ) : pointsHere ? (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>Show {name} instead of your address in apps.</p>
          <button
            type="button"
            className="btn btn-plain"
            style={{ alignSelf: 'flex-start' }}
            disabled={tx.state.busy}
            onClick={() =>
              tx.run([{ label: 'Setting primary name', args: () => ({ address: deployment!.ReverseRegistrar, abi: reverseRegistrarAbi, functionName: 'setName', args: [name] }) }])
            }
          >
            Make it my primary name
          </button>
          <TxNotice state={tx.state} success="Done." />
        </>
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>To make it your primary name, first point its wallet address at your wallet.</p>
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
  const ownerAddr = (newOwner.trim() || address) as Address | undefined;
  const ownerOk = !!ownerAddr && isAddress(ownerAddr);

  const create = async () => {
    if (!parsedNew.ok || !ownerOk || !deployment || !address) return;
    const sl = parsedNew.label;
    const subnode = subnodeOf(s.node, sl);
    rememberLabel(sl);
    const self = ownerAddr!.toLowerCase() === address.toLowerCase();
    const steps: Parameters<typeof tx.run>[0] = [
      {
        label: 'Creating the subname',
        args: () =>
          s.wrapped
            ? { address: deployment!.NameWrapper, abi: nameWrapperAbi, functionName: 'setSubnodeRecord', args: [s.node, sl, ownerAddr!, deployment!.PublicResolver, 0n, 0, 0n] }
            : { address: deployment!.ENSRegistry, abi: registryAbi, functionName: 'setSubnodeRecord', args: [s.node, labelhash(sl), ownerAddr!, deployment!.PublicResolver, 0n] },
      },
    ];
    if (self)
      steps.push({
        label: 'Pointing it at your wallet',
        args: () => ({ address: deployment!.PublicResolver, abi: resolverAbi, functionName: 'setAddr', args: [subnode, address] }),
      });
    steps.push({
      label: 'Switching it on',
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
        label: sub.live ? 'Switching it off' : 'Switching it on',
        args: () => ({ address: deployment!.HoodResolverPolicy, abi: policyAbi, functionName: 'approveSubnames', args: [[sub.node], !sub.live] }),
      },
    ]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <h2>Subnames</h2>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>
            Names like pay.{name}. A subname only works while you have switched it on. If its owner or resolver changes, switch it on again.
          </p>
        </div>
        {subs.isLoading ? (
          <p className="card-pad muted" style={{ margin: 0 }}>Looking for subnames…</p>
        ) : !subs.data?.length ? (
          <p className="card-pad muted" style={{ margin: 0 }}>No subnames yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th scope="col">Name</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Resolving</th></tr></thead>
              <tbody>
                {subs.data.map((sub) => (
                  <tr key={sub.node}>
                    <td className="mono">{sub.label ? `${sub.label}.${name}` : `[${sub.labelhash.slice(0, 10)}…].${name}`}</td>
                    <td className="mono muted">{address && sub.owner.toLowerCase() === address.toLowerCase() ? 'You' : shortAddress(sub.owner)}</td>
                    <td style={{ color: sub.live ? 'var(--accent)' : 'var(--warn)' }}>{sub.live ? 'Working' : 'Switched off'}</td>
                    <td>
                      <button
                        type="button"
                        role="switch"
                        className="switch"
                        aria-checked={sub.live}
                        aria-label={`Resolve ${sub.label ?? 'subname'}`}
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
          <h2>New subname</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="sub-label">Name</label>
              <div className="input-wrap">
                <input id="sub-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="pay" autoCapitalize="off" spellCheck={false} />
                <span className="mono dim">.{name}</span>
              </div>
              {newLabel && !parsedNew.ok && <p className="error-text">{parsedNew.reason}</p>}
            </div>
            <div className="field">
              <label htmlFor="sub-owner">Owner <span className="faint" style={{ fontWeight: 400 }}>(blank = you)</span></label>
              <input id="sub-owner" className="input mono" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="0x…" />
              {newOwner && !isAddress(newOwner) && <p className="error-text">That is not a wallet address.</p>}
            </div>
          </div>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!parsedNew.ok || !ownerOk || tx.state.busy} onClick={create}>
            Create subname
          </button>
          <TxNotice state={tx.state} success="Subname created and switched on." />
        </section>
      )}
    </div>
  );
}

function Ownership({ label, s, isHolder }: { label: string; s: NameStatus; isHolder: boolean }) {
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
  const toParsed = to.trim() && !isAddress(to) ? parseLabel(to) : undefined;
  const toStatus = useReadContract({
    address: deployment?.HoodNameLens,
    abi: lensAbi,
    functionName: 'status',
    args: toParsed?.ok ? [toParsed.label] : undefined,
    query: { enabled: !!toParsed?.ok },
  });
  const recipient: Address | undefined = isAddress(to)
    ? (to.trim() as Address)
    : toStatus.data && STATES[toStatus.data.state] === 'Active' && toStatus.data.resolvedAddress !== zeroAddress
      ? toStatus.data.resolvedAddress
      : undefined;

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
        steps.push({ label: `Allowing ${coin.symbol} payment`, args: () => ({ address: payment.token, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodRegistrarController, fresh.amountDue] }) });
    }
    steps.push({
      label: 'Renewing',
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
        label: `Sending ${name}`,
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
        <h2>Renew</h2>
        <p className="hint">Anyone can renew a name, for themselves or as a gift. It stays with its owner.</p>
        <div className="choice-grid" role="group" aria-label="Renewal length">
          {[1, 2, 3, 5].map((y) => (
            <button key={y} type="button" className="choice" aria-pressed={years === y} onClick={() => setYears(y)}>{y} {y === 1 ? 'year' : 'years'}</button>
          ))}
        </div>
        <div className="choice-grid" role="group" aria-label="Payment">
          {coin.enabled && <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>{coin.symbol}</button>}
          <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>ETH</button>
          {modules.points && <button type="button" className="choice" aria-pressed={pay === 'points'} onClick={() => setPay('points')}>Points</button>}
        </div>
        <div className="total">
          <span style={{ fontWeight: 600 }}>You pay</span>
          <span className="price">{q ? (payment.token !== zeroAddress ? token(q.amountDue, coin.decimals, coin.symbol) : q.amountDue === 0n ? 'Covered by points' : eth(q.amountDue)) : '…'}</span>
        </div>
        <p className="hint">New expiry {date(s.expires + duration)}.</p>
        {!address ? (
          <ConnectPrompt what="renew" />
        ) : (
          <button type="button" className="btn btn-primary" disabled={tx.state.busy || !q} onClick={renew}>Renew {name}</button>
        )}
        <TxNotice state={tx.state} success="Renewed." />
      </section>

      {!grace && (
        <section className="card card-pad stack">
          <h2>Send this name</h2>
          {isHolder ? (
            <>
              <div className="field">
                <label htmlFor="to">To</label>
                <input id="to" className="input mono" value={to} onChange={(e) => { setTo(e.target.value); setSure(false); }} placeholder={`0x… or a .${parentName} name`} autoCapitalize="off" spellCheck={false} />
                {to.trim() && !recipient && <p className="error-text">{toParsed && !toParsed.ok ? toParsed.reason : 'That does not lead to a wallet.'}</p>}
                {recipient && !isAddress(to) && <p className="hint mono">{recipient}</p>}
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
                The recipient controls it straight away and starts with no records. Your subnames stop working until they switch them on.
              </p>
              <label className="check">
                <input type="checkbox" checked={sure} onChange={() => setSure(!sure)} disabled={!recipient} />
                <span>I want to give {name} away. This cannot be undone.</span>
              </label>
              <button type="button" className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={!recipient || !sure || send.state.busy} onClick={transfer}>
                Send {name}
              </button>
              <TxNotice state={send.state} success="Sent." />
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Only the owner can send this name.</p>
          )}
        </section>
      )}

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2>Details</h2>
        {!grace && <div className="line"><span className="k">Owner</span><span className="mono">{shortAddress(s.holder)}</span></div>}
        {!grace && <div className="line"><span className="k">Held for</span><span>{s.wrapped ? 'Not tracked' : ago(s.heldSince)}</span></div>}
        <div className="line"><span className="k">Expires</span><span>{date(s.expires)}</span></div>
        <div className="line"><span className="k">Grace period ends</span><span>{date(s.expires + GRACE_PERIOD)}</span></div>
        {!grace && <div className="line"><span className="k">Resolver</span><span>{s.resolver === zeroAddress ? 'None' : s.customResolver ? 'Custom (approved)' : s.resolverAllowed ? 'Standard (trusted)' : 'Not approved'}</span></div>}
      </section>
    </div>
  );
}
