# Reserved names

One label per line, lowercase. Lines starting with `#` and blank lines are ignored.

| File | Entries | What it holds |
| --- | --- | --- |
| `brand.txt` | 25 | The chain operator's marks and products |
| `support.txt` | 39 | Terms that imply an official or support role |
| `regulators.txt` | 20 | Regulators, agencies and market venues |
| `web3.txt` | 194 | Assets, infrastructure, phishing terms, roles, well-known services, operator product variants |
| `tickers.txt` | 194 | Stock Token tickers from Robinhood's asset registry |
| `issuers.txt` | 271 | Company and fund names derived from that registry |

`script/ReserveNames.s.sol` applies the six files named in its `_files()` function. **A new file must be added there**, or it is ignored both when reserving and in the check that runs before registration opens.

Reserving a label also reserves everything that looks like it (`r0binhood` with `robinhood`). Entries shorter than three characters are skipped, because nobody can register them. Any other entry the name rules refuse stops the script.

`tickers.txt` and `issuers.txt` come from `https://api.robinhood.com/rhj/assets`, read on 12 October 2026 and matched against a full snapshot of the same registry dated 16 September 2026. Tokens listed after that snapshot may be missing. Pull the list again immediately before launch; the method is in `docs/research/STOCK_TOKENS.md`.

Reservation must happen before public registration opens. A name that has already been sold stays with its holder until it lapses. The contracts start paused, and `OpenRegistration` refuses to run until every entry is reserved on-chain.
