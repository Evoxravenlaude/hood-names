# Name policy

Draft for review. Not legal advice; have counsel review before publishing.

## What can be registered

A name is 3 to 63 characters, in one of these alphabets:

| Alphabet | Example | Notes |
| --- | --- | --- |
| Latin | `alice`, `café`, `straße` | Letters with accents are accepted |
| Cyrillic | `привет` | |
| Greek | `ελλάδα` | |
| Chinese (Han) | `東京都` | |
| Japanese | `こんにちは`, `東京タワー` | Hiragana, katakana and kanji may be combined |
| Korean | `서울특별시` | Hangul, optionally with Han |

Digits and hyphens can be used with any of them. Not accepted: emoji, symbols, invisible characters, and alphabets not listed above (Arabic, Hebrew, Thai, Devanagari and others, and Vietnamese letters that need stacked accents). More can be added later without affecting existing names.

Other rules:

- **One alphabet per name**, apart from the Japanese and Korean combinations above. `аlice` with a Cyrillic "а" among Latin letters is refused.
- **Case does not exist on-chain.** Interfaces lowercase what the user types (ENSIP-15 normalisation), so `Alice`, `ALICE` and `alice` are one name. An uppercase name submitted directly to the contract is refused.
- No hyphen at the start or end, and no `--` in the third and fourth positions.
- Nothing that reads as a wallet address (`0x` followed by hex digits).
- A name in another alphabet whose every letter is an exact double of a Latin letter is refused (`сосо` typed in Cyrillic).

All of this is enforced by the contracts, so it holds for every interface, including ones this team did not build.

## No lookalikes

Every name has a "skeleton": what it looks like once accents are removed and characters that are easily confused are treated as the same. Two names with the same skeleton cannot both be registered.

| Registered | Refused while it is held |
| --- | --- |
| `alice` | `a1ice`, `alíce` |
| `robinhood` | `r0binhood`, `robínhood`, `robinh00d` |
| `modern` | `modem` ("rn" reads as "m") |
| `straße` | `strasse` |

The comparison uses the Unicode Consortium's published confusables data, plus a small number of additions. It works in both directions and across alphabets. A lookalike becomes available only when the name it resembles has expired and passed its 90-day grace period.

A name is priced on the shortest name it looks like. `corn` reads as `com` and takes its place, so it costs what a three-character name costs.

### Known gaps

Automated lookalike detection is never complete. These pairs are **not** caught today:

- Some Chinese character variants that differ by region, such as 内 and 內.
- Katakana ソ and ン.
- Letter pairs that only look alike in some fonts, such as `cl` and `d`.
- Digit-for-letter swaps beyond `0`/`o` and `1`/`l`, such as `5` for `s`.

The rule also over-blocks on purpose: whoever registers `modern` blocks `modem`.

## Reserved names

Reserved before public registration opens and never sold to the public. Reserving a name also reserves everything that looks like it.

- **The chain operator's marks and products** (`reserved/brand.txt`).
- **Listed tokens and their issuers.** `reserved/tickers.txt` holds the 194 Stock Token tickers in Robinhood's own asset registry (`api.robinhood.com/rhj/assets`), read on 12 October 2026 and matched against a full snapshot of that registry dated 16 September 2026. `reserved/issuers.txt` holds the company and fund names derived from it. Anything Robinhood listed after 16 September may be missing: the list must be pulled again immediately before launch. Details are in `docs/research/STOCK_TOKENS.md`.
- **Support and authority terms**, such as `support`, `admin`, `official`, `security` (`reserved/support.txt`).
- **Regulators and market venues** (`reserved/regulators.txt`).
- **Assets, infrastructure, phishing terms and well-known services** (`reserved/web3.txt`).

One- and two-character tickers need no reservation because names shorter than three characters cannot be registered by anyone.

A reserved name is issued only to its rightful holder, by the owner, and stays reserved so that it cannot be taken by someone else if it later expires. Longer variants such as `brand-help` are not reserved unless listed; see claims below.

## Claims

1. A rights holder writes to the published contact with the name, the right relied on (for example a trademark registration) and proof of authority.
2. For a **reserved** name: once verified, the name is issued to the claimant.
3. For a name **already registered by someone else**: the registrant is notified and has a fixed period to respond. The contracts as built cannot take a registered name from its holder. The remedy is at the interface layer: the name can be marked as disputed or hidden in the official app, explorer listing and SDK warnings, and is not renewed through sponsored programmes.
4. Decisions and their reasons are published.

## Names already held on other registries

At least five other services issue names with the same suffix on separate registries, and the same name can have a different holder on each. This service does not recognise those registrations, and they do not affect availability here.

**Recommended position, for decision:** no first right for holders on other registries. The registries disagree with each other about who holds a name, there is no neutral way to rank them, and a first right would mostly reward whoever squatted earliest elsewhere. Brands and tickers are already protected by the reserved list.

## If the chain operator launches its own names

If the operator launches or designates an official name service that is not this one, the team will ask for holders here to receive the equivalent name there at no charge, and will publish a snapshot of holders to make that possible. No promise is made that the operator will agree.

## What this service does not claim

- It is not affiliated with, endorsed by, or officially connected with the chain operator unless and until the operator says so in writing.
- A name is not proof of identity, account ownership or verification.
- Names are not "unseizable". The chain operator controls the sequencer and can upgrade the chain, and the registry root is not locked (see `ADMIN_POWERS.md`).
- There is no token, and none is planned.
