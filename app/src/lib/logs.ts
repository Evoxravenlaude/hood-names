import { decodeEventLog, type Abi, type Address, type Hex, type PublicClient } from 'viem';
import { explorerUrl } from '../config';

export interface RawLog {
  topics: Hex[];
  data: Hex;
  blockNumber: bigint;
}

/**
 * Event logs for one contract since `fromBlock`. Tries the block explorer's
 * log API first (one request), then falls back to the RPC in chunks, since
 * public RPCs limit how many blocks one request may cover.
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

async function fromExplorer(address: Address, topics: (Hex | null)[], fromBlock: bigint): Promise<RawLog[]> {
  const out: RawLog[] = [];
  let from = fromBlock;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      module: 'logs',
      action: 'getLogs',
      address,
      fromBlock: from.toString(),
      toBlock: 'latest',
    });
    topics.forEach((t, i) => {
      if (t) params.set(`topic${i}`, t);
    });
    if (topics.filter(Boolean).length > 1) params.set('topic0_1_opr', 'and');
    const res = await fetch(`${explorerUrl}/api?${params}`);
    if (!res.ok) throw new Error('explorer unavailable');
    const body = (await res.json()) as {
      status: string;
      message: string;
      result: { topics: (Hex | null)[]; data: Hex; blockNumber: Hex }[] | null;
    };
    if (body.status !== '1') {
      if (/no (records|logs) found/i.test(body.message)) return out;
      throw new Error(body.message);
    }
    const rows = body.result ?? [];
    for (const r of rows)
      out.push({ topics: r.topics.filter((t): t is Hex => !!t), data: r.data, blockNumber: BigInt(r.blockNumber) });
    // The explorer returns at most 1,000 logs a request.
    if (rows.length < 1000) return out;
    from = out[out.length - 1].blockNumber + 1n;
  }
  return out;
}

async function fromRpc(
  client: PublicClient,
  address: Address,
  topics: (Hex | null)[],
  fromBlock: bigint,
): Promise<RawLog[]> {
  const latest = await client.getBlockNumber();
  const out: RawLog[] = [];
  let size = 100_000n;
  let from = fromBlock;
  for (let requests = 0; from <= latest && requests < 400; requests++) {
    const to = from + size - 1n > latest ? latest : from + size - 1n;
    try {
      const logs = await client.request({
        method: 'eth_getLogs',
        params: [
          {
            address,
            topics,
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          },
        ],
      });
      for (const l of logs as { topics: Hex[]; data: Hex; blockNumber: Hex }[])
        out.push({ topics: l.topics, data: l.data, blockNumber: BigInt(l.blockNumber) });
      from = to + 1n;
    } catch (e) {
      if (size <= 1_000n) throw e;
      size /= 4n;
    }
  }
  return out;
}

export function decode<TAbi extends Abi>(abi: TAbi, log: RawLog) {
  try {
    return decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
  } catch {
    return null;
  }
}
