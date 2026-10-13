import { decodeEventLog, type Abi, type Address, type Hex, type PublicClient } from 'viem';
import { explorerUrl } from '../config';

export interface RawLog {
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
  /** Seconds, when the source provides it (the explorer does, the RPC does not). */
  timestamp?: number;
}

const EXPLORER_PAGE = 1000;
const EXPLORER_MAX_PAGES = 50;
const RPC_MAX_REQUESTS = 2000;

/**
 * Event logs for one contract since `fromBlock`, oldest first. Tries the
 * block explorer's log API first, then falls back to the RPC in chunks,
 * since public RPCs limit how many blocks one request may cover. Throws
 * rather than return a partial list.
 */
export async function fetchLogs(
  client: PublicClient,
  address: Address,
  topics: (Hex | null)[],
  fromBlock: bigint,
): Promise<RawLog[]> {
  if (explorerUrl) {
    try {
      return await fromExplorer(address, topics, fromBlock);
    } catch {
      // fall through to the RPC
    }
  }
  return fromRpc(client, address, topics, fromBlock);
}

const key = (l: RawLog) => `${l.transactionHash}:${l.logIndex}`;

async function fromExplorer(address: Address, topics: (Hex | null)[], fromBlock: bigint): Promise<RawLog[]> {
  const seen = new Map<string, RawLog>();
  let from = fromBlock;
  for (let page = 0; page < EXPLORER_MAX_PAGES; page++) {
    const params = new URLSearchParams({ module: 'logs', action: 'getLogs', address, fromBlock: from.toString(), toBlock: 'latest' });
    topics.forEach((t, i) => {
      if (!t) return;
      params.set(`topic${i}`, t);
      if (i > 0) params.set(`topic0_${i}_opr`, 'and');
    });
    const res = await fetch(`${explorerUrl}/api?${params}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error('explorer unavailable');
    const body = (await res.json()) as {
      status: string;
      message: string;
      result: { topics: (Hex | null)[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex; timeStamp?: Hex }[] | null;
    };
    if (body.status !== '1') {
      if (/no (records|logs) found/i.test(body.message)) return sorted(seen);
      throw new Error(body.message);
    }
    const rows = body.result ?? [];
    for (const r of rows) {
      const log: RawLog = {
        topics: r.topics.filter((t): t is Hex => !!t),
        data: r.data,
        blockNumber: BigInt(r.blockNumber),
        transactionHash: r.transactionHash,
        logIndex: Number(BigInt(r.logIndex ?? '0x0')),
        timestamp: r.timeStamp ? Number(BigInt(r.timeStamp)) : undefined,
      };
      seen.set(key(log), log);
    }
    if (rows.length < EXPLORER_PAGE) return sorted(seen);
    // A full page may end part-way through a block: ask again from that
    // block, and drop what was already seen.
    const last = BigInt(rows[rows.length - 1].blockNumber);
    if (last === from) throw new Error('more than one page of logs in a single block');
    from = last;
  }
  // Only reached when every page was full.
  throw new Error('too many logs for the explorer API');
}

async function fromRpc(client: PublicClient, address: Address, topics: (Hex | null)[], fromBlock: bigint): Promise<RawLog[]> {
  const latest = await client.getBlockNumber();
  const seen = new Map<string, RawLog>();
  const MAX = 100_000n;
  let size = MAX;
  let from = fromBlock;
  let failures = 0;
  for (let requests = 0; from <= latest; requests++) {
    if (requests >= RPC_MAX_REQUESTS) throw new Error('Too many blocks to scan through the RPC.');
    const to = from + size - 1n > latest ? latest : from + size - 1n;
    try {
      const logs = (await client.request({
        method: 'eth_getLogs',
        params: [{ address, topics, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}` }],
      })) as { topics: Hex[]; data: Hex; blockNumber: Hex; transactionHash: Hex; logIndex: Hex }[];
      for (const l of logs) {
        const log: RawLog = {
          topics: l.topics,
          data: l.data,
          blockNumber: BigInt(l.blockNumber),
          transactionHash: l.transactionHash,
          logIndex: Number(BigInt(l.logIndex)),
        };
        seen.set(key(log), log);
      }
      from = to + 1n;
      failures = 0;
      if (size < MAX) size *= 2n; // grow back after a narrow window worked
    } catch (e) {
      failures++;
      const message = e instanceof Error ? e.message : String(e);
      if (/range|too many|limit|exceed|10000|block range/i.test(message) && size > 1_000n) {
        size /= 4n;
      } else if (failures <= 3) {
        await new Promise((r) => setTimeout(r, 500 * failures)); // rate limit or hiccup: retry
      } else {
        throw e;
      }
    }
  }
  return sorted(seen);
}

const sorted = (m: Map<string, RawLog>) =>
  [...m.values()].sort((a, b) => (a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1));

export function decode<TAbi extends Abi>(abi: TAbi, log: RawLog) {
  try {
    return decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
  } catch {
    return null;
  }
}
