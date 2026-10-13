import { useQuery } from '@tanstack/react-query';
import { encodeEventTopics, erc20Abi, type Address, type Hex, zeroAddress } from 'viem';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { controllerAbi, lensAbi, registryAbi, resolverAbi, reverseRegistrarAbi } from '../abi';
import { deployment, modules } from '../config';
import { decode, fetchLogs } from './logs';
import { labelhash } from './names';

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
}

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
        map.set(a.labelhash, { label: a.label, labelhash: a.labelhash, owner: a.owner, block: log.blockNumber });
      }
      return map;
    },
  });
}

export interface OwnedName {
  label: string;
  status: NameStatus;
}

/** Names held by `account`, and expired ones it last registered. */
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
      entries.forEach((r, i) => {
        const s = statuses[i];
        if (s.state === 'Active' && s.holder.toLowerCase() === me) out.push({ label: r.label, status: s });
        else if (s.state === 'Grace' && r.owner.toLowerCase() === me) out.push({ label: r.label, status: s });
      });
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
  return {
    enabled,
    address: token,
    symbol: symbol.data ?? 'USD',
    decimals: decimals.data ?? 6,
    balance: balance.data,
    isTest: symbol.data === 'tUSD',
  };
}

export const refHash = (label: string | undefined): Hex =>
  label ? labelhash(label) : (('0x' + '0'.repeat(64)) as Hex);
