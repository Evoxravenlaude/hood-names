import { defineChain, type Address, type Chain, type Hex, zeroAddress } from 'viem';

/** Robinhood Chain networks. Values from docs.robinhood.com/chain/connecting. */
export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
});

export const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
});

export const localChain = defineChain({
  id: 31337,
  name: 'Local chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
});

const CHAINS: Record<number, Chain> = {
  [robinhoodTestnet.id]: robinhoodTestnet,
  [robinhoodMainnet.id]: robinhoodMainnet,
  [localChain.id]: localChain,
};

const requested = Number(import.meta.env.VITE_CHAIN_ID ?? robinhoodTestnet.id);
export const chain: Chain = CHAINS[requested] ?? robinhoodTestnet;
export const rpcUrl: string =
  (import.meta.env.VITE_RPC_URL as string | undefined) || chain.rpcUrls.default.http[0];
export const explorerUrl: string | undefined = chain.blockExplorers?.default.url;
export const repoUrl: string | undefined =
  (import.meta.env.VITE_REPO_URL as string | undefined) || undefined;

/** The addresses written by script/Deploy.s.sol to deployments/<chainId>.json. */
export interface Deployment {
  chainId: number;
  deployBlock: number;
  parentName: string;
  parentNode: Hex;
  ENSRegistry: Address;
  BaseRegistrar: Address;
  ReverseRegistrar: Address;
  PublicResolver: Address;
  NameWrapper: Address;
  UniversalResolver: Address;
  HoodRegistrarController: Address;
  HoodPriceOracle: Address;
  HoodResolverPolicy: Address;
  HoodNameLens: Address;
  HoodNameGuard: Address;
  HoodNameRules: Address;
  HoodPointsLedger: Address;
  HoodGiftCard: Address;
  HoodReferralHub: Address;
  Stablecoin?: Address;
}

const files = import.meta.glob('../../deployments/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Deployment>;

function find(chainId: number): Deployment | null {
  for (const [path, value] of Object.entries(files)) {
    if (path.endsWith(`/${chainId}.json`) && value && value.HoodRegistrarController) return value;
  }
  return null;
}

/** The deployment for the chain this site serves, or null if none yet. */
export const deployment: Deployment | null = find(chain.id);

export const parentName: string = deployment?.parentName ?? 'hood';

export const has = (address: Address | undefined): address is Address =>
  !!address && address !== zeroAddress;

export const modules = {
  referrals: has(deployment?.HoodReferralHub),
  giftCards: has(deployment?.HoodGiftCard),
  points: has(deployment?.HoodPointsLedger),
  stablecoin: has(deployment?.Stablecoin),
};

export const YEAR = 365n * 24n * 60n * 60n;
export const GRACE_PERIOD = 90n * 24n * 60n * 60n;
