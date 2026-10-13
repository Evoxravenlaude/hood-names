# Name service contracts for Robinhood Chain

A name service built to be adopted by a chain operator: names that stay safe when they change hands, a namespace the operator can own, reserved brand and ticker names, and free names for verified accounts.

The core is the ENS v1 contracts (ens-contracts v1.7.0, MIT). "Hood Names" is a working title only; the product name and the suffix are open decisions (see `docs/`).

**Status: testnet-ready, not audited.** 192 contract tests pass, the site's end-to-end test passes against a local chain, and the deploy, reserve, open and handover scripts have been run end to end against a local chain. Nothing has been run against Robinhood Chain testnet. Do not deploy to mainnet before an external audit.

## Quick start

Needs [Foundry](https://book.getfoundry.sh/getting-started/installation) and Node 18+.

```bash
npm install
forge build
forge test
```

## The site

`app/` is the web app: search, register, my names, records, subnames, renew, send, check a name before paying it, and gift cards. See `app/README.md`.

## Getting it online

1. **Contracts.** The workflow *Deploy to Robinhood Chain testnet* (`.github/workflows/deploy-testnet.yml`) deploys everything, reserves the names, opens registration and commits the addresses to `deployments/46630.json`. It needs the repository secret `DEPLOYER_PRIVATE_KEY`, a testnet-only key holding testnet ETH from the [Alchemy faucet](https://www.alchemy.com/faucets/robinhood-testnet). It runs on pushes that touch the contracts, or by hand from the Actions tab, and does nothing that is already done.
2. **Site.** Import the repository on Vercel (or Netlify, or Cloudflare Pages) with the root directory set to `app`. It rebuilds on every push, so it picks up the addresses as soon as the workflow commits them.

## Deploy to testnet by hand

```bash
cp .env.example .env      # fill in PRIVATE_KEY
source .env
forge script script/Deploy.s.sol          --rpc-url robinhood_testnet --broadcast   # 1. deploy; registration starts PAUSED
forge script script/ReserveNames.s.sol    --rpc-url robinhood_testnet --broadcast   # 2. reserve brand, ticker, support names
forge script script/OpenRegistration.s.sol --rpc-url robinhood_testnet --broadcast  # 3. open to the public
```

The controller is paused from the moment it is created, and refuses commitments while paused, so nobody can take or queue a reserved name before the list is in. `OpenRegistration` refuses to run unless the deployment is whole and every reserved-list entry is reserved on-chain. Addresses are written to `deployments/<chainId>.json`; an existing file is not replaced unless `OVERWRITE=true`. Step-by-step procedures are in `docs/RUNBOOK.md`.

| Network | Chain ID | RPC alias |
| --- | --- | --- |
| Robinhood Chain testnet | 46630 | `robinhood_testnet` |
| Robinhood Chain mainnet | 4663 | `robinhood` |

On mainnet the deploy script requires `ETH_USD_FEED`, `GUARDIAN` and real metadata URIs, and checks that the feed answers with a fresh, plausible price.

### Deployment choices

| Setting | Default | What it does |
| --- | --- | --- |
| `PARENT_NAME` | `hood` | The name registrations sit under. A TLD, or an ENS-style name several labels deep such as `names.example.eth`. Nothing in the contracts depends on the string. |
| `ENABLE_REFERRALS` | `false` | Deploys the referral hub. |
| `ENABLE_GIFT_CARDS` | `false` | Deploys gift cards and points. |
| `DISCOUNT_SIGNER` | unset | Enables a free first name for accounts this signer attests. |
| `SANCTIONS_LIST` | unset | Chainalysis-compatible oracle; screens the owner and payer at registration. |
| `GUARDIAN` | unset | An address that can pause sales but not unpause. Required on mainnet. |
| `SEQUENCER_UPTIME_FEED` | unset | Chainlink L2 sequencer feed, if one exists for the chain. |
| `BATCH_GATEWAY_URLS` | unset | Comma-separated CCIP-Read batch gateways for the universal resolver. |

### Handing the system over

```bash
NEW_OWNER=0x<multisig> NEW_GUARDIAN=0x<guardian> forge script script/HandOver.s.sol --rpc-url robinhood_testnet --broadcast
NEW_OWNER=0x<multisig> forge script script/HandOver.s.sol:VerifyHandOver --rpc-url robinhood_testnet
```

This moves the registry root, every node above the parent name, and ownership of every contract to `NEW_OWNER`, which must be a deployed contract (set `ALLOW_EOA=true` on testnet). It can be run again if it stops part way, and fails loudly if anything is left behind. Contracts with two-step ownership stay with the old owner until the new owner calls `acceptOwnership()` on each, so the handover is not complete until `VerifyHandOver` passes. The new owner must also rotate the discount signer, which a handover does not change.

## What is in here

### New contracts (`contracts/hood/`)

| Contract | What it does |
| --- | --- |
| `HoodNameLens` | One read that tells a wallet whether a name is safe to send to: state, expiry, holder, when it last changed hands, and whether its resolver is allowed. |
| `DiscountValidators` | `SignedDiscountValidator` (an operator attests a verified account; one free name per account) and `ERC721HolderDiscountValidator` (one per pass token). |
| `NameEncoding` | Namehash and DNS encoding for the parent name. |
| `HoodNameRules` | Decides which names are well-formed and what each one looks like. Seven alphabets, one per name; lookalike characters reduce to the same "skeleton". The character tables are generated from Unicode's confusables data by `tools/gen-name-tables.mjs` and sealed at deployment: they can grow, but an existing name can never be made to read differently. |
| `HoodNameGuard` | Holds the reserved names and which name currently holds each skeleton, so a lookalike of a reserved or live name cannot be registered. Lives outside the controller so the state survives a controller replacement. |
| `HoodRegistrarController` | Commit-reveal registration and renewal. Asks the name guard before issuing a name. Verified-account discounts, optional sanctions screening. Pays in ETH or an accepted stablecoin, spends gift-card points, pays referral commission. `commit`, `register`, `renew`, the `Registration` struct and the `NameRegistered` / `NameRenewed` events keep the ENS shape. |
| `HoodPriceOracle` | USD rent by label length (owner-adjustable), ETH/USD from a Chainlink-style feed with a staleness check or a fixed fallback rate, and a 21-day decaying premium on released names. |
| `HoodBaseRegistrar` | The ENS base registrar, plus: transferring the NFT hands control of the name to the recipient in the same transaction. |
| `HoodPublicResolver` | The ENS public resolver, plus: records belong to the (name, owner) pair, so a new owner never inherits the old owner's records. Same ABI. |
| `HoodUniversalResolver` | The ENS universal resolver, plus: expired names do not resolve, a name is only answered by a resolver the policy allows, and a subname only while the current owner of the name above it has approved it. |
| `HoodResolverPolicy` | Trusted resolvers, the default resolver, and per-owner approval of custom resolvers and of subnames. |
| `HoodReferralHub` | Referral tiers by lifetime count, partner rates, and commission balances that referrers withdraw themselves. |
| `HoodGiftCard` | ERC-1155 gift cards with a fixed USD face value, bought in ETH or stablecoin, redeemable into points. The owner can mint promo cards. |
| `HoodPointsLedger` | Non-transferable USD credit spent on registrations and renewals. |
| `PaymentAcceptor` | Shared stablecoin list and withdrawals to the owner. |

### Vendored from ENS

`registry/`, `ethregistrar/BaseRegistrarImplementation`, `resolvers/`, `reverseRegistrar/`, `universalResolver/`, `ccipRead/`, `utils/`, and `wrapper/` (NameWrapper, for subnames and fuses).

Two mechanical edits, nothing else:

- `wrapper/NameWrapper.sol` takes the parent name as a constructor argument instead of hardcoding `.eth`. Function names such as `wrapETH2LD` are kept so ENS tooling still matches the ABI.
- `resolvers/ResolverBase.sol` gains `_recordKey(node)`, and the resolver profiles use it where ENS used `recordVersions[node]` as a storage key (24 places; the key type widens from `uint64` to `uint256`). The default behaves exactly like ENS; `HoodPublicResolver` overrides it.

Removed: DNSSEC oracle, DNS registrar, root contracts, the L2 and default reverse registrars, and the ENS controller and price oracles that the `hood/` contracts replace.

## The unglamorous parts: where this departs from ENS on purpose

Each row is a problem that ENS-style name services leave to the user. Tests are in `test/Lifecycle.t.sol`, `test/UnsexyFixes.t.sol`, `test/WrapperPaths.t.sol`, `test/NameRules.t.sol` and `test/AuditFixes.t.sol`.

| Problem | What happens here |
| --- | --- |
| A name bought on a marketplace keeps resolving to the seller until the buyer calls `reclaim` and rewrites every record | The buyer becomes the registry owner in the transfer itself and sees a name with no records. Holds for wrapped names, wrapping or unwrapping to someone else, and operator transfers. |
| A name re-registered after expiry inherits the previous owner's resolver and records | The registry entry is rewritten in full and the previous owner's records are out of reach. |
| A seller leaves the name on a custom resolver that keeps answering with the seller's address | A custom resolver is honoured only if the name's current owner approved it (`HoodResolverPolicy.approveResolver`). The approval lapses when the owner changes. |
| An expired name keeps resolving, so payments go to someone who may no longer hold it | Names stop resolving at expiry and resume on renewal. Subnames stop with their parent. |
| A wrapped name renewed through the controller dies at its old expiry | Renewals go through the wrapper, which keeps both expiries in step. |
| A hostile resolver can block other people's registrations or transfers | No contract chosen by a previous owner is called during registration or transfer. Referrer lookups are gas-capped low-level calls. |
| No way to stop sales in an incident | The owner or a guardian can pause new registrations and gift-card sales. Renewals stay open, capped at one year ahead while paused. Only the owner can unpause. |
| Price feed can be stale during an L2 sequencer outage | Optional sequencer-uptime feed with a grace period. Stablecoin and points payments keep working without an ETH price. |
| Lookalike names (`rоbinhood` with a Cyrillic "о", `r0binhood`, `robínhood`) imitate brands and other people's names | Names can be written in seven alphabets, one per name, and no two names that look alike can both be registered. Enforced on-chain, in both directions and across alphabets. See `docs/NAME_POLICY.md` for the rule and its known gaps. |
| A short, expensive name is bought cheaply by spelling it with wider characters | A name is priced on the shortest name it looks like, and a lookalike of a name that has just been released pays the same release premium. |
| Brand, ticker and support-style names are sold to whoever arrives first | A reserved list of 743 entries, including the 194 tickers in Robinhood's Stock Token registry, is applied before registration opens, and covers everything that looks like an entry. Only the owner can issue a reserved name, to its rightful holder. |
| A subname created by a previous owner (`pay.alice`) keeps resolving under a name that now belongs to someone else | A subname resolves only while the current owner of the name above it has approved it, with the owner and resolver it had when approved. |
| Wallets send to a name without knowing it just expired or changed hands | `HoodNameLens.status(label)` returns those facts in one call so a wallet can warn. |
| The same name can exist in several registries | The deployment file records chain ID, registry address and deploy block. The SDK will identify a name by chain ID, registry and node, and never fall back to another registry. |

### What integrators need to know

- **Use the universal resolver.** The expiry and resolver-policy checks live there. A client that reads a resolver contract directly, or calls `resolveWithResolver` with its own resolver, bypasses them.
- **Custom resolvers need one extra call.** After pointing a name at a custom resolver, its owner calls `approveResolver(node, resolver)`. Without it the name does not resolve.
- **Subnames need one extra call.** After creating a subname and setting its resolver, the owner of the name above it calls `approveSubnames([subnode], true)`. The approval covers the subname as it stands; if its owner or resolver changes, it must be approved again.
- **Normalise before hashing.** Interfaces must apply ENSIP-15 normalisation (which lowercases) before computing a labelhash. The contract refuses uppercase rather than folding it.
- **Records follow the registry owner.** `reclaim(id, manager)` appoints a manager, who has its own record set. Any NFT transfer returns control to the new holder.
- **Vaults and escrow.** A name sent to another contract shows no records while it is there, and its previous records return if it comes back to the same owner. A contract that holds names for several people and writes records for them must call `clearRecords` between depositors.

### Known limits

- **Subnames as independent assets.** Because a subname must be re-approved when its owner changes, a subname sold by its holder stops resolving until the owner of the name above approves it again. Subnames here are delegations, not freely tradable names.
- **Lookalike detection is not complete.** `docs/NAME_POLICY.md` lists pairs that are not caught, and the rule over-blocks in places (`modern` blocks `modem`).
- **Checking a name costs gas.** About 30,000 to 60,000 for an ordinary name, up to about 700,000 for a 63-character name. A typical registration is about 480,000 in total.
- **Replacing the controller needs a new resolver.** See `docs/RUNBOOK.md`.
- **Guardian.** A compromised guardian can re-pause after every unpause. Replace it with `setGuardian` first.

## How a registration is charged

1. Price in USD = rent for the name's length × duration, plus any release premium. Length is that of the shortest name it looks like.
2. If the buyer opts in, gift-card points are subtracted (against the premium first).
3. The remainder is converted to ETH at the oracle rate, or to the stablecoin at 1:1.
4. If a valid referrer is named, the buyer gets a discount and the referrer a commission, both taken from the rent only.

Referrals are an optional module. A referrer is the labelhash of a registered name (`keccak256("alice")`). The name must be unexpired and resolve to an address, and that address cannot be the buyer or the new name's owner.

## Free names for verified accounts

`registerWithDiscount` applies a discount (up to 100%) that a validator approves. With `SignedDiscountValidator`, the operator's backend signs an attestation for one account, one address and one exact name; anyone, including a gas-sponsoring relayer, can then submit it.

- One discounted name per account and per address, for up to a year, on labels of 5 or more characters by default.
- The attestation is bound to the chosen name, so it cannot be spent on a different one.
- No personal data goes on-chain; the account is an opaque identifier.
- A release premium is still charged, and a discounted registration earns no referral.

## Admin powers

Read `docs/ADMIN_POWERS.md` before describing this system as trustless. In short: the owner sets prices, reserved names, discounts and the resolver policy, and whoever owns the registry root (and any name above the parent) can reassign the parent and with it every name. `HandOver` moves all of that to the operator.

## Placeholder settings to replace

These are in `script/HoodDeployer.sol` and can also be changed later through owner functions.

| Setting | Placeholder |
| --- | --- |
| Reserved lists | In `reserved/`. Tickers and issuers are from Robinhood's registry as of 16 September 2026 and must be pulled again before launch |
| Rent | $640 a year for 3 characters, $160 for 4, $5 for 5 or more |
| Minimum label length | 3 characters (constant in the name rules) |
| Longest term | Expiry at most 10 years ahead (constant in the controller) |
| Minimum registration | 28 days (constant in the controller) |
| Release premium | Starts at $100,000,000 and halves daily for 21 days |
| Referral tiers | 5% commission and 5% discount; 10% / 5% from 10 referrals; 15% / 5% from 100 |
| Referral counting threshold | Only registrations of $4 or more count towards tiers |
| Fallback ETH/USD | $3,000 (testnet only) |
| Metadata URIs | `metadata.example` |

## Before mainnet

- **External audit.** Six internal review passes have been run and their findings fixed and covered by regression tests. The last pass found no way to register a reserved or lookalike name, pay less than the price, or take funds. The name rules, the name guard and the lifecycle changes are new mechanisms that ENS does not have, so they have no upstream audit to lean on. Internal review is not a substitute for an audit.
- **Ownership.** Move every contract and the registry root from the deployer key to a multisig. The owner can change prices, list payment tokens and mint promo gift cards.
- **ETH/USD feed.** Chainlink lists feeds for Robinhood Chain mainnet. Confirm the ETH/USD address from Chainlink's own directory, and whether a sequencer-uptime feed exists. Set `SEQUENCER_UPTIME_FEED` if so.
- **Guardian.** Set `GUARDIAN` to an address that can pause quickly, separate from the owner multisig.
- **Stablecoin.** Confirm the USDG address. Listed tokens are accepted at exactly $1; a token that takes a fee on transfer is refused at payment.
- **Referral economics.** Two wallets can always refer each other for the base discount; that is inherent to open referral programmes. The counting threshold and tier sizes decide how expensive it is to climb tiers by wash registration.
- **Name rules.** Have a native reader of each supported alphabet review the lookalike tables. The tables are sealed at deployment, so a wrong entry cannot be corrected afterwards, only added to.
- **Reserved list.** Pull Robinhood's Stock Token registry again immediately before registration opens.
- **Registry root.** Not locked, on purpose. See `docs/ADMIN_POWERS.md` for the reasoning and what other name services do.
- **Contract size.** `HoodRegistrarController` is 21,942 bytes and NameWrapper 24,332 against the 24,576 limit at `optimizer_runs = 1200`. Do not raise the optimizer runs; further features belong in separate contracts.

## Licence

MIT. ENS code is copyright ENS Labs Limited; see `LICENSE-ENS.txt`.
