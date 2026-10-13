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

`HoodNameRules` is sealed at deployment. `addPage`, `addRanges` and `addGroups` still work, but refuse anything that would change how an existing name reads. About 500 characters fit in one `addPage` call. Regenerate the tables with `node tools/gen-name-tables.mjs` and check the test vectors before sending anything.

## Refreshing the reserved list

Pull Robinhood's asset registry again (method in `docs/research/STOCK_TOKENS.md`), update `reserved/tickers.txt` and `reserved/issuers.txt`, and run `ReserveNames`. A newly listed ticker that someone already registered stays with its holder until it lapses; the contract emits `ReservedWhileHeld` so these can be reviewed.

## What an indexer must do

- Treat a change of a name's owner as a reset of its records. The resolver does not emit events for the reset.
- Read resolution through the universal resolver. Reading a resolver contract directly skips the expiry, resolver-policy and subname checks.
- A subname resolves only while the current owner of the name above it has approved it as it stands. Any change to the subname's owner or resolver needs a new approval.
