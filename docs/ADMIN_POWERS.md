# Admin powers

A plain list of what each privileged party can do, so that nobody describes this system as more trustless than it is. Draft; review before publishing.

## The contract owner (deployer, then the operator's multisig after handover)

| Power | Where | Limit |
| --- | --- | --- |
| Set rent prices and the ETH/USD source | `HoodPriceOracle` | Shorter names can never be cheaper than longer ones |
| Replace the price oracle, referral hub, points ledger, name wrapper reference | `HoodRegistrarController` | None on-chain |
| Reserve and release names | `HoodNameGuard` | A name that is already registered is unaffected until it lapses |
| Issue a reserved name without payment | `HoodRegistrarController` | Only names on the reserved list |
| Authorise the controllers that may register names | `HoodNameGuard`, `HoodBaseRegistrar` | A controller can register available names and extend registrations. It cannot shorten a registration or take a registered name |
| Add characters, alphabets and alphabet combinations | `HoodNameRules` | Sealed at deployment: an addition cannot change how any existing name reads, and nothing can be removed |
| Define discounts and their validators; set the sanctions oracle | `HoodRegistrarController` | Discount at most 100%, one year, one per address |
| Pause and unpause sales; appoint the guardian | `HoodRegistrarController`, `HoodGiftCard` | Renewals stay open while paused, capped at one year ahead. New commitments are refused while paused |
| List payment tokens | `HoodRegistrarController`, `HoodGiftCard` | A token that delivers less than it was charged for is refused |
| Withdraw proceeds | Any payment contract | Always to the owner; ownership cannot be renounced |
| Mark resolvers trusted; set the default resolver | `HoodResolverPolicy` | A trusted resolver is honoured for every name. The default must be trusted |
| Authorise wrapper controllers; set the wrapper upgrade target | `NameWrapper` | As in ENS |
| Mint promotional gift cards; allow gift-card sales at a fixed ETH rate | `HoodGiftCard` | None on-chain |
| Set referral tiers and partner rates | `HoodReferralHub` | Commission plus discount at most 50% of rent |

## The owner of the registry root and of names above the parent

Whoever owns the registry root, or any name above the parent (for `names.example.eth`: `example.eth` and `eth`), can reassign the parent name to a different registrar. That would let them take over every name under it, including wrapped names whose fuses have been burned, and would stop registrations and renewals.

### Locking: where others stand, and the recommendation

Research is in `docs/research/NAME_LOCKING.md`. In short:

- **ENS is the only name service found that locked its namespace.** Its root contract can no longer reassign `.eth`. The DAO still controls who may register and at what price.
- **No name service run by a company or a chain has locked.** Basenames, Linea names, Uniswap's and World's namespaces, Aptos Names and SPACE ID all keep the power to reassign or upgrade. Aptos Names has an explicit function to seize a name.
- **Robinhood has said nothing about names.** What it has said about the chain points one way: it keeps chain-level control (it runs the sequencer, screens for sanctions, and can upgrade the chain), and its stated view is that compliance belongs at the level of each application.
- **Regulated payment aliases are all revocable**: PIX keys, UPI handles, PayPal.Me links.

A lock here would remove this team's power over names, not Robinhood's. Robinhood could still censor transactions or upgrade the chain. So a lock would not make names "unseizable", and saying so would be an overclaim. It would also remove the takedown path a regulated operator is likely to want.

**Recommendation: do not lock at launch.** Keep the root with a multisig behind a timelock, publish this page, and leave the decision to lock to whoever ends up responsible for the namespace. A lock can be added later; it cannot be undone.

## The guardian

Can pause new registrations, new commitments and gift-card sales. Cannot unpause, withdraw or change anything else. A compromised guardian can re-pause after each unpause until the owner replaces it.

## The discount signer

Can attest any account for a discounted name. One name per account identifier and per address, but the signer chooses the identifiers, so a compromised signer can issue free names (5+ characters, one year) until the owner rotates it. A handover does not change the signer: the new owner must rotate it.

## What nobody can do

- Shorten an existing registration.
- Move or seize a registered name through the controller, the name guard or the registrar. (The root owner can, as described above.)
- Change a name's records without being its owner, an approved delegate, or a resolver the owner chose.
- Read or write another owner's records for the same name: records belong to the name and its owner together.
- Change what an existing name looks like to the lookalike check.

## Recommended before mainnet

- Owner is a multisig behind a timelock for everything except pause.
- Guardian is a separate, faster key.
- The discount signer is a key held in the operator's backend, rotated at handover.
