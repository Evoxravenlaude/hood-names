// Optional test-ETH faucet, run as a serverless function by the host (Vercel
// runs any file in /api). It is off unless FAUCET_PRIVATE_KEY is set to a
// funded, testnet-only key. Never give it a key that holds anything of value.
//
//   FAUCET_PRIVATE_KEY      key that pays out (required to switch it on)
//   FAUCET_RPC_URL          default: the public Robinhood Chain testnet RPC
//   FAUCET_AMOUNT_ETH       per request, default 0.002
//   FAUCET_MAX_BALANCE_ETH  refuse wallets already holding this much, default 0.001
//   KV_REST_API_URL, KV_REST_API_TOKEN
//                           optional Upstash/Vercel KV store. With it the
//                           six-hour cooldown holds across every instance;
//                           without it, only within one running instance.
//
// Limits that remain: a fresh address per request gets past the per-address
// cooldown (the IP cooldown slows this). Keep the faucet's balance small.
import { createPublicClient, createWalletClient, formatEther, http, isAddress, parseEther, zeroAddress, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

declare const process: { env: Record<string, string | undefined> };

const CHAIN_ID = 46630;
const COOLDOWN_SECONDS = 6 * 60 * 60;
const recent = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();

interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

function settings() {
  const key = process.env.FAUCET_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  return {
    account: privateKeyToAccount(key as `0x${string}`),
    rpc: process.env.FAUCET_RPC_URL || 'https://rpc.testnet.chain.robinhood.com',
    amount: parseEther(process.env.FAUCET_AMOUNT_ETH || '0.002'),
    maxBalance: parseEther(process.env.FAUCET_MAX_BALANCE_ETH || '0.001'),
  };
}

const chain = {
  id: CHAIN_ID,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
} as const;

/** Claims a cooldown slot. True if it was free. Durable when a KV store is configured. */
async function claimSlot(key: string): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const res = await fetch(`${url}/set/${encodeURIComponent('faucet:' + key)}/1/NX/EX/${COOLDOWN_SECONDS}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('cooldown store unavailable');
    const body = (await res.json()) as { result: string | null };
    return body.result === 'OK';
  }
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < COOLDOWN_SECONDS * 1000) return false;
  recent.set(key, now);
  return true;
}

async function releaseSlot(key: string) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    await fetch(`${url}/del/${encodeURIComponent('faucet:' + key)}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => {});
  } else {
    recent.delete(key);
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('cache-control', 'no-store');
  const s = settings();
  if (req.method === 'GET') return res.status(200).json(s ? { enabled: true, amount: `${formatEther(s.amount)} ETH` } : { enabled: false });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use GET or POST.' });
  if (!s) return res.status(404).json({ error: 'This site has no faucet set up.' });

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body as Record<string, unknown> | undefined);
  const raw = typeof body?.address === 'string' ? body.address.trim() : '';
  if (!isAddress(raw, { strict: false }) || raw.toLowerCase() === zeroAddress)
    return res.status(400).json({ error: 'That is not a wallet address.' });
  const to = raw.toLowerCase() as Address;

  const transport = http(s.rpc);
  const reader = createPublicClient({ chain, transport });
  try {
    if ((await reader.getChainId()) !== CHAIN_ID) return res.status(500).json({ error: 'The faucet is pointed at the wrong network.' });
    const balance = await reader.getBalance({ address: to });
    if (balance >= s.maxBalance)
      return res.status(400).json({ error: 'This wallet already has enough test ETH to get going.', balance: formatEther(balance) });
  } catch {
    return res.status(502).json({ error: 'The faucet could not reach the network. Try again shortly.' });
  }

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const keys = [to, ...(ip ? [`ip:${ip}`] : [])];
  const claimed: string[] = [];
  try {
    for (const k of keys) {
      if (!(await claimSlot(k))) {
        for (const c of claimed) await releaseSlot(c);
        return res.status(429).json({ error: 'Already sent recently. Try again in a few hours, or use another faucet.' });
      }
      claimed.push(k);
    }
  } catch {
    for (const c of claimed) await releaseSlot(c);
    return res.status(503).json({ error: 'The faucet is busy. Try again shortly.' });
  }

  // One send at a time per instance, so two requests never reuse a nonce.
  const send = queue.then(async () => {
    const own = await reader.getBalance({ address: s.account.address });
    if (own < s.amount * 2n) throw new Error('dry');
    const writer = createWalletClient({ account: s.account, chain, transport });
    const nonce = await reader.getTransactionCount({ address: s.account.address, blockTag: 'pending' });
    return writer.sendTransaction({ to, value: s.amount, nonce });
  });
  queue = send.catch(() => {});
  try {
    const hash = await send;
    return res.status(200).json({ hash });
  } catch (e) {
    for (const c of claimed) await releaseSlot(c);
    if (e instanceof Error && e.message === 'dry')
      return res.status(503).json({ error: 'The faucet has run dry. Use one of the other faucets for now.' });
    return res.status(502).json({ error: 'The faucet could not send right now. Try again shortly.' });
  }
}

function safeParse(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
