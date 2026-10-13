import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { chain, rpcUrl } from './config';

export const wagmiConfig = createConfig({
  chains: [chain],
  // Browser wallets (MetaMask, Rabby, Coinbase Wallet extension and others)
  // are discovered automatically through EIP-6963.
  connectors: [injected()],
  transports: { [chain.id]: http(rpcUrl, { batch: true }) },
  multiInjectedProviderDiscovery: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
