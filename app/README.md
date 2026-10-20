# Web app

The site for registering and managing names: search, register (paying with ETH, a dollar stablecoin or gift-card points), my names, records and a profile picture, subnames, renew, send, check a name before paying it, gift cards, stats, and a test-token page on testnet.

## Look, motion and first steps

The full brand, with files to download, is on the site at `/brand`.

- **The story: the block.** Every name is a street sign on Robinhood Chain, and every registered name is a lit window on a street drawn under the hero. Point at a window to read its name; click it to open the name. The street is drawn from a fixed seed (`src/components/Street.tsx`), so it is the same on every visit and only the lights change as names are registered.
- **Colours, night and day.** The street can be painted in five colours, each with a night (the default) and a day setting: **Slate** (the main colour, cool grey with Robin Neon), **Brass** (ivory and brass on oat or espresso, the quiet old-money one), **Enamel blue**, **Claret** (claret and gold) and **Onyx** (Robinhood Chain's own black, white and neon). The day/night switch and the colour swatch sit in the header; a change opens as a circle from the control (cross-fades where the browser can't), and both choices are kept and applied before the page draws. All colours live in `src/lib/palettes.ts`; `node scripts/palettes.mjs` checks every text pairing for contrast and keeps the small copy in `index.html` (browser bar, loading screen) in step (`--write` refreshes it). To make another colour the default, change `DEFAULT_PALETTE` there and run the script with `--write`.
- **The sign.** A name is always set on its sign: a painted plate, a frame with a fine line inside it, the ending in the frame's colour, and the address it points to in small type on top (`src/components/Plate.tsx`). The search box is a sign you type on; while it is empty it shows an address turning into a name. A sign keeps its paint by day and by night.
- **Mark and type.** The mark is a small sign with ".h" on it, painted in the chosen colour (`public/brand/<colour>/`; the favicon is Slate). Type is one family, Archivo, used across its width axis: wide and heavy for headlines and signs, normal width for reading; Geist covers Cyrillic and Geist Mono sets addresses. Robin Neon is Robinhood Chain's colour and is never text on a light background. Warnings use sodium orange in every colour. Charts use colour-blind-checked palettes for every colour and setting. The Robinhood Chain logo and feather are not used, as the [brand guidelines](https://docs.robinhood.com/chain/brand-guidelines/) ask.
- **Motion** answers something: the loading screen puts the sign up while the site loads (once per visit; afterwards only if loading is slow); windows switch on in a wave and new names flicker on; the sign glows when a name is free and turns orange when it is refused; the minute's wait is a countdown ring; buying a name ends with the sign dropping in and confetti; confirmations slide in as toasts; pages ease in. All of it is switched off for people who ask their device for reduced motion.
- **Sharing.** After buying, "Save picture" makes a 1200 × 630 picture of the name on its sign over the street, in the colour and setting being viewed (`src/lib/card.ts`); on phones it opens the share sheet. The site's own link preview (`public/og.png`) is made the same way.
- **First steps.** A four-card tour from the hero ("New here?"), a getting-started checklist that ticks itself from the wallet and the chain (connect, switch network, get ETH, pick a name, make it primary, add a picture) with the one button each step needs, a one-tap "Add Robinhood Chain" for wallets that lack it, and help for people with no wallet yet. My names shows your names as a rack of signs.

## Languages

The site is in English, French, Spanish, Portuguese, German, Turkish, Russian, Hindi, Indonesian, Chinese, Japanese and Korean. The language menu in the header always lists English first, under its own name, so it can be found from any language. The first visit follows the browser's language when it is one of these.

Strings are written in English in the code, inside `t('…')` (or `mark('…')` for tables of messages). `node scripts/i18n.mjs` collects them into `src/i18n/locales/en.json` and reports what each language is missing; a missing string shows in English. `--check` fails on gaps, on placeholders that differ from the English, and on English text left outside `t()`.

Browser translators (Chrome's Translate) rewrite the page's text in a way React cannot follow: text the site later changes stops updating, so a search result could keep showing the previous name. The site guards against this: names, addresses and amounts are marked `translate="no"`, the page is protected from the crash this otherwise causes, a notice offers the site's own version of the language when it sees a translated page, and once someone picks a language in the menu the browser's translator is switched off for the site.

## Stats

`/stats` works out its figures in the browser from the contracts' public events (through the explorer's log API, or the RPC), so there is no server or indexer to trust: registrations, the share of names that point to a wallet, renewal when due, names coming back and when, when people are most active (by weekday and hour, in the viewer's time zone), alphabets, name lengths, how names are spread across wallets, how people pay, reserved names and gift cards. Headline figures come first; the rest is behind "More detail".

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
CHROMIUM=/path/to/chrome node e2e/languages.mjs  # optional: language switching
CHROMIUM=/path/to/chrome node e2e/onboarding.mjs # optional: tour, theme, checklist
```

The end-to-end test drives the real site in a browser with a stand-in wallet: it registers two names (ETH and the test dollar), checks reserved and lookalike names and the added alphabets, saves records, creates a subname, buys and redeems a gift card, renews, checks a name and opens the stats. The language test switches to French, Japanese and Hindi and back to English, reloads, and imitates a browser translator to check the site notices it and keeps names updating.

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
