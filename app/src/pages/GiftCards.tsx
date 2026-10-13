import { useState } from 'react';
import { Link } from 'react-router-dom';
import { erc20Abi } from 'viem';
import { useAccount, useConfig, useReadContract } from 'wagmi';
import { readContract } from 'wagmi/actions';
import { giftCardAbi } from '../abi';
import { deployment, modules } from '../config';
import { TxNotice } from '../components/Bits';
import { ConnectPrompt } from '../components/Wallet';
import { usd } from '../lib/format';
import { useStablecoin } from '../lib/hooks';
import { useTx } from '../lib/tx';

const IDS = [1n, 2n, 3n];

export function GiftCards() {
  const config = useConfig();
  const { address } = useAccount();
  const coin = useStablecoin();
  const buyTx = useTx();
  const redeemTx = useTx();
  const [card, setCard] = useState(0);
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState('');
  const [pay, setPay] = useState<'eth' | 'token'>(coin.enabled ? 'token' : 'eth');

  const faceOf = { address: deployment?.HoodGiftCard, abi: giftCardAbi, functionName: 'faceValue', query: { enabled: modules.giftCards } } as const;
  const face = [
    useReadContract({ ...faceOf, args: [1n] }),
    useReadContract({ ...faceOf, args: [2n] }),
    useReadContract({ ...faceOf, args: [3n] }),
  ];
  const held = useReadContract({
    address: deployment?.HoodGiftCard,
    abi: giftCardAbi,
    functionName: 'balanceOfBatch',
    args: address ? [IDS.map(() => address), IDS] : undefined,
    query: { enabled: modules.giftCards && !!address },
  });

  if (!modules.giftCards)
    return (
      <div className="page narrow">
        <p className="muted">Gift cards are not switched on for this deployment.</p>
        <Link to="/">Back to search</Link>
      </div>
    );

  const defined = IDS.map((id, i) => ({ id, value: face[i].data ?? 0n })).filter((c) => c.value > 0n);
  const chosen = defined[card];
  const recipient = /^0x[0-9a-fA-F]{40}$/.test(to.trim()) ? (to.trim() as `0x${string}`) : address;
  const heldTotal = (held.data ?? []).reduce((sum, n, i) => sum + n * (face[i].data ?? 0n), 0n);

  const buy = async () => {
    if (!chosen || !recipient || !deployment) return;
    const ids = [chosen.id];
    const amounts = [BigInt(qty)];
    const steps: Parameters<typeof buyTx.run>[0] = [];
    if (pay === 'token' && coin.address) {
      const due = await readContract(config, { address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'priceInToken', args: [coin.address, ids, amounts] });
      const allowance = await readContract(config, { address: coin.address, abi: erc20Abi, functionName: 'allowance', args: [address!, deployment!.HoodGiftCard] });
      if (allowance < due)
        steps.push({ label: `Allowing ${coin.symbol} payment`, args: () => ({ address: coin.address!, abi: erc20Abi, functionName: 'approve', args: [deployment!.HoodGiftCard, due] }) });
      steps.push({ label: 'Buying', args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'buyWithToken', args: [coin.address!, due, recipient, ids, amounts] }) });
    } else {
      const due = await readContract(config, { address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'priceInETH', args: [ids, amounts] });
      steps.push({ label: 'Buying', args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'buy', args: [recipient, ids, amounts], value: due + due / 100n }) });
    }
    await buyTx.run(steps);
  };

  const redeem = () => {
    const ids: bigint[] = [];
    const amounts: bigint[] = [];
    (held.data ?? []).forEach((n, i) => {
      if (n > 0n) {
        ids.push(IDS[i]);
        amounts.push(n);
      }
    });
    if (!ids.length) return;
    redeemTx.run([{ label: 'Redeeming', args: () => ({ address: deployment!.HoodGiftCard, abi: giftCardAbi, functionName: 'redeem', args: [ids, amounts] }) }]);
  };

  return (
    <div className="page stack" style={{ gap: 28 }}>
      <h1 className="title">Gift cards</h1>
      <p className="muted" style={{ margin: 0, fontSize: 18, maxWidth: 640 }}>
        A gift card holds a fixed dollar amount. Give it to anyone; they redeem it for points and spend the points on a name.
      </p>
      {!address ? (
        <ConnectPrompt what="buy or redeem gift cards" />
      ) : (
        <div className="row">
          <section className="main-col card card-pad" style={{ gap: 18 }}>
            <h2>Buy</h2>
            <div className="choice-grid" role="group" aria-label="Card">
              {defined.map((c, i) => (
                <button key={String(c.id)} type="button" className="choice" aria-pressed={card === i} onClick={() => setCard(i)}>{usd(c.value)}</button>
              ))}
            </div>
            {!defined.length && <p className="hint">No card values have been set up yet.</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div className="field">
                <label htmlFor="qty">How many</label>
                <input id="qty" className="input" type="number" min={1} max={100} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
              </div>
              <div className="field">
                <label htmlFor="gift-to">Send to <span className="faint" style={{ fontWeight: 400 }}>(blank = you)</span></label>
                <input id="gift-to" className="input mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" />
              </div>
            </div>
            <div className="choice-grid" role="group" aria-label="Payment">
              {coin.enabled && <button type="button" className="choice" aria-pressed={pay === 'token'} onClick={() => setPay('token')}>{coin.symbol}</button>}
              <button type="button" className="choice" aria-pressed={pay === 'eth'} onClick={() => setPay('eth')}>ETH</button>
            </div>
            <div className="total"><span style={{ fontWeight: 600 }}>Total</span><span className="price">{chosen ? usd(chosen.value * BigInt(qty)) : '…'}</span></div>
            <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={!chosen || buyTx.state.busy || (!!to.trim() && recipient === address)} onClick={buy}>
              Buy gift card{qty > 1 ? 's' : ''}
            </button>
            <TxNotice state={buyTx.state} success="Bought." />
          </section>
          <aside className="side-col">
            <section className="card card-pad stack" style={{ gap: 10 }}>
              <div className="eyebrow" style={{ color: 'var(--faint)' }}>Cards you hold</div>
              <div className="figure">{usd(heldTotal)}</div>
              <p className="muted" style={{ margin: 0, fontSize: 15 }}>Redeeming turns them into points in your account.</p>
              <button type="button" className="btn btn-plain" disabled={heldTotal === 0n || redeemTx.state.busy} onClick={redeem}>Redeem all</button>
              <TxNotice state={redeemTx.state} success="Added as points." />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
