# Runbook

Short procedures for the people operating the contracts. Draft.

## Launch

1. `Deploy`. The controller is paused from the moment it exists, and refuses commitments while paused. The address file is written when the deployment is sent; if sending stops part way, delete the file and deploy again.
2. `ReserveNames`. Safe to run again after a failure.
3. `OpenRegistration`. Refuses unless every contract in the address file exists and is wired, and every reserved-list entry is reserved on-chain.
4. `HandOver`, then the new owner accepts ownership of each two-step contract, then `VerifyHandOver`.

## Incident: prices look wrong, or an exploit is suspected

1. Guardian calls `pause()` on the controller (and on the gift card contract if it is deployed).
2. Renewals stay open, capped at one year ahead, so nobody loses a name during the incident. Stablecoin payments do not depend on the ETH rate.
3. Only the owner can unpause. If the guardian key is the problem, replace it with `setGuardian` before unpausing.

## Testnet test dollar

`script/UpgradeTestStablecoin.s.sol` swaps the test dollar for the current version (1,000 per claim, once every six hours) and stops accepting the old one. The testnet workflow runs it on every push and it does nothing once current. It refuses mainnet and any token whose symbol is not `tUSD`. Balances of the old token stay in wallets but can no longer pay; referral earnings held in it can still be withdrawn.

## Replacing the registrar controller

The lookalike and reserved-name state lives in `HoodNameGuard` and survives. A new controller needs:

1. Deploy it with the same guard. It starts paused.
2. `guard.setController(new, true)`, `base.addController(new)`, `wrapper.setController(new, true)`, `reverseRegistrar.setController(new, true)`, and the hub and ledger if used.
3. **A new public resolver.** `HoodPublicResolver` trusts one controller address, fixed at deployment. Until a resolver that trusts the new controller is deployed, marked trusted and made the default, registrations that set records in the same transaction fail. Existing names keep working on the old resolver.
4. Remove the old controller from each of the contracts in step 2, then unpause.

## Adding an alphabet or characters

`HoodNameRules` is sealed at deployment. `addPage`, `addRanges` and `addGroups` still work, but refuse anything that would change how an existing name reads; version 2 adds `addExtensionPatterns`, for pricing patterns that begin with a code no launch name contains.

1. Add the alphabet to `EXTENSIONS` in `tools/gen-name-tables.mjs` (a new script id, its code point range, and sample names) and run `node tools/gen-name-tables.mjs`. The launch tables (`nametables/page-*.hex`, `meta.json`) must not change: `git diff nametables/page-0.hex nametables/meta.json` should be empty.
2. `forge test`. `test/Alphabets.t.sol` applies the extensions to a copy of the launch contract as well as to a fresh one, and checks every launch sample still reads as it did.
3. Add the alphabet to `app/src/lib/scripts.ts` so the site lists it. The site asks the contract which alphabets work, so it only shows it once applied.
4. Push. The testnet workflow runs `script/ExtendNameRules.s.sol`, which applies any extension not yet applied and skips ones the contract is too old for. By hand:

```bash
forge script script/ExtendNameRules.s.sol --rpc-url robinhood_testnet --broadcast --slow
```

The key must own the name rules. After `HandOver`, the multisig sends the same calls (`addExtensionPatterns`, `addPage`, `addGroups`, in that order); `forge script` without `--broadcast` prints them. Each part is checked on-chain before it is sent, so a run that stopped part-way is finished by running it again.

Extensions marked `requiresVersion: 2` (scripts with combining marks, right-to-left scripts) cannot go on a version 1 contract. The testnet runs version 1. To get every alphabet there, deploy fresh: delete `deployments/46630.json` and push (or run the workflow by hand). The workflow then deploys a new set of contracts with every extension applied, reserves the names and opens registration. Names on the old testnet contracts do not carry over.

## Refreshing the reserved list

Pull Robinhood's asset registry again (method in `docs/research/STOCK_TOKENS.md`), update `reserved/tickers.txt` and `reserved/issuers.txt`, and run `ReserveNames`. A newly listed ticker that someone already registered stays with its holder until it lapses; the contract emits `ReservedWhileHeld` so these can be reviewed.

## What an indexer must do

- Treat a change of a name's owner as a reset of its records. The resolver does not emit events for the reset.
- Read resolution through the universal resolver. Reading a resolver contract directly skips the expiry, resolver-policy and subname checks.
- A subname resolves only while the current owner of the name above it has approved it as it stands. Any change to the subname's owner or resolver needs a new approval.
