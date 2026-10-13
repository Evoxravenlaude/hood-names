# Web app

The site for registering and managing names: search, register (paying with ETH, a dollar stablecoin or gift-card points), my names, records and a profile picture, subnames, renew, send, check a name before paying it, gift cards, and a test-token page on testnet.

## Readable transactions

Before any wallet prompt, the site shows what is about to be signed in plain language ("Register sage.hood for 1 year", "Send 1 × $5.00 gift card to rav3n.hood"). The text is built by encoding the call exactly as the wallet will receive it and decoding it again, so it describes the real data, and it names the contract and the first bytes of the data so they can be matched in the wallet.

Wallets that don't support Robinhood Chain Testnet (Rabby says "Simulation not supported" and "Unknown signature type") still show raw data. Two things help them: the testnet workflow publishes every contract's source on the explorer, and publishes the function names to the public signature databases most wallets read. Whether a given wallet uses them for this chain is up to the wallet.

## Profile pictures

An uploaded picture is cropped square, shrunk to at most 8 KB and stored on-chain in the name's avatar record as a data URL, so no server or pinning service is involved. A link (https:// or ipfs://) works too. Pictures hosted elsewhere are not loaded on other people's names, so their owners can't see who looked them up.

Vite, React, wagmi and viem. It reads contract addresses from `../deployments/<chainId>.json` at build time, so a new deployment shows up on the next build. Until the file exists the site says the contracts are not deployed yet.

## Run it

```bash
npm install
npm run dev          # serves Robinhood Chain testnet (46630)
```

| Setting | Default | |
| --- | --- | --- |
| `VITE_CHAIN_ID` | `46630` | `4663` for mainnet, `31337` for a local chain |
| `VITE_RPC_URL` | the public RPC | A private RPC (for example Alchemy) for heavier traffic |
| `VITE_REPO_URL` | none | Shown in the footer, with links to the name policy |

## Testing locally

From the repository root, with Foundry installed:

```bash
app/e2e/setup-local.sh                       # local chain with everything deployed
cd app && VITE_CHAIN_ID=31337 npm run dev    # in another terminal
CHROMIUM=/path/to/chrome node e2e/local.mjs  # optional: the end-to-end test
```

The end-to-end test drives the real site in a browser with a stand-in wallet: it registers two names (ETH and the test dollar), checks reserved and lookalike names, saves records, creates a subname, buys and redeems a gift card, renews, and checks a name.

To use your own wallet against the local chain, add network `http://127.0.0.1:8545`, chain id 31337, and import one of anvil's test keys.

## Test-ETH faucet (optional)

`api/faucet.ts` is a small serverless function. Vercel runs it automatically. It is off unless these are set in the host's environment variables:

| Variable | |
| --- | --- |
| `FAUCET_PRIVATE_KEY` | A testnet-only key holding some test ETH. It pays out. Never use a key with anything of value. |
| `FAUCET_AMOUNT_ETH` | Per request, default `0.002` |
| `FAUCET_MAX_BALANCE_ETH` | Wallets holding this much already are refused, default `0.001` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Optional Vercel KV / Upstash store, so the six-hour cooldown holds across every server instance |

Without it, the Test tokens page links to the public faucets (the official Robinhood Chain faucet first). Test dollars (tUSD) are claimed from the token contract itself: 1,000 per wallet every six hours.

## Hosting

Any static host works. On Vercel: import the repository, set **Root Directory** to `app`, and deploy. `vercel.json` sets the build and the page routing; `public/_redirects` does the same on Netlify and Cloudflare Pages. Each push to `main` rebuilds the site, including the commit the testnet workflow makes when it records the contract addresses.

## Known limits

- My names and subname lists are built from on-chain events, read from the block explorer's API with the RPC as a fallback. That is fine at testnet scale; at mainnet scale an indexer should take over.
- A subname created somewhere other than this site shows as a hash until its label is known.
