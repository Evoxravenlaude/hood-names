import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { encodeEventTopics, erc20Abi, pad, type Address, type Hex, zeroAddress } from 'viem';
import { useAccount, usePublicClient, useReadContract, useReadContracts } from 'wagmi';
import { baseRegistrarAbi, controllerAbi, guardAbi, lensAbi, pointsLedgerAbi, registryAbi, resolverAbi, reverseRegistrarAbi, testUsdAbi } from '../abi';
import { deployment, modules } from '../config';
import { decode, fetchLogs } from './logs';
import { fullName, labelhash, nodeOf, parseLabel, rememberAddressName } from './names';
import { rememberToken } from './describe';
import { toAddress } from './format';
import { ALPHABETS } from './scripts';
import { t } from '../i18n';

export const STATES = ['Available', 'Active', 'Grace', 'Reserved', 'Invalid', 'Similar'] as const;
export type NameState = (typeof STATES)[number];

export interface NameStatus {
  labelhash: Hex;
  node: Hex;
  state: NameState;
  expires: bigint;
  holder: Address;
  wrapped: boolean;
  manager: Address;
  heldSince: bigint;
  resolver: Address;
  resolverAllowed: boolean;
  customResolver: boolean;
  resolvedAddress: Address;
}

const toStatus = (raw: {
  labelhash: Hex;
  node: Hex;
  state: number;
  expires: bigint;
  holder: Address;
  wrapped: boolean;
  manager: Address;
  heldSince: bigint;
  resolver: Address;
  resolverAllowed: boolean;
  customResolver: boolean;
  resolvedAddress: Address;
}): NameStatus => ({ ...raw, state: STATES[raw.state] ?? 'Invalid' });

/** Everything about one name, in one read of the lens contract. */
export function useNameStatus(label: string | undefined) {
  const q = useReadContract({
    address: deployment?.HoodNameLens,
    abi: lensAbi,
    functionName: 'status',
    args: label ? [label] : undefined,
    query: { enabled: !!deployment && !!label, refetchInterval: 15_000 },
  });
  return { ...q, data: q.data ? toStatus(q.data) : undefined };
}

export function useControllerInfo() {
  const common = { address: deployment?.HoodRegistrarController, abi: controllerAbi, query: { enabled: !!deployment } } as const;
  const paused = useReadContract({ ...common, functionName: 'paused', query: { enabled: !!deployment, refetchInterval: 30_000 } });
  const minAge = useReadContract({ ...common, functionName: 'minCommitmentAge' });
  const maxAge = useReadContract({ ...common, functionName: 'maxCommitmentAge' });
  return { paused: paused.data, minAge: minAge.data, maxAge: maxAge.data };
}

export interface Registered {
  label: string;
  labelhash: Hex;
  owner: Address;
  block: bigint;
  tx: Hex;
  /** Seconds, when the log source gives it. */
  timestamp?: number;
}

/** Every registration seen, by transaction: lets activity say which name a payment was for. */
const registrationsByTx = new Map<string, string>();

/** Every label ever registered, from the controller's NameRegistered events. */
export function useRegisteredLabels() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['registered', deployment?.HoodRegistrarController],
    enabled: !!deployment && !!client,
    staleTime: 20_000,
    queryFn: async () => {
      const topic = encodeEventTopics({ abi: controllerAbi, eventName: 'NameRegistered' })[0];
      const logs = await fetchLogs(client!, deployment!.HoodRegistrarController, [topic], BigInt(deployment!.deployBlock));
      const map = new Map<Hex, Registered>();
      for (const log of logs) {
        const ev = decode(controllerAbi, log);
        if (!ev || ev.eventName !== 'NameRegistered') continue;
        const a = ev.args as { label: string; labelhash: Hex; owner: Address };
        registrationsByTx.set(log.transactionHash.toLowerCase(), a.label);
        map.set(a.labelhash, { label: a.label, labelhash: a.labelhash, owner: a.owner, block: log.blockNumber, tx: log.transactionHash, timestamp: log.timestamp });
      }
      return map;
    },
  });
}

export interface OwnedName {
  label: string;
  status: NameStatus;
}

/** Names held by `account`, including expired ones it held when they expired. */
export function useOwnedNames(account: Address | undefined) {
  const client = usePublicClient();
  const registered = useRegisteredLabels();
  return useQuery({
    queryKey: ['owned', account, registered.data?.size],
    enabled: !!account && !!registered.data && !!client,
    queryFn: async () => {
      const entries = [...registered.data!.values()];
      const statuses = await Promise.all(
        entries.map((r) =>
          client!
            .readContract({ address: deployment!.HoodNameLens, abi: lensAbi, functionName: 'status', args: [r.label] })
            .then(toStatus),
        ),
      );
      const me = account!.toLowerCase();
      const out: OwnedName[] = [];
      const lapsed: { label: string; status: NameStatus; registrant: Address }[] = [];
      entries.forEach((r, i) => {
        const s = statuses[i];
        if (s.state === 'Active' && s.holder.toLowerCase() === me) out.push({ label: r.label, status: s });
        else if (s.state === 'Grace') lapsed.push({ label: r.label, status: s, registrant: r.owner });
      });
      // An expired name's holder can't be read from the registrar any more,
      // so it is taken from the last transfer of its token.
      const transfer = encodeEventTopics({ abi: baseRegistrarAbi, eventName: 'Transfer' })[0];
      const skip = new Set([deployment!.HoodRegistrarController, deployment!.NameWrapper, zeroAddress].map((a) => a.toLowerCase()));
      await Promise.all(
        lapsed.map(async (n) => {
          let holder = n.registrant.toLowerCase();
          try {
            const logs = await fetchLogs(client!, deployment!.BaseRegistrar, [transfer, null, null, n.status.labelhash], BigInt(deployment!.deployBlock));
            const last = logs[logs.length - 1];
            const to = last ? ('0x' + last.topics[2].slice(26)).toLowerCase() : undefined;
            if (to && !skip.has(to)) holder = to;
          } catch {
            // keep the registrant
          }
          if (holder === me) out.push({ label: n.label, status: n.status });
        }),
      );
      return out.sort((a, b) => Number(a.status.expires - b.status.expires));
    },
  });
}

/** The verified primary name of an address: its reverse record, if the name points back. */
export function usePrimaryName(address: Address | undefined) {
  const client = usePublicClient();
  return useQuery({
    queryKey: ['primary', address],
    enabled: !!address && !!deployment && !!client,
    queryFn: async () => {
      const node = await client!.readContract({
        address: deployment!.ReverseRegistrar,
        abi: reverseRegistrarAbi,
        functionName: 'node',
        args: [address!],
      });
      const resolver = await client!.readContract({
        address: deployment!.ENSRegistry,
        abi: registryAbi,
        functionName: 'resolver',
        args: [node],
      });
      if (resolver === zeroAddress) return null;
      const name = await client!.readContract({ address: resolver, abi: resolverAbi, functionName: 'name', args: [node] });
      if (!name) return null;
      const label = name.split('.')[0];
      const s = toStatus(
        await client!.readContract({ address: deployment!.HoodNameLens, abi: lensAbi, functionName: 'status', args: [label] }),
      );
      return s.state === 'Active' && s.resolvedAddress.toLowerCase() === address!.toLowerCase() ? name : null;
    },
  });
}

/** The stablecoin the controller accepts, with the connected account's balance. */
export function useStablecoin() {
  const { address } = useAccount();
  const token = deployment?.Stablecoin;
  const enabled = modules.stablecoin;
  const symbol = useReadContract({ address: token, abi: erc20Abi, functionName: 'symbol', query: { enabled } });
  const decimals = useReadContract({ address: token, abi: erc20Abi, functionName: 'decimals', query: { enabled } });
  const balance = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: enabled && !!address },
  });
  const nextClaim = useReadContract({
    address: token,
    abi: testUsdAbi,
    functionName: 'nextClaimAt',
    args: address ? [address] : undefined,
    query: { enabled: enabled && symbol.data === 'tUSD' && !!address },
  });
  useEffect(() => {
    if (token && symbol.data && decimals.data !== undefined) rememberToken(token, symbol.data, decimals.data);
  }, [token, symbol.data, decimals.data]);
  return {
    enabled,
    address: token,
    nextClaimAt: nextClaim.data,
    symbol: symbol.data ?? 'USD',
    decimals: decimals.data ?? 6,
    balance: balance.data,
    isTest: symbol.data === 'tUSD',
  };
}

export const refHash = (label: string | undefined): Hex =>
  label ? labelhash(label) : (('0x' + '0'.repeat(64)) as Hex);

export interface Recipient {
  /** The address that would receive, once known. */
  address?: Address;
  /** Set when the input was a name. */
  name?: string;
  /** Why the input does not lead to an address. */
  error?: string;
  loading: boolean;
}

/** A recipient typed as an address or as a name; names resolve to the address they point to. */
export function useRecipient(input: string): Recipient {
  const text = input.trim();
  const direct = toAddress(text);
  const parsed = text && !direct ? parseLabel(text) : undefined;
  const label = parsed?.ok ? parsed.label : undefined;
  const status = useNameStatus(label);
  if (!text) return { loading: false };
  if (direct) return { address: direct, loading: false };
  if (parsed && !parsed.ok) return { error: parsed.reason, loading: false };
  if (!status.data) return { loading: true, name: label && fullName(label) };
  const s = status.data;
  const name = fullName(label!);
  if (s.state !== 'Active') return { name, error: t('{name} is not a registered name.', { name }), loading: false };
  if (s.resolvedAddress === zeroAddress)
    return {
      name,
      error: s.customResolver ? t('{name} does not point to a wallet this page can read.', { name }) : t('{name} does not point to a wallet.', { name }),
      loading: false,
    };
  rememberAddressName(s.resolvedAddress, name);
  return { address: s.resolvedAddress, name, loading: false };
}

/** The avatar record of a name, if it has one. */
export function useAvatar(label: string | undefined | null) {
  const status = useNameStatus(label ?? undefined);
  const s = status.data;
  const usable = !!s && s.state === 'Active' && s.resolverAllowed && s.resolver !== zeroAddress;
  return useReadContract({
    address: usable ? s!.resolver : undefined,
    abi: resolverAbi,
    functionName: 'text',
    args: label && usable ? [nodeOf(label), 'avatar'] : undefined,
    query: { enabled: usable && !!label },
  });
}

export interface Activity {
  kind: 'credit' | 'spend';
  amount: bigint;
  what: string;
  tx: Hex;
  block: bigint;
  timestamp?: number;
}

/** Gift-card points coming in and going out for an account, newest first. */
export function usePointsActivity(account: Address | undefined) {
  const client = usePublicClient();
  const registered = useRegisteredLabels();
  return useQuery({
    queryKey: ['points-activity', account, registered.data?.size],
    enabled: !!account && modules.points && !!client && !!deployment,
    queryFn: async () => {
      const [credited, spent] = ['PointsCredited', 'PointsSpent'].map(
        (eventName) => encodeEventTopics({ abi: pointsLedgerAbi, eventName: eventName as 'PointsCredited' })[0],
      );
      const who = pad(account!, { size: 32 }).toLowerCase() as Hex;
      const from = BigInt(deployment!.deployBlock);
      const [ins, outs, renewals] = await Promise.all([
        fetchLogs(client!, deployment!.HoodPointsLedger, [credited, who], from),
        fetchLogs(client!, deployment!.HoodPointsLedger, [spent, who], from),
        fetchLogs(client!, deployment!.HoodRegistrarController, [encodeEventTopics({ abi: controllerAbi, eventName: 'NameRenewed' })[0]], from),
      ]);
      const byTx = new Map<string, string>();
      for (const [tx, label] of registrationsByTx) byTx.set(tx, t('Registered {name}', { name: fullName(label) }));
      for (const l of renewals) {
        const ev = decode(controllerAbi, l);
        if (ev?.eventName === 'NameRenewed') byTx.set(l.transactionHash.toLowerCase(), t('Renewed {name}', { name: fullName((ev.args as { label: string }).label) }));
      }
      const rows: Activity[] = [];
      for (const l of ins) {
        const ev = decode(pointsLedgerAbi, l);
        if (ev) rows.push({ kind: 'credit', amount: (ev.args as { amount: bigint }).amount, what: t('Gift cards redeemed'), tx: l.transactionHash, block: l.blockNumber, timestamp: l.timestamp });
      }
      for (const l of outs) {
        const ev = decode(pointsLedgerAbi, l);
        if (ev)
          rows.push({
            kind: 'spend',
            amount: (ev.args as { amount: bigint }).amount,
            what: byTx.get(l.transactionHash.toLowerCase()) ?? t('Spent on a name'),
            tx: l.transactionHash,
            block: l.blockNumber,
            timestamp: l.timestamp,
          });
      }
      return rows.sort((a, b) => Number(b.block - a.block));
    },
  });
}

/** Seconds until a moment, ticking once a second. */
export function useCountdown(until: bigint | number | undefined) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return 0;
  return Math.max(0, Number(until) - now);
}

/**
 * Which alphabets this deployment accepts, asked of its name rules (through
 * the guard) with each alphabet's example name. Alphabets added after a
 * deployment went live show up here as soon as they are applied.
 */
export function useAlphabets() {
  const q = useReadContracts({
    contracts: ALPHABETS.map((a) => ({ address: deployment?.HoodNameGuard, abi: guardAbi, functionName: 'valid', args: [a.example] }) as const),
    query: { enabled: !!deployment, staleTime: 300_000 },
  });
  return ALPHABETS.map((a, i) => ({ ...a, live: q.data ? q.data[i]?.result === true : undefined }));
}
