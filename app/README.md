# Web app

The site for registering and managing names: search, register (paying with ETH, a dollar stablecoin or gift-card points), my names, records, subnames, renew, send, check a name before paying it, and gift cards.

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

## Hosting

Any static host works. On Vercel: import the repository, set **Root Directory** to `app`, and deploy. `vercel.json` sets the build and the page routing; `public/_redirects` does the same on Netlify and Cloudflare Pages. Each push to `main` rebuilds the site, including the commit the testnet workflow makes when it records the contract addresses.

## Known limits

- My names and subname lists are built from on-chain events, read from the block explorer's API with the RPC as a fallback. That is fine at testnet scale; at mainnet scale an indexer should take over.
- A subname created somewhere other than this site shows as a hash until its label is known.
