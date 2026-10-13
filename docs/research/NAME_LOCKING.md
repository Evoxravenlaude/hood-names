# Locking a namespace: what name services and chain operators actually did

Research date: 12 October 2026. Every fact carries the date of its source. Sources were opened on 12 October 2026 unless stated.

Verification labels used throughout:

- **[V]** read in a primary source today (docs, terms, governance forum, contract source, L2Beat).
- **[S]** read in a secondary source today (news, third-party analysis).
- **[U]** could not verify; stated from background knowledge or left open.

Limits of this pass: public RPC endpoints and block explorers were not reachable from the research environment, so **no on-chain state was read**. Every statement about who currently holds an owner key, proxy admin or root node comes from docs or source code, not from the chain. Those gaps are listed in section 7.

---

## 1. ENS

### 1.1 What was locked

- **The mechanism.** The ENS registry root node is owned by a `Root` contract. `Root.setSubnodeOwner(label, owner)` is callable by a "controller" and begins with `require(!locked[label])`. `Root.lock(label)` is `onlyOwner`, sets `locked[label] = true`, emits `TLDLocked`, and has no unlock function. [V: `ensdomains/ens-contracts`, `contracts/root/Root.sol`, staging branch, read 12 Oct 2026]
- **Effect.** Once `.eth` is locked, nobody, including the root owner, can reassign the `.eth` node to a different registrar. Nick Johnson, Feb 2022: "The lock cannot be overriden. It exists to deny even the owner the ability to change a record." Asked whether the lock implementation could be replaced: "No." [V: [forum thread, 8-10 Feb 2022](https://discuss.ens.domains/t/on-property-rights-and-threat-models-for-ens/10701)]
- **Only `.eth` is locked.** Nick Johnson, Feb 2026: TLD owners can call `lock()` to prevent DAO or controller changes; "only .eth is currently locked". [V: [forum, 3 Feb 2026](https://discuss.ens.domains/t/executable-enable-root-and-registrar-security-controllers/21872)]
- **Date of the `.eth` lock transaction: [U].** Not found today. It was in place by Nov 2021, because EP 0.1 already says ".eth is locked and cannot be changed by the root". [V: [EP 0.1](https://docs.ens.domains/dao/proposals/0.1)]

### 1.2 Timeline

| Date | Event | Status |
|---|---|---|
| 4 May 2017 | Root multisig formed (4-of-7, community keyholders). Stated remit included limiting or reversing damage from "unforeseen emergencies, such as a critical vulnerability in a registrar or the registry". | [V: [forum, 7 May 2020](https://discuss.ens.domains/t/changes-to-the-ens-root-multisig/100)] |
| May 2019 | Permanent registrar replaces the auction registrar; names migrated over a year. | [V: Nick Johnson, Apr 2019 post] |
| 30 Jan 2020 | CVE-2020-5232 disclosed: a registry bug let a previous owner set a "trapdoor" and take a name back after transferring it. Fix was a **new registry deployment** at `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e` (`ENSRegistryWithFallback`). | [S: [CVE record](https://vulert.com/vuln-db/CVE-2020-5232)] |
| Nov 2021 | EP 0.1: root multisig asked to transfer the `.eth` registrar, registrar controller, price oracle and `.reverse` to the DAO timelock. Root stays with the multisig "for now". | [V: [EP 0.1](https://docs.ens.domains/dao/proposals/0.1)] |
| 1 Aug 2023 | Security advisory GHSA-rrxv-q8m4-wch3 (see 1.4). | [V] |
| 15 Dec 2023 | EP 4.10 Snapshot vote closes, ~1.9M ENS for, under 17 against/abstain. | [S: [CryptoSlate, 15 Dec 2023](https://cryptoslate.com/ethereum-name-service-now-fully-decentralized-as-dao-takes-control/)] |
| 19 Dec 2023 | Root ownership transferred from multisig to DAO (`wallet.ensdao.eth`), tx `0xfd273ab1...cd77b2`. | [V: [nick.eth forum post, 19 Dec 2023](https://discuss.ens.domains/t/ep4-10-social-proposal-transfer-ens-root-key-ownership-to-the-ens-dao/18338)] |
| 28 Nov 2024 | EP 5.27 posted: revoke the DAO's ability to upgrade the NameWrapper. Docs list it as "Passed". Execution date [U]. | [V: [forum](https://discuss.ens.domains/t/ep-5-27-executable-revoke-the-daos-ability-to-upgrade-the-name-wrapper/19920), [docs](https://docs.ens.domains/dao/proposals/5.27)] |
| 24 Apr 2025 | EP 6.8 posted: remove the legacy multisig's leftover "controller" role on the Root. Vote reported 1 May 2025 (229 voters, 1.63M votes); outcome [U]. | [V: [forum](https://discuss.ens.domains/t/ep-6-8-executable-revoke-root-controller-role-from-legacy-ens-multisig/20644)] |
| 6 Feb 2026 | ENS Labs drops the Namechain L2; ENSv2 to ship on Ethereum L1 only. | [S: [The Block](https://www.theblock.co/post/388932/ens-labs-scraps-namechain-l2-shifts-ensv2-fully-ethereum-mainnet)] |
| 3-11 Feb 2026 | Proposal to add Root and Registrar "Security Controllers" goes to on-chain vote. Final result [U]. | [V: [forum](https://discuss.ens.domains/t/executable-enable-root-and-registrar-security-controllers/21872)] |

### 1.3 The 2020 migration and "burning the root keys"

- The 2020 fix shows the limit of a lock: the lock binds one registry contract. A registry-level bug was fixed by deploying a **new registry** and getting every client to point at it. Migration therefore remained possible, but only by social adoption, not by an admin call. This is the honest answer to "if we lock, how do we ever fix a bug": the ENS answer was "redeploy and persuade integrators". [Analysis, from the CVE record and Root.sol]
- How the root multisig set up `.eth` in the new registry, and whether the lock was re-applied at that point: [U].
- A discrete "burn the root keys" proposal thread was **not found**. What the record shows instead: (a) the root was never burned; it was handed to the DAO in Dec 2023; (b) for `.eth` the lock made burning unnecessary; (c) for every other TLD (DNS imports, `.reverse`) the root owner can still create or replace them. EP 4.10: the root key "can control the allocation and replacement of all TLDs except for .eth". [V]
- The counter-argument recorded on the forum (AvsA, Feb 2022): locking code too early could eliminate later features such as L2 support. [V]

### 1.4 What the DAO can still do to `.eth`

- **Registrar owner powers** (held by the DAO timelock): add or remove registrar controllers, set the `.eth` resolver, transfer registrar ownership. [V: EP 0.1; `BaseRegistrarImplementation.sol` shows `addController`, `removeController`, `setResolver` as `onlyOwner`]
- **Controller powers:** a controller can register available names and renew names. The price oracle and the controller are replaceable by the DAO, so the DAO sets prices and payment rules. Nick Johnson, Feb 2022: the DAO "can make arbitrary changes to the price oracle and registrar controller by replacing them". [V]
- **So the DAO cannot directly transfer an unexpired `.eth` name**, but it controls the conditions for keeping one. Threats listed by AvsA in Feb 2022: raise rent until names lapse, change the payment token to one only some users can get, change the premium oracle. [V]
- **Aug 2023 advisory.** An overflow in renewal meant a malicious DAO could appoint a controller that **shortens** existing registrations, 90 days per call, breaking the invariant that registrations "cannot be shortened once they are created". Same advisory: a malicious DAO could set a NameWrapper upgrade contract that would "seize control of wrapped names, even if the user does not choose to upgrade". $100,000 bounty paid. [V: [advisory thread, 1 Aug 2023](https://discuss.ens.domains/t/security-advisory-a-malicious-dao-update-could-reduce-the-registration-duration-of-registered-eth-2lds/17576)]
  - NameWrapper half: addressed by EP 5.27 (revoke DAO admin over the wrapper, keep only the metadata pointer). [V passed; execution U]
  - Registrar half: **not fixed in v1 as far as found.** Oct 2024, Nick Johnson suggested the DAO "revoke control over the v1 registrar once migration is begun"; Micah Zoltu objected that a fix existed and v2 was years away. [V]
- **Constitution, not code.** Article I: "ENS governance will not enact any change that infringes on the rights of ENS users to retain names they own." Amendable by two-thirds with 1% of tokens participating. [V: [constitution](https://docs.ens.domains/dao/constitution)]
- **Security Council.** Holds a veto over DAO proposals, time-limited; mandate was due to lapse 24 Jul 2026 and a new eight-member council was being voted in after the founder blocked an earlier renewal. [S: [The Defiant, 14 Jul 2026](https://thedefiant.io/news/defi/ens-dao-votes-to-seat-new-security-council-weeks-after-founder-blocked-renewal)] The Feb 2026 proposal would add two "negative" powers: disable a (non-locked) TLD and emergency-remove a `.eth` registrar controller. The DAO keeps the power to add controllers. [V; final vote U]

### 1.5 NameWrapper fuses

[V: [ENS docs, fuses](https://docs.ens.domains/wrapper/fuses)]

What they guarantee:

- A burned fuse "cannot be unburned" until expiry.
- `PARENT_CANNOT_CONTROL` ("Emancipated"): the parent can no longer replace, delete or burn fuses on the child. Requires the parent to be Locked.
- `CANNOT_UNWRAP` ("Locked"): the name cannot be unwrapped, so the parent cannot bypass the wrapper through the registry.
- Other owner fuses: `CANNOT_TRANSFER`, `CANNOT_SET_RESOLVER`, `CANNOT_SET_TTL`, `CANNOT_CREATE_SUBDOMAIN`, `CANNOT_BURN_FUSES`, `CANNOT_APPROVE`. Parent fuse `CAN_EXTEND_EXPIRY` lets the child renew itself.
- The chain of guarantees is recursive and terminates at a `.eth` 2LD, which is auto-emancipated on wrap.

What they do not guarantee:

- **Nothing past expiry.** "Fuses will only reset when the expiry is reached." A subname's guarantee is capped by the parent's expiry; subnames have no grace period.
- **Nothing for non-`.eth` names.** DNS-imported names get no fuse protection, because the DNS owner can override on the ENS side.
- **Nothing against the wrapper's own admin** until EP 5.27 removed the upgrade path (see 1.4).
- **Nothing against the registrar-level powers** in 1.4 (pricing, renewal conditions).

### 1.6 ENSv2

- Architecture: hierarchical per-name registries; "Registries and resolvers are deployed as proxies through the Verifiable Factory"; "Role-based permission system replacing ENSv1 fuses" (Enhanced Access Control). Grace period cut from 90 to 28 days. Deployed on Sepolia only as of the docs read today. [V: [ENSv2 overview](https://docs.ens.domains/contracts/ensv2/overview)]
- Status: Labs Q2 2026 report (18 Jul 2026) says it is "fully committed to shipping ENSv2 in 2026"; audits scheduled for Q3. Mainnet launch as of Oct 2026: [U]. [V: [Labs report](https://discuss.ens.domains/t/ens-labs-quarterly-progress-reports/20565/8)]
- Relevant warning in that report: one v2 design (Hidden Contract Accounts) was reworked to opt-in because DAO-level control "could become broader than in ENSv1, potentially affecting ownership rights". So the v1 lock does not carry over automatically; the guarantees are being re-negotiated. [V]
- Who admins the v2 root and `.eth` registry, which roles are irrevocable, and whether v2 proxies are upgradeable by the DAO: **[U]**. The overview page does not say.

---

## 2. Name services run by or for companies and chains

### 2.1 Basenames (Coinbase / Base)

- **Architecture.** "A slimmed down fork of the ENS contracts" on Base, plus an L1 resolver for `base.eth` and an off-chain CCIP gateway. `UpgradeableRegistrarController` and `UpgradeableL2Resolver` are proxies; a `ProxyAdmin` is listed. [V: [base/basenames README](https://github.com/base/basenames)]
- **Root powers in code.** `Registry` constructor sets `_records[0x0].owner = rootOwner` ("the permissioned address for managing establishing TLDs"). `setSubnodeOwner` is `authorized(node)`, so the root owner can reassign any top-level node and, through it, everything below. There is **no `Root` contract and no lock function** in this fork. `BaseRegistrar` has `addController`, `removeController`, `setResolver` as `onlyOwner`. [V: `src/L2/Registry.sol`, `src/L2/BaseRegistrar.sol`, main branch]
- **Who holds the root, the registrar owner and the ProxyAdmin: [U].** Could not read chain state. Also [U]: who owns `base.eth` on L1 and whether it is wrapped with fuses. Whoever does can change the L1 resolver and so redirect L1 resolution of every `*.base.eth` name.
- **What the terms say.** Base Terms, last updated 8 Apr 2026: "Basenames is not part of the Services"; "Coinbase is not able to forcibly remove, prevent or otherwise interfere with the ability of any person to register"; "Coinbase's permissions are non-custodial and limited to protocol maintenance"; "Basenames is purely non-custodial". No clause reserving a right to revoke or reassign a name. [V: [docs.base.org/terms-of-service](https://docs.base.org/terms-of-service)]
- **Gap between terms and code.** The terms disclaim the ability to interfere; the contracts give the root owner, registrar owner and proxy admin the technical means. "Limited to protocol maintenance" is a statement of intent, not a contract-level lock.
- **Reserved names.** FAQ: a name for an app or project may have been "reserved". [V]
- **Ever used to seize a name:** none found. [U as a negative]
- **Aside.** Base's own B20 token standard includes `seizeWithMemo` behind a `SEIZE_ROLE` with blocklist/allowlist policies. Coinbase builds seizure into regulated tokens while disclaiming it for names. [V: [Base docs](https://docs.base.org/base-chain/specs/reference/b20/interfaces/IB20/seizeWithMemo)]

### 2.2 cb.id (Coinbase Wallet)

- Off-chain subnames of a DNS name Coinbase imported into ENS: "subdomain data is stored off-chain instead of on-chain at the moment". Non-transferable; managed "exclusively through Coinbase's platforms"; no fuses. Use is "in accordance with our Subdomain Terms". Coinbase has said it "plan[s] to make access and control over your username more decentralized". A released name can be registered by someone else. [V: [Coinbase help](https://help.coinbase.com/en/wallet/managing-account/coinbase-ens-support), [ENS support](https://support.ens.domains/en/articles/11549910-cb-id-subnames-from-coinbase)]
- Issuer control is total by construction (the issuer runs the gateway). The Subdomain Terms themselves were not retrieved. [U]

### 2.3 uni.eth (Uniswap)

- Terms dated 21 Mar 2024, section 1.4: "We reserve the right to revoke access to your username at our discretion without notice"; "offensive names may also be revoked"; "We may also revoke your username to comply with a legal requirement or court order"; "Username squatting is also prohibited and may result in reassignment of a username." [V: [uniswap.org/terms-of-service](https://uniswap.org/terms-of-service)]
- Caveat: a third-party tracker indicates a newer version of the Uniswap terms was published around 30 Sep 2026 and that this clause may have changed. Current wording [U].

### 2.4 Linea Names (`linea.eth`)

- ENS fork on Linea with L1 resolution by storage proof; free registration gated by proof-of-humanity via an owner-set signer (`PohVerifier.setSigner` is owner-only). Managed only through Linea's front end. [V: [Consensys Diligence audit, Jun 2024](https://diligence.security/audits/2024/06/linea-ens/), [ENS support](https://support.ens.domains/en/articles/11549790-how-can-i-get-and-manage-a-linea-eth-subname)]
- The audit notes the NameWrapper constructor burns fuses on the root, `.eth` and base nodes with maximum expiry. Whether that amounts to a lock equivalent to ENS's, and who holds the registry root: [U].
- Terms on revocation: not found. Ever used: none found.

### 2.5 Celonames

- Launched 12 Nov 2025 by Celo Foundation and cLabs with ENS and Namespace; minted on-chain; cheaper for Self-verified users; annual renewal. [V: [Celo blog](https://blog.celo.org/ens-and-namespace-launch-celonames-a-unique-identity-layer-for-the-celo-ecosystem-54bfa94f011c)]
- Registry control, revocation, reserved names: [U]. Not addressed in the launch post.

### 2.6 World App usernames

- `name.world.id`, subnames of a DNS name imported into ENS, issued by World App to every user. [V: [ENS case study](https://ens.domains/ecosystem/world)]
- Storage model and revocation policy not stated there. Presumed issuer-controlled like cb.id. [U]

### 2.7 SPACE ID (`.bnb`, `.arb`)

- `sid-app` and `sidjs` are forks of ENS's app and library; the audited controller is `BNBRegistrarControllerV9`, i.e. the controller has been replaced at least nine times. [V: [github.com/Space-ID](https://github.com/Space-ID)]
- Proxy/upgrade pattern, who owns the registry root, admin powers over registered names, terms on revocation, and any use: **[U]**. Nothing primary was retrievable today. Treat SPACE ID as unknown rather than as a precedent in either direction.

### 2.8 Solana Name Service

- In the SPL name-service program, `process_transfer` accepts a signature from **either** the name's owner **or** the owner of its parent name (`name_record_header.owner != *name_owner.key && !is_parent_owner` fails only if neither). So whoever owns the `.sol` TLD account can transfer any `.sol` domain. [V: `solana-program-library/name-service/program/src/processor.rs`, master]
- Who owns the `.sol` TLD account today, whether the program is upgradeable and who holds the upgrade authority, any trademark policy, any use: [U].

### 2.9 SuiNS

- "Relinquishing central control for a community-based model" (9 Aug 2024). Governance by NS token; Foundation directors can veto votes that would breach fiduciary duty or law; for two years after the token launch a Community Council "can update the protocol contract in emergencies". [V: [Mysten blog](https://mystenlabs.com/blog/decentralization-of-suins), [Sui docs](https://docs.sui.io/sui-stack/suins/dao)]
- Whether governance or the council can remove or reassign a specific name, and any use: [U].

### 2.10 Aptos Names

- **Explicit seizure functions in the contract**, all gated by `assert_signer_is_admin`: `force_create_or_seize_name`, `force_set_target_address`, `force_clear_registration`, `force_set_name_expiration`. Source comment: "for moderation purposes, it allows us to seize a racist/harassing domain for 100 years, and park it somewhere safe". [V: `aptos-labs/aptos-names-contracts`, `core_v2/sources/v2_1_domains.move`, main]
- This is the clearest documented "operator can seize" design in the set. Whether it has been used: [U].

### 2.11 Unstoppable Domains

- Docs: the registry "was designed without an admin"; domains "cannot be reclaimed by Unstoppable Domains". [V: [UNS architecture](https://docs.unstoppabledomains.com/smart-contracts/overview/uns-architecture-overview/)]
- Terms, last updated 10 Jun 2026: once a domain is in the user's wallet, Unstoppable "will not be able to ... repossess the domain name"; but for domains in its custody it may "disable (to the extent technologically feasible)"; it may "take down any domains associated with that account" for malicious use; "court-ordered blocking or takeover of domain names" is listed as a legal exigency. [V: [terms](https://unstoppabledomains.com/terms)]
- **Used, at the resolution layer.** Oct 2022: Unstoppable stopped `.coin` and "immediately disabled .coin resolution in its libraries and services", affecting over 116,000 domains. "You still own your .coin domain, but it won't work with our resolution services or integrations." Compensation was store credit. [S: [Domain Incite](https://domainincite.com/28356-unstoppable-domains-stops-over-116000-domains-as-alt-root-tld-goes-dark)]
- Whether the UNS registry is behind an upgradeable proxy and who controls it: [U]. The "no admin" claim was not checked against the contract.

### 2.12 TON DNS / Fragment (Telegram usernames)

- Fragment terms: "Ownership is therefore permanent and cannot be revoked, even by Company." But the benefit is the link to a Telegram account, and Fragment "cannot guarantee that Telegram will not restrict or delete an account if it violates the Telegram ToS"; it may "become impossible to link such a username". [V: [fragment.com/terms](https://fragment.com/terms), undated]
- **Used, before tokenisation.** From Aug 2022 Telegram took back usernames it judged inactive, without warning, and later auctioned names on Fragment. [S: [Web3 is Going Great, 5 Nov 2022](https://web3isgoinggreat.com/single/telegram-repossesses-usernames-so-they-can-sell-them-as-nfts)]
- Pattern: token is immutable, the application decides whether to honour it.

### 2.13 Farcaster fnames

- "Fnames are free but they can be revoked by Farcaster at any time." Off-chain, issued under `fcast.id`. Policy: names tied to public figures or entities "may be reclaimed" (example given: `@google`); names unused for 60+ days may be reclaimed; names registered for resale may be reclaimed. "Decisions are made by the Farcaster team and often require human judgment." ENS names used as Farcaster usernames "cannot be revoked by Farcaster". [V: [Farcaster docs](https://docs.farcaster.xyz/learn/what-is-farcaster/usernames), [ENS names page](https://docs.farcaster.xyz/learn/architecture/ens-names)]
- Fully documented two-tier model: revocable free tier, non-revocable paid on-chain tier. Individual reclaim cases were not looked up. [U]

### 2.14 Lens handles

- Lens v2 `LensHandles`: owner fixed at construction (`ImmutableOwnable`); minting limited to owner or whitelisted creators; the published interface shows no admin function to move or seize a handle; a per-wallet "token guardian" with cooldown protects against theft. [V: [Lens v2 contract docs](https://contracts-v2-docs.lens.xyz/contracts/namespaces/LensHandles.sol/contract.LensHandles)]
- Lens v3: handles became "usernames" in namespaces with configurable rules and "Reserved Usernames"; guardian has no v3 equivalent. Admin powers over the global namespace in v3, proxy upgradeability of v2, and any use: [U]. [V for the description: [Lens migration docs](https://lens.xyz/docs/protocol/migration/overview)]

---

## 3. Robinhood's position on Robinhood Chain

### 3.1 Evidence

**Governance and upgrade keys**

- "Robinhood Chain's protocol is governed by a Security Council of eight signers." Robinhood holds two seats; BitGo, Chainlink Labs, Fireblocks Trust Company, Offchain Labs, Paxos and Talos hold one each. "Routine actions require approval from six of the eight signers" with a seven-day on-chain delay; emergency actions need seven of eight and skip the delay. Validators (BoLD, permissioned): Offchain Labs and Alchemy. [V: [docs.robinhood.com/chain/governance](https://docs.robinhood.com/chain/governance), undated]
- L2Beat: "Robinhood Chain is not even a Stage 0 project." Exit window: none, "contracts are instantly upgradable" (7/8 multisig, no delay; 6/8 with 7-day delay). Sequencer failure: "There is no guaranteed mechanism to have transactions included if the sequencer is down or censoring." Fraud proofs limited to 2 whitelisted actors. TVS shown $2.50B. [V: [L2Beat project page](https://l2beat.com/scaling/projects/robinhood)]
- Mainnet 1 Jul 2026. [V: [Arbitrum DAO factsheet](https://forum.arbitrum.foundation/t/arbitrumdao-factsheet-robinhood-chain-mainnet-launch/31041)] Sequencer run by Robinhood; 14-minute outage on 4 Sep 2026. [S: [Crypto Briefing, 11 Sep 2026](https://cryptobriefing.com/arbitrum-robinhood-chain-decentralization-concerns/)]

**Address blocking at the chain level**

- Docs: Robinhood Chain "maintains compliance standards through sequencer-level screening"; "any transaction associated with a sanctioned address will be excluded from inclusion". [V: [Differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum)]
- Terms of Service, last updated 24 Aug 2026 (RHDA, LLC), section 6: Robinhood may be "restricting or blocking specific wallet addresses from participating on Robinhood Chain", may "block any and all of your Wallets", and may "reset, modify, update, suspend, restrict, or permanently discontinue the Services at any time and without notice". Section 2.1: the sequencer "cannot modify, reverse, or cancel transactions once submitted"; "Robinhood does not control what third parties build on Robinhood Chain". Section 8.1 warns of "periodic protocol upgrades that could significantly alter chain operation". The terms never call the chain immutable. [V: [Terms](https://docs.robinhood.com/chain/terms-of-service)]
- L2Beat: the chain runs ArbOS 61 transaction filtering. An authorised filterer registers transaction hashes in a precompile and the state transition function then fails them, **including force-included ones**. "Force inclusion is therefore not a reliable censorship" escape. 6,096 filtered transaction hashes at the time of L2Beat's latest update. The 7/8 L2 multisig can add or remove filterers. [V]
- Arbitrum's docs for this feature: built for chains "with regulatory obligations", "not intended or proposed to be used by Arbitrum One", list supplied by a provider such as TRM Labs or Chainalysis; blocks token transfers to or from restricted addresses and calls targeting them. [V: [Arbitrum docs](https://docs.arbitrum.io/launch-arbitrum-chain/chain-config/sequencer/compliance-filtering)]

**Assets**

- Stock Tokens: "tokenised debt securities issued by Robinhood Assets (Jersey) Limited"; "a standard ERC-20 contract with 18 decimals"; they "can be transferred and held in any wallet". Not offered to US persons (Regulation S). Mint/burn only for KYB'd Authorised Participants. The docs describe **no** freeze, blocklist, pause or forced-transfer function. [V: [Stock Tokens docs](https://docs.robinhood.com/chain/stock-tokens), [Building with Stock Tokens](https://docs.robinhood.com/chain/building-with-stock-tokens)]
- Base Prospectus dated 25 Jun 2026: defines "Prohibited Investor", "Restricted Party", "Sanctions Event" (including where "the Issuer is otherwise required to take one or more of the actions specified in Condition (27)"), an "Issuer Redemption Option" exercisable "in its sole discretion", and mandatory redemption. **Condition 27 itself was not retrievable** (PDF text truncated), so what the issuer may do to a specific holder is [U]. [V for the definitions: [prospectus](https://cdn.robinhood.com/assets/robinhood/legal/rhj_base_prospectus.pdf)]
- **Stock Token contract source was not inspected.** Whether the token has admin roles, a blocklist or an upgradeable proxy is [U]. One secondary article (2 Jul 2026) says stock-token transfers are restricted to whitelisted wallets; that conflicts with Robinhood's own docs and probably describes the 2025 "Classic" tokens on Arbitrum One. Do not rely on it.
- Reported 3 Aug 2026: the US restriction on Stock Tokens is enforced by front-end geoblocking, with the contracts open to any wallet. [S: Bitcoin.com, quoting CoinFello]
- USDG (Paxos, the chain's main dollar asset): `ASSET_PROTECTION_ROLE` can freeze addresses and wipe frozen balances; `PAUSE_ROLE` can pause transfers. [S: Chaos Labs on the [Aave forum](https://governance.aave.com/t/arfc-onboard-usdg-to-aave-v3-core-instance/23271/3), Oct-Dec 2025] Paxos also sits on the Security Council.

**Statements**

- Johann Kerbrat, 20 Aug 2026 (BTC-ECHO, translated from German): "We deliberately built the chain to be permissionless and open to developers." "We see regulation mainly at the level of the individual application"; restrictions "must apply there, not at the level of the entire blockchain". On why an own chain: "we can set these parameters ourselves". [S: [BTC-ECHO](https://www.btc-echo.de/news/robinhood-wir-haben-die-chain-sowohl-fuer-menschen-als-auch-fuer-ki-agenten-gebaut-236045/)]
- Vlad Tenev: no statement found on freezing, compliance controls versus decentralisation, or immutability. [U]

**Names and identity**

- **Robinhood has said nothing found about names or identity being immutable or controllable.** Its docs have no name-service page (the "Lighter Domains" page is about a perps exchange instance, not naming). [V]
- A third-party `.hood` service already exists: HoodDomains announced 14 Jul 2026 via a paid press release, calling its names "permanent" and "self-custodied"; no relationship to Robinhood stated, admin model undisclosed. [S]
- Brand rules in the chain Terms (sections 5.7-5.8) prohibit the shorthand "Hood Chain" in external materials and say users "must not reference Robinhood's stock ticker symbol ($HOOD or HOOD)" in Robinhood Chain content. Scope and applicability to a `.hood` namespace were not analysed; flag for legal review. [V for the clauses]

### 3.2 Inference (not evidence)

1. **Robinhood's revealed model is "open rails, operator-controlled chokepoints".** It disclaims control over third-party contracts and tells the press that regulation belongs at the application layer. At the same time it keeps instant upgrade keys and runs sanctions filtering below the application layer that defeats force inclusion. The words say application-level control; the configuration says chain-level control too.
2. **A locked name registry on this chain would not be operator-proof.** Even with a burned root, the Security Council can upgrade any system contract without delay at 7/8, and the sequencer can refuse any transaction touching a listed address. Locking removes the *name-service team's* power to seize; it does not remove Robinhood's.
3. **Robinhood probably does not need the name service to have a seize function** to meet its own sanctions posture, because it already blocks addresses at the sequencer. That argues that a locked registry is compatible with building on the chain.
4. **For official adoption (Robinhood Wallet integration, an endorsed namespace) Robinhood would probably want takedown ability somewhere**: impersonation of brokers and issuers, tickers and brand names used as names, court orders. Every regulated-firm precedent in section 4 reserves that. Whether Robinhood would insist on protocol-level reassignment or accept display-layer filtering in its own wallet is unknown. Coinbase accepted the latter in its terms for Basenames.
5. **Robinhood has not required its own flagship asset to be freezable at the token level**, as far as its docs show. If that holds after inspecting the contract, it is the strongest sign that Robinhood tolerates non-freezable third-party state on its chain. This rests on docs silence, not on a code read.

---

## 4. Regulated-finance precedent

### 4.1 Payment names and aliases

| System | Operator control | Source |
|---|---|---|
| **PIX keys (Brazil)** | The central bank runs the key directory. Rules announced 6 Mar 2025 require deletion of keys tied to irregular CPF/CNPJ records; about 8 million keys in scope; institutions must check tax-ID status at every key operation. | [S: [meutudo, 7 Mar 2025](https://meutudo.com.br/blog/noticias/2025/03/07/pix-mais-seguro-bacen-impoe-novas-regras-e-exclui-chaves-pix-irregulares/)]. Resolution number [U]. |
| **UPI (India)** | NPCI directed banks and apps to purge deactivated or reassigned mobile numbers using a revocation list "at least once a week", effective 31 Mar 2025; linked UPI services can be deactivated without notice. | [S: [Angel One, 27 Mar 2025](https://www.angelone.in/news/personal-finance/upi-users-risk-losing-access-if-mobile-numbers-arent-updated-by-march-31-2025)]. Original circular not read. |
| **PayPal.Me** | PayPal "may reclaim your PPM Link for any reason"; violations "may result in the immediate termination or suspension of your PPM Link(s)". | [V: [PayPal.Me terms, 5 Sep 2023](https://www.paypal.com/us/legalhub/paypalme-tnc)] |
| **Cash App $cashtags** | Terms not retrievable today. | [U] |
| **Kraken Kraktag** | "We reserve specific Kraktags for impersonation and fraud prevention." Removal/reassignment terms not found. | [V for the quote: [Krak FAQ](https://support.krak.app/articles/krak-faq)]; rest [U] |

Pattern: every regulated alias system found keeps the alias revocable by the operator or scheme, and the retail-payments regulators (BCB, NPCI) have ordered bulk deletions. None treats the alias as the user's property.

### 4.2 Stablecoin freeze powers (nearest on-chain analogy)

- USDC: a `blacklister` role can `blacklist(address)`; Circle cannot destroy frozen funds unilaterally. Roughly $110M frozen cumulative through 2025. Circle's CEO said in Apr 2026 that USDC will not be frozen without a court order; in Mar 2026 Circle froze 16 business wallets tied to a sealed US civil case and restored five. [S: [Spark research](https://www.spark.money/research/stablecoin-blacklisting-sanctions-mechanics)]
- USDT: `addBlackList`, `destroyBlackFunds`. Over $4.2B frozen across 4,000+ addresses cumulative (BlockSec figure); $1.26B in 2025; about 3.6% of blacklisted addresses unfrozen. Tether froze first and a seizure warrant followed about four months later in one litigated case. [S: [Forkast, 2 Sep 2026](https://forkast.news/the-four-month-gap-tether-informal-freezes-and-the-genius-act/); figures differ between sources]
- USDG: freeze and wipe via `ASSET_PROTECTION_ROLE` (section 3.1).
- GENIUS Act (signed 2025): issuers must maintain "technical capabilities, policies, and procedures to block, freeze, and reject specific or impermissible transactions" and be able to comply with a "lawful order", defined as one from a court or authorised agency that identifies accounts with particularity and is subject to review. [S: Spark, Forkast citing s.4(a)(6)(B) and s.2(16); statute text not read]

### 4.3 Is a US broker legally unable to accept an asset it cannot freeze?

No rule found that says so for a name registry. What was found:

- **OFAC FAQ 646 (15 Oct 2021):** "Once a U.S. person determines that they hold virtual currency that is required to be blocked", they "must deny all parties access to that virtual currency". The duty attaches to property the US person holds. [V: [OFAC](https://ofac.treasury.gov/faqs/646)]
- **The freeze mandate in the GENIUS Act is specific to payment-stablecoin issuers.** It does not cover names. [S]

Inference, not legal advice:

- If the name-service team keeps a root key, that key is a control point a court or regulator can direct. An operator with the technical ability to reassign a name can be ordered to. An operator who has provably given it up can only be ordered to do what remains possible (delist from its own front end, stop resolving in its own gateway).
- If **Robinhood itself** operated or held keys to a registry, its sanctions and court-order obligations would attach to those keys, and its own compliance staff would likely prefer to have a blocking mechanism. That is a reason for Robinhood to prefer either (a) holding a takedown power, or (b) not holding any key at all and relying on its chain-level filter.
- Names are not securities or customer funds, so broker-dealer custody and possession-or-control rules are unlikely to be the relevant constraint. Trademark and impersonation exposure is the more realistic pressure. No authority was found on whether DNS-style cybersquatting remedies reach on-chain names. [U]

---

## 5. Middle-ground designs in actual use

| Design | Who uses it | What it gives | Weakness |
|---|---|---|---|
| **Per-TLD irreversible lock, root otherwise live** | ENS `Root.lock` | Operator keeps the root for everything else and can still add namespaces; locked namespace cannot be reassigned. | Registrar-level powers survive (pricing, controllers). Bug fixes need a redeploy and social migration. |
| **Lock later, not at launch** | ENS (root held by multisig 2017-2023, `.eth` locked earlier; NameWrapper upgrade power revoked only in 2024-25 after v2 made it redundant) | Time to find bugs before giving up the fix path. | Users carry seizure risk in the interim; the 2023 advisory shows residual powers are easy to overlook. |
| **DAO-held root plus constitution** | ENS; SuiNS | No single company key. | A promise, amendable by vote; ENS's own forum estimated a handful of delegates could reach quorum in 2022. |
| **Negative-only emergency powers** ("can disable, cannot seize") | ENS Security Council veto; Feb 2026 controllers that can disable a TLD or remove a registrar controller but not add one or move names | Fast response to exploits without a power to take names. | Disabling a non-locked TLD is still a takedown of the whole namespace. |
| **Timelocked admin** | Robinhood Chain routine path (6/8, 7 days); ENS DAO timelock | Notice and exit window. | Useless if an undelayed path also exists, as on Robinhood Chain (7/8, no delay). An exit window means little for a name: you cannot take a name with you. |
| **Per-name locks / fuses** | ENS NameWrapper; ENSv2 roles | The user, not the operator, chooses irrevocability, name by name; subname issuers can prove they cannot rug. | Guarantees end at expiry and depend on every ancestor being locked. |
| **Revocable free tier, non-revocable paid tier** | Farcaster (fnames vs ENS names) | Clear disclosure; moderation where it is cheap, property where users pay. | Two classes of user. |
| **Immutable token, discretionary application** | Fragment/Telegram; Unstoppable (`.coin` resolution switched off, Oct 2022); Coinbase's stated stance for Basenames | Operator can honour court orders and trademark claims in its own app without touching the registry. | The name keeps "existing" but stops working where it matters; critics call it seizure by another name. |
| **Explicit admin seizure in the contract** | Aptos Names (`force_create_or_seize_name`); Uniswap and Farcaster by terms; PayPal.Me, PIX, UPI | Simple, honest, satisfies any court order. | No property guarantee at all. |
| **Chain-level address filtering** | Robinhood Chain (ArbOS 61) | Sanctions compliance without any cooperation from applications. | Blocks an address, not a name; cannot reassign anything. |

**Court-order escape hatches found:** Uniswap ("to comply with a legal requirement or court order"); Unstoppable ("court-ordered blocking or takeover" for domains in its custody); stablecoin freeze roles; Robinhood's chain-level filter. **No example was found of a name service with a narrowly scoped, on-chain, per-name court-order mechanism** (for example a timelocked, publicly logged single-name reassignment). The designs in use are either full admin power or none.

---

## 6. Comparison table

"Seize" = move a registered name to another owner. "Suspend" = stop it working. Blank "ever used" means nothing found, not confirmed never.

| Service | Who controls the root | Can the operator seize / suspend / reassign? | Documented where | Ever used |
|---|---|---|---|---|
| ENS `.eth` (v1) | ENS DAO timelock owns Root; `.eth` locked | Seize: no. Reassign namespace: no (locked). Indirect: DAO sets controllers and prices; 2023 bug allowed shortening registrations | Root.sol; EP 0.1; 2023 advisory [V] | No seizure found. 2020 registry redeploy for a bug |
| ENS other TLDs | ENS DAO | Yes, can create or replace any non-locked TLD | EP 4.10 [V] | [U] |
| ENSv2 | [U] | [U]; proxies and role system, guarantees still being settled | ENSv2 docs, Labs Q2 2026 report [V] | Not live as of Jul 2026 |
| Basenames | Root owner address on Base [U who]; proxies with ProxyAdmin | Technically yes via root owner, registrar owner, proxy admin; no lock in code. Terms say Coinbase "is not able to forcibly remove" | Source code [V]; Base Terms 8 Apr 2026 [V] | None found |
| cb.id | Coinbase (off-chain) | Yes by construction | Coinbase help [V]; Subdomain Terms [U] | [U] |
| uni.eth | Uniswap Labs (off-chain) | Yes: revoke "at our discretion without notice"; reassign for squatting; court orders | Terms 21 Mar 2024 [V]; current wording [U] | [U] |
| Linea Names | [U] | [U]; registration gated by owner-set PoH signer | Audit Jun 2024 [V] | None found |
| Celonames | [U] | [U] | Launch post 12 Nov 2025 [V] | [U] |
| World App usernames | Tools for Humanity / World (presumed) | Presumed yes [U] | ENS case study [V] | [U] |
| SPACE ID `.bnb` / `.arb` | [U] | [U]; controller at V9 | GitHub org [V] | [U] |
| Solana Name Service | Owner of the `.sol` TLD account [U who] | Yes in code: parent owner can transfer a child name | SPL name-service source [V] | [U] |
| SuiNS | NS-token DAO; Foundation veto; emergency council for 2 years | [U] for individual names | Sui docs; Mysten 9 Aug 2024 [V] | [U] |
| Aptos Names | Admin signer | Yes, explicit: seize, clear, re-point, change expiry | Contract source [V] | [U] |
| Unstoppable Domains | Claims no admin; proxy status [U] | Claims no for self-custodied names; yes at resolution layer and for names in its custody | Docs; Terms 10 Jun 2026 [V] | Yes: `.coin` resolution disabled, 116,000+ names, Oct 2022 [S] |
| TON DNS / Fragment | Token on TON; Telegram decides linking | Token: "cannot be revoked, even by Company". Function: Telegram can refuse to link | Fragment terms [V] | Yes: usernames repossessed from Aug 2022 before sale [S] |
| Farcaster fnames | Farcaster team (off-chain server) | Yes: "can be revoked by Farcaster at any time"; reclaim for impersonation, 60 days inactivity, resale | Farcaster docs [V] | Policy active; cases not looked up |
| Lens handles | v2: immutable owner; v3 [U] | v2: no admin seize function shown in interface. v3 [U] | Lens v2 contract docs [V] | [U] |
| PayPal.Me | PayPal | Yes: "may reclaim your PPM Link for any reason" | Terms 5 Sep 2023 [V] | [U] |
| PIX keys | Central Bank of Brazil | Yes: scheme-ordered deletion | BCB rules Mar 2025 [S] | Yes: ~8M keys in scope, 2025 [S] |
| UPI | NPCI / banks | Yes: weekly purge of revoked numbers | NPCI directive Mar 2025 [S] | Yes [S] |
| USDC / USDT / USDG | Issuer | Freeze yes; USDT and USDG can also destroy/wipe | Contracts via secondary analysis [S] | Yes, routinely; $4.2B+ USDT cumulative [S] |
| Robinhood Chain (the chain itself) | Security Council 8 signers; Robinhood 2 seats | Can block addresses at sequencer and STF; can upgrade anything instantly at 7/8 | Docs, Terms 24 Aug 2026, L2Beat [V] | Yes: 6,096 filtered tx hashes per L2Beat [V] |

---

## 7. What this implies for a Robinhood Chain name service

### Evidence

1. ENS is the only service found that removed the operator's power to reassign its main namespace, and it did so with a one-line irreversible lock on one TLD while keeping the root alive for everything else.
2. Even ENS kept significant indirect power (controllers, pricing), discovered in 2023 that this included shortening registrations and seizing wrapped names, and has closed only part of that.
3. ENS fixed its one registry-level bug (2020) by redeploying and migrating socially. The lock did not prevent the fix; it changed how the fix had to be done.
4. Every company-run or chain-run name service examined either keeps the technical power to take names (Basenames in code, Aptos Names explicitly, Solana via parent ownership, all off-chain subname issuers) or could not be verified. **None was found that has locked.**
5. Coinbase, the closest analogue to Robinhood, keeps the power in code while stating in its terms that it cannot remove names and that its permissions are "limited to protocol maintenance".
6. Robinhood Chain filters sanctioned addresses at the sequencer and in the state transition function, keeps instant upgrade keys, and reserves in its terms the right to block wallets. It also says it does not control third-party contracts and that regulation belongs at the application layer.
7. Robinhood's documentation shows no freeze function on Stock Tokens; the contract was not inspected.
8. Robinhood has made no statement found about names.
9. Every regulated payment-alias system examined keeps aliases revocable.

### Inference

1. **Locking is not what peers did, so locking is a differentiator, not a norm.** A team that locks can truthfully say it gives stronger guarantees than Basenames. A team that does not lock is in the mainstream.
2. **On this chain, a lock is a statement about the team, not about Robinhood.** It removes the team's ability to seize or be compelled to seize. Robinhood retains chain-level powers regardless. Marketing a locked `.hood`-style namespace as "unseizable" would overclaim; "the name service operator cannot seize" is the accurate claim.
3. **Robinhood's likely preference, low-to-moderate confidence:** for an independent third-party service, indifference at the protocol level, since the chain filter already covers sanctions. For anything it integrates or endorses, a takedown path for impersonation, trademark and court orders, plausibly satisfied at the wallet/display layer as Coinbase does. There is no direct evidence either way.
4. **The decision is separable into three powers that the ENS code conflates at the root:** (a) reassign the parent namespace to a new registrar (total takeover and the only migration path); (b) control registration, renewal and pricing; (c) take down or reassign an individual name. ENS locked (a), kept (b), never had (c). Aptos kept all three. A middle design would lock (a), time-limit or constrain (b) so durations cannot be shortened, and handle (c) off-chain in the resolver gateway or front end, or not at all.
5. **If the team wants a migration path, the precedents suggest a dated or conditional lock** (lock after audits and a bake-in period, as ENS in effect did) rather than a permanent open root. The cost is that users bear seizure risk until the lock and must trust the stated date.
6. **Keeping the root live makes the team a compellable control point.** That is the main non-technical argument for locking, and the main reason a regulated partner might want the team *not* to lock.
7. **Residual-power audit matters more than the headline lock.** The 2023 ENS advisory is the lesson: after locking (a), enumerate every remaining owner-only function (controllers, resolver for the parent node, wrapper upgrade, price oracle, proxy admins) and decide each one explicitly.

### Open items to close before relying on this

- Read chain state: owner of the Basenames registry root, `BaseRegistrar` owner, `ProxyAdmin` owner; owner and wrap state of `base.eth` on L1; owner of the `.sol` TLD account.
- Inspect a Robinhood Stock Token contract on the explorer (chain ID 4663) for roles, blocklist and proxy.
- Read Condition 27 of the RHJ Base Prospectus.
- SPACE ID: contracts, proxy admin, terms.
- ENSv2: who admins the root and `.eth` registry; outcome of the Feb 2026 security-controller vote, EP 5.27 execution, EP 6.8 result; whether ENSv2 is live.
- Date of the original `.eth` lock transaction and how the lock was handled in the 2020 migration.
- Current Uniswap username terms; Cash App and Kraken username terms; Coinbase cb.id Subdomain Terms.
- Legal review of the Robinhood Chain brand clauses against a `.hood` namespace, and of whether the existing HoodDomains project affects positioning.
- Any Tenev statement on chain-level compliance controls.
