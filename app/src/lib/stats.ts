import { useQuery } from '@tanstack/react-query';
import { encodeEventTopics, zeroAddress, type Abi, type Address, type Hex, type PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { baseRegistrarAbi, controllerAbi, giftCardAbi, guardAbi, resolverAbi, reverseRegistrarAbi } from '../abi';
import { deployment, GRACE_PERIOD, modules } from '../config';
import { decode, fetchLogs, type RawLog } from './logs';
import { labelhash, nodeOf } from './names';
import { scriptOf, type Script } from './scripts';

/*
 * Figures about the whole name service, worked out in the browser from the
 * contracts' public event logs. Nothing here needs a server or an indexer:
 * anyone can check every number against the explorer.
 */

export type ActionKind = 'register' | 'renew' | 'records' | 'primary' | 'giftcard' | 'transfer';

export interface Action {
  kind: ActionKind;
  /** Seconds since 1970. */
  time: number;
}

export interface NameRow {
  label: string;
  owner: Address;
  registeredAt: number;
  expires: number;
  renewals: number;
  script: Script;
  length: number;
}

export interface Stats {
  now: number;
  names: NameRow[];
  actions: Action[];
  /** Live names whose address record points at a wallet. */
  pointing: number;
  withPicture: number;
  primaryWallets: number;
  transfers: number;
  reserved: number;
  payments: { eth: number; dollars: number; points: number; referred: number; total: number };
  giftCards: { boughtUsd: number; redeemedUsd: number; bought: number };
}

const topic = (abi: Abi, eventName: string) => encodeEventTopics({ abi, eventName } as never)[0] as Hex;
const usdNumber = (v: bigint) => Number(v / 10n ** 14n) / 10_000;

/** Fills in times for logs the source gave without one (the RPC fallback). */
async function withTimes(client: PublicClient, logs: RawLog[]): Promise<RawLog[]> {
  const missing = [...new Set(logs.filter((l) => l.timestamp === undefined).map((l) => l.blockNumber))].sort((a, b) => (a < b ? -1 : 1));
  if (!missing.length) return logs;
  // Read up to 120 blocks exactly and place the rest between their neighbours.
  const step = Math.max(1, Math.ceil(missing.length / 120));
  const sample = missing.filter((_, i) => i % step === 0 || i === missing.length - 1);
  const known = new Map<bigint, number>();
  await Promise.all(
    sample.map(async (b) => {
      const block = await client.getBlock({ blockNumber: b }).catch(() => null);
      if (block) known.set(b, Number(block.timestamp));
    }),
  );
  const points = [...known.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const at = (b: bigint) => {
    if (known.has(b)) return known.get(b)!;
    let lo = points[0];
    let hi = points[points.length - 1];
    for (const p of points) {
      if (p[0] <= b) lo = p;
      if (p[0] >= b) {
        hi = p;
        break;
      }
    }
    if (!lo || !hi || lo[0] === hi[0]) return (lo ?? hi)?.[1] ?? 0;
    return lo[1] + ((hi[1] - lo[1]) * Number(b - lo[0])) / Number(hi[0] - lo[0]);
  };
  return logs.map((l) => (l.timestamp === undefined ? { ...l, timestamp: Math.round(at(l.blockNumber)) } : l));
}

const order = (a: RawLog, b: RawLog) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1);

export function useStats() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['stats', deployment?.HoodRegistrarController],
    enabled: !!deployment && !!client,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<Stats> => {
      const d = deployment!;
      const from = BigInt(d.deployBlock);
      const get = (address: Address, abi: Abi, eventName: string) =>
        fetchLogs(client!, address, [topic(abi, eventName)], from).then((l) => withTimes(client!, l));
      const none = Promise.resolve([] as RawLog[]);
      const [registered, renewed, settled, addrs, texts, reverse, transfers, reserved, bought, redeemed] = await Promise.all([
        get(d.HoodRegistrarController, controllerAbi, 'NameRegistered'),
        get(d.HoodRegistrarController, controllerAbi, 'NameRenewed'),
        get(d.HoodRegistrarController, controllerAbi, 'PaymentSettled'),
        get(d.PublicResolver, resolverAbi, 'AddrChanged'),
        get(d.PublicResolver, resolverAbi, 'TextChanged'),
        get(d.ReverseRegistrar, reverseRegistrarAbi, 'ReverseClaimed'),
        get(d.BaseRegistrar, baseRegistrarAbi, 'Transfer'),
        get(d.HoodNameGuard, guardAbi, 'ReservedChanged'),
        modules.giftCards ? get(d.HoodGiftCard, giftCardAbi, 'CardsPurchased') : none,
        modules.giftCards ? get(d.HoodGiftCard, giftCardAbi, 'CardsRedeemed') : none,
      ]);
      const now = Math.floor(Date.now() / 1000);
      const actions: Action[] = [];
      const push = (kind: ActionKind, logs: RawLog[]) => logs.forEach((l) => l.timestamp && actions.push({ kind, time: l.timestamp }));

      // Names: the latest registration of each label, and its renewals since.
      const names = new Map<string, NameRow>();
      for (const l of registered) {
        const ev = decode(controllerAbi, l);
        if (ev?.eventName !== 'NameRegistered') continue;
        const a = ev.args as { label: string; owner: Address; expires: bigint };
        names.set(a.label, {
          label: a.label,
          owner: a.owner,
          registeredAt: l.timestamp ?? 0,
          expires: Number(a.expires),
          renewals: 0,
          script: scriptOf(a.label),
          length: [...a.label].length,
        });
      }
      for (const l of renewed) {
        const ev = decode(controllerAbi, l);
        if (ev?.eventName !== 'NameRenewed') continue;
        const a = ev.args as { label: string; expires: bigint };
        const n = names.get(a.label);
        if (n) {
          n.expires = Number(a.expires);
          n.renewals++;
        }
      }
      push('register', registered);
      push('renew', renewed);

      // Who holds each name now: the last transfer of its token. Mints come
      // from the zero address; the wrapper holding a name is left as is.
      const byHash = new Map<string, NameRow>();
      for (const n of names.values()) byHash.set(BigInt(nodeOfLabelhash(n.label)).toString(), n);
      const lastTransfer = new Map<string, RawLog>();
      let changedHands = 0;
      for (const l of transfers) {
        const fromAddr = ('0x' + l.topics[1].slice(26)).toLowerCase();
        const to = ('0x' + l.topics[2].slice(26)) as Address;
        const id = BigInt(l.topics[3]).toString();
        const row = byHash.get(id);
        if (row) row.owner = to;
        // The registrar mints a new name to itself, sets its records, then
        // hands it to the buyer: that handover is not a change of hands.
        if (fromAddr !== zeroAddress && fromAddr !== d.HoodRegistrarController.toLowerCase()) {
          lastTransfer.set(id, l);
          changedHands++;
          if (l.timestamp) actions.push({ kind: 'transfer', time: l.timestamp });
        }
      }

      // Names that point to a wallet: an address set after the name last
      // changed hands (records belong to the holder and reset on a sale),
      // and not cleared since.
      const nodeToLabel = new Map<string, NameRow>();
      for (const n of names.values()) nodeToLabel.set(nodeOf(n.label).toLowerCase(), n);
      const latestAddr = new Map<string, { log: RawLog; set: boolean }>();
      for (const l of addrs) {
        const ev = decode(resolverAbi, l);
        if (ev?.eventName !== 'AddrChanged') continue;
        const node = (ev.args as { node: Hex }).node.toLowerCase();
        latestAddr.set(node, { log: l, set: (ev.args as { a: Address }).a !== zeroAddress });
      }
      const pictures = new Set<string>();
      for (const l of texts) {
        const ev = decode(resolverAbi, l);
        if (ev?.eventName !== 'TextChanged') continue;
        const a = ev.args as { node: Hex; key: string };
        if (a.key === 'avatar') pictures.add(a.node.toLowerCase());
      }
      const recordTimes = new Set<string>();
      for (const l of [...addrs, ...texts]) {
        // One edit can set several records; count it once.
        if (l.timestamp && !recordTimes.has(l.transactionHash)) {
          recordTimes.add(l.transactionHash);
          actions.push({ kind: 'records', time: l.timestamp });
        }
      }
      const live = (n: NameRow) => n.expires > now;
      let pointing = 0;
      let withPicture = 0;
      for (const [node, n] of nodeToLabel) {
        if (!live(n)) continue;
        const a = latestAddr.get(node);
        const moved = lastTransfer.get(BigInt(nodeOfLabelhash(n.label)).toString());
        const fresh = (log: RawLog) => !moved || order(log, moved) > 0;
        if (a?.set && fresh(a.log)) pointing++;
        if (pictures.has(node)) withPicture++;
      }

      const primary = new Set(reverse.map((l) => l.topics[1].toLowerCase()));
      push('primary', reverse);

      // How names were paid for.
      const payments = { eth: 0, dollars: 0, points: 0, referred: 0, total: 0 };
      for (const l of settled) {
        const ev = decode(controllerAbi, l);
        if (ev?.eventName !== 'PaymentSettled') continue;
        const a = ev.args as { token: Address; amountPaid: bigint; pointsUsed: bigint; referrerPayee: Address };
        payments.total++;
        if (a.amountPaid === 0n && a.pointsUsed > 0n) payments.points++;
        else if (a.token === zeroAddress) payments.eth++;
        else payments.dollars++;
        if (a.referrerPayee !== zeroAddress) payments.referred++;
      }

      // Reserved names: count of labels currently on the list.
      const reservedNow = new Map<string, boolean>();
      for (const l of reserved) {
        const ev = decode(guardAbi, l);
        if (ev?.eventName !== 'ReservedChanged') continue;
        const a = ev.args as { label: string; reserved: boolean };
        reservedNow.set(a.label, a.reserved);
      }

      const giftCards = { boughtUsd: 0, redeemedUsd: 0, bought: 0 };
      for (const l of bought) {
        const ev = decode(giftCardAbi, l);
        if (ev?.eventName !== 'CardsPurchased') continue;
        giftCards.boughtUsd += usdNumber((ev.args as { usdValue: bigint }).usdValue);
        giftCards.bought++;
      }
      for (const l of redeemed) {
        const ev = decode(giftCardAbi, l);
        if (ev?.eventName !== 'CardsRedeemed') continue;
        giftCards.redeemedUsd += usdNumber((ev.args as { usdValue: bigint }).usdValue);
      }
      push('giftcard', [...bought, ...redeemed]);

      return {
        now,
        names: [...names.values()],
        actions,
        pointing,
        withPicture,
        primaryWallets: primary.size,
        transfers: changedHands,
        reserved: [...reservedNow.values()].filter(Boolean).length,
        payments,
        giftCards,
      };
    },
  });
}

/** The registrar token id of a label is its labelhash. */
const nodeOfLabelhash = (label: string) => labelhash(label);

/* ---- Derived figures, kept apart from fetching so they are easy to test ---- */

export const GRACE = Number(GRACE_PERIOD);
const DAY = 86_400;

export const isLive = (n: NameRow, now: number) => n.expires > now;
export const inGrace = (n: NameRow, now: number) => n.expires <= now && n.expires + GRACE > now;

/** Of the names whose first term has ended, the share their holder renewed. */
export function renewalRate(names: NameRow[], now: number) {
  // A name counts once it was due: its first expiry has passed, or it was
  // renewed already (renewing early answers the question too).
  const due = names.filter((n) => n.renewals > 0 || n.expires <= now);
  const kept = due.filter((n) => n.renewals > 0);
  const firstDue = names.filter((n) => n.renewals === 0 && n.expires > now).reduce((m, n) => Math.min(m, n.expires), Infinity);
  return { due: due.length, kept: kept.length, firstDue: Number.isFinite(firstDue) ? firstDue : undefined };
}

/** Names coming free soon: in their grace period now, or expiring within `days`. */
export function comingBack(names: NameRow[], now: number, days = 60) {
  return names
    .filter((n) => n.expires + GRACE > now && n.expires < now + days * DAY)
    .map((n) => ({ ...n, freeFrom: n.expires + GRACE, expired: n.expires <= now }))
    .sort((a, b) => a.freeFrom - b.freeFrom);
}

/** How names are spread across wallets. */
export function holderSpread(names: NameRow[], now: number) {
  const counts = new Map<string, number>();
  for (const n of names) if (isLive(n, now)) counts.set(n.owner.toLowerCase(), (counts.get(n.owner.toLowerCase()) ?? 0) + 1);
  const sizes = [...counts.values()].sort((a, b) => b - a);
  const total = sizes.reduce((s, x) => s + x, 0);
  const top = sizes.slice(0, 10).reduce((s, x) => s + x, 0);
  return {
    wallets: sizes.length,
    total,
    one: sizes.filter((x) => x === 1).length,
    few: sizes.filter((x) => x >= 2 && x <= 5).length,
    many: sizes.filter((x) => x >= 6).length,
    topTenShare: total ? top / total : 0,
    largest: sizes[0] ?? 0,
  };
}

/** Actions by weekday (0 = Monday) and hour, in the viewer's own time zone. */
export function weekHours(actions: Action[], since: number) {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const a of actions) {
    if (a.time < since) continue;
    const d = new Date(a.time * 1000);
    grid[(d.getDay() + 6) % 7][d.getHours()]++;
  }
  return grid;
}

/** Actions per day for the last `days` days, oldest first, in the viewer's time zone. */
export function perDay(actions: Action[], now: number, days: number, kinds?: ActionKind[]) {
  const end = new Date(now * 1000);
  end.setHours(0, 0, 0, 0);
  const start = end.getTime() / 1000 - (days - 1) * DAY;
  const out = Array.from({ length: days }, (_, i) => ({ day: start + i * DAY, count: 0 }));
  for (const a of actions) {
    if (kinds && !kinds.includes(a.kind)) continue;
    const i = Math.floor((a.time - start) / DAY);
    if (i >= 0 && i < days) out[i].count++;
  }
  return out;
}
