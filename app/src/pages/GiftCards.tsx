import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { erc20Abi } from 'viem';
import { useAccount, useConfig, useReadContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { giftCardAbi, pointsLedgerAbi } from '../abi';
import { deployment, modules } from '../config';
import { TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { rememberGiftFace } from '../lib/describe';
import { shortAddress, usd } from '../lib/format';
import { useRecipient, useStablecoin } from '../lib/hooks';
import { useTx } from '../lib/tx';

const IDS = [1n, 2n, 3n];

export function GiftCards() {
  const { address, status } = useAccount();
  const faceOf = { address: deployment?.HoodGiftCard, abi: giftCardAbi, functionName: 'faceValue', query: { enabled: modules.giftCards } } as const;
  const faces = [useReadContract({ ...faceOf, args: [1n] }), useReadContract({ ...faceOf, args: [2n] }), useReadContract({ ...faceOf, args: [3n] })];
  const held = useReadContract({
    address: deployment?.HoodGiftCard,
    abi: giftCardAbi,
    functionName: 'balanceOfBatch',
    args: address ? [IDS.map(() => address), IDS] : undefined,
    query: { enabled: modules.giftCards && !!address, refetchInterval: 20_000 },
  });
  const points = useReadContract({
    address: deployment?.HoodPointsLedger,
    abi: pointsLedgerAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: modules.points && !!address },
  });

  const cards = IDS.map((id, i) => ({ id, value: faces[i].data ?? 0n, count: held.data?.[i] ?? 0n })).filter((c) => c.value > 0n);
  useEffect(() => {
    for (const c of cards) rememberGiftFace(c.id, c.value);
  });

  if (!modules.giftCards)
    return (
      <div className="page narrow">
        <p className="muted">Gift cards are not switched on for this deployment.</p>
        <Link to="/">Back to search</Link>
      </div>
    );

  const loadingCards = !!address && (held.isLoading || faces.some((f) => f.isLoading));
  const heldTotal = cards.reduce((sum, c) => sum + c.count * c.value, 0n);

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <div className="stack" style={{ gap: 12 }}>
        <h1 className="title">Gift cards</h1>
        <p className="muted" style={{ margin: 0, fontSize: 18, maxWidth: 680, lineHeight: 1.5 }}>
          A gift card holds a fixed dollar amount. Send it to anyone by name or address. When they redeem it, it turns into points they can
          spend on a name or a renewal.
        </p>
      </div>
      {!address ? (
        status === 'reconnecting' || status === 'connecting' ? (
          <p className="muted">Connecting your wallet…</p>
        ) : (
          <ConnectPrompt what="buy, send or redeem gift cards" />
        )
      ) : (
        <div className="row">
          <Buy cards={cards} />
          <aside className="side-col">
            <Held cards={cards} total={heldTotal} loading={loadingCards} />
            <section className="card card-pad stack" style={{ gap: 8 }}>
              <div className="eyebrow" style={{ color: 'var(--faint)' }}>Your points</div>
              <div className="figure">{usd(points.data ?? 0n)}</div>
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>
                Redeemed cards land here. Choose <strong>Points</strong> when you register or renew to spend them.
              </p>
              <Link to="/names#points">See where your points went</Link>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

interface Card {
  id: bigint;
  value: bigint;
  count: bigint;
}

function Buy({ cards }: { cards: Card[] }) {
  const config = useConfig();
  const { address } = useAccount();
  const coin = useStablecoin();
  const tx = useTx();
  const [choice, setChoice] = useState(0);
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState('');
  const [pay, setPay] = useState<'eth' | 'token'>(coin.enabled ? 'token' : 'eth');
  const recipient = useRecipient(to);
  const target = to.trim() ? recipient.address : address;
  const chosen = cards[choice];

  const buy = async () => {
    if (!chosen || !target || !deployment || !address) return;
    const ids = [chosen.id];
    const amounts = [BigInt(qty)];
    const steps: Parameters<typeof tx.run>[0] = [];
    if (pay === 'token' && coin.address) {
      const due = await readContract(config, { address: deployment.HoodGiftCard, abi: giftCardAbi, functionName: 'priceInToken', args: [coin.address, ids, amounts] });
      const allowance = await readContract(config, { address: coin.address, abi: erc20Abi, functionName: 'allowance', args: [address, deployment.HoodGiftCard] });
      if (allowance < due)
        steps.push({ label: `Allowing ${coin.symbol} payment`, args: () => ({ address: coin.address!, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodGiftCard, due] }) });
      steps.push({ label: 'Buying', args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'buyWithToken', args: [coin.address!, due, target, ids, amounts] }) });
    } else {
      const due = await readContract(config, { address: deployment.HoodGiftCard, abi: giftCardAbi, functionName: 'priceInETH', args: [ids, amounts] });
      steps.push({ label: 'Buying', args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'buy', args: [target, ids, amounts], value: due + due / 100n }) });
    }
    await tx.run(steps);
  };

  const toSomeoneElse = !!target && !!address && target.toLowerCase() !== address.toLowerCase();
  return (
    <section className="main-col card card-pad" style={{ gap: 18 }}>
      <h2>Buy</h2>
      <div className="choice-grid" role="group" aria-label="Card value">
        {cards.map((c, i) => (
          <button key={String(c.id)} type="button" className="choice" aria-pressed={choice === i} onClick={() => setChoice(i)}>{usd(c.value)}</button>
        ))}
      </div>
      {!cards.length && <p className="hint">Loading card values…</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <div className="field">
          <label htmlFor="qty">How many</label>
          <input id="qty" className="input" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        </div>
        <RecipientField id="gift-to" label="For" placeholder="name.hood or 0x… (blank = you)" value={to} onChange={setTo} recipient={recipient} />
      </div>
      <div className="choice-grid" role="group" aria-label="Payment">
        {coin.enabled && <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>{coin.symbol}</button>}
        <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>ETH</button>
      </div>
      <div className="total"><span style={{ fontWeight: 600 }}>Total</span><span className="price">{chosen ? usd(chosen.value * BigInt(qty)) : '…'}</span></div>
      <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!chosen || !target || tx.state.busy} onClick={buy}>
        {toSomeoneElse ? `Buy and send to ${recipient.name ?? shortAddress(target!)}` : `Buy gift card${qty > 1 ? 's' : ''}`}
      </button>
      <TxNotice state={tx.state} success={toSomeoneElse ? `Sent to ${recipient.name ?? shortAddress(target!)}.` : 'Bought. They are in your cards.'} />
    </section>
  );
}

function Held({ cards, total, loading }: { cards: Card[]; total: bigint; loading: boolean }) {
  const { address } = useAccount();
  const tx = useTx();
  const [sendId, setSendId] = useState<bigint | null>(null);
  const [last, setLast] = useState<'send' | 'redeem'>('redeem');
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState('');
  const recipient = useRecipient(to);
  const mine = cards.filter((c) => c.count > 0n);
  const sending = mine.find((c) => c.id === sendId);

  const redeem = () => {
    if (!mine.length) return;
    setLast('redeem');
    tx.run([
      {
        label: 'Redeeming',
        args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'redeem', args: [mine.map((c) => c.id), mine.map((c) => c.count)] }),
      },
    ]);
  };
  const send = async () => {
    if (!sending || !recipient.address || !address) return;
    setLast('send');
    const ok = await tx.run([
      {
        label: 'Sending',
        args: () => ({
          address: deployment!.HoodGiftCard,
          abi: giftCardAbi,
          functionName: 'safeTransferFrom',
          args: [address, recipient.address!, sending.id, BigInt(qty), '0x'],
        }),
      },
    ]);
    if (ok) {
      setSendId(null);
      setTo('');
      setQty(1);
    }
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="eyebrow" style={{ color: 'var(--faint)' }}>Cards you hold</div>
      <div className="figure">{loading ? '…' : usd(total)}</div>
      {mine.length > 0 && (
        <ul className="rows">
          {mine.map((c) => (
            <li key={String(c.id)}>
              <span className="grow">{c.count.toString()} × {usd(c.value)}</span>
              <button type="button" className="linkish" onClick={() => { setSendId(c.id); setQty(1); }}>Send</button>
            </li>
          ))}
        </ul>
      )}
      {sending && (
        <div className="stack" style={{ gap: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          <div style={{ fontWeight: 600 }}>Send {usd(sending.value)} cards</div>
          <div className="field">
            <label htmlFor="send-qty">How many</label>
            <input id="send-qty" className="input" type="number" min={1} max={Number(sending.count)} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(Number(sending.count), Number(e.target.value) || 1)))} />
          </div>
          <RecipientField id="send-to" label="To" placeholder="name.hood or 0x…" value={to} onChange={setTo} recipient={recipient} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" disabled={!recipient.address || recipient.address.toLowerCase() === address?.toLowerCase() || tx.state.busy} onClick={send}>Send</button>
            <button type="button" className="btn btn-plain" onClick={() => setSendId(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!loading && !mine.length && <p className="muted" style={{ margin: 0, fontSize: 15 }}>No cards right now. Redeemed cards become points.</p>}
      {mine.length > 0 && !sending && (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>Redeeming turns all your cards into points. Cards can't be sent once redeemed.</p>
          <button type="button" className="btn btn-plain" disabled={tx.state.busy} onClick={redeem}>Redeem all for points</button>
        </>
      )}
      <TxNotice state={tx.state} success={last === 'send' ? 'Sent.' : 'Done. Your points are updated.'} />
    </section>
  );
}

export function RecipientField({
  id,
  label,
  placeholder,
  value,
  onChange,
  recipient,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  recipient: ReturnType<typeof useRecipient>;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input mono" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoCapitalize="off" spellCheck={false} />
      {value.trim() && recipient.loading && <p className="hint">Looking up {recipient.name ?? 'the name'}…</p>}
      {value.trim() && recipient.error && <p className="error-text">{recipient.error}</p>}
      {recipient.name && recipient.address && <p className="hint mono" style={{ overflowWrap: 'anywhere' }}>{recipient.name} → {recipient.address}</p>}
    </div>
  );
}
