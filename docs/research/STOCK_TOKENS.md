# Robinhood Stock Tokens on Robinhood Chain (chain ID 4663)

Research date: 2026-10-12. Scope: every Stock Token / ETF token in Robinhood's own asset registry.

## Sources and how each was used

Robinhood (official):
- R1. `GET https://api.robinhood.com/rhj/assets` - Robinhood's Stock Token asset registry API, documented at https://docs.robinhood.com/chain/stock-token-apis and linked from https://docs.robinhood.com/chain/stock-tokens . Fetched 2026-10-12. Returns tokenSymbol, tokenName ("<Name> • Robinhood Token"), contract address, chainId 4663, status. The fetch tool truncated the response after the 98th record, so only records 1-98 were read directly from it today.
- R2. `GET https://api.robinhood.com/rhj/prices` (all quotes) - same official API, same record order. Fetched 2026-10-12; truncated after the 154th record. Gives symbol + contract address (no name).
- R3. `GET https://api.robinhood.com/rhj/prices/{symbol}` - official per-symbol quote. Fetched 2026-10-12 for each of the 40 tokens that fell beyond the truncation point of R2; every one returned a quote with a contract address. Unlisted symbols return an error.
- R4. `GET https://api.robinhood.com/rhj/corporate-actions` - official; fetched 2026-10-12; 42 dividend records, all symbols/addresses consistent with the list below.
- R5. https://docs.robinhood.com/chain/contracts ("Token Contracts") - official page. Its Stock Token table is rendered client-side "live from the on-chain asset registry" and did not load in the fetch tool; only the static rows (WETH 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73, USDG 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168) were readable. No dates on the page.

Third party (cross-check / gap-fill only):
- S1. 0xsequence/token-directory, `index/robinhood/erc20.json` (PR #158 "Add all 194 Robinhood stock tokens to Robinhood Chain", https://github.com/0xsequence/token-directory/pull/158 ; file timestamp 2026-09-16T20:30Z; present on master at commit 8fbcc34, 2026-09-28 UTC). The PR states its data was taken directly from Robinhood's `/rhj/assets` registry. It is the only place the complete 194-row registry (with names) could be read untruncated. Used for: the full symbol set, and the names of the 96 tokens beyond the R1 truncation point.
- C1. Chainlink feed directory JSON for Robinhood mainnet (https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json, fetched 2026-10-12, truncated after 52 feeds, ~31 of them "Robinhood <TICKER> / USD"). The docs page https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood has a client-rendered table that did not load. Every Robinhood equity feed ticker seen (SGOV, EWY, GOOGL, QQQ, TSM, COIN, PLTR, RGTI, ORCL, MSTR, RKLB, SPCX, USAR, SPY, TSLA, SNDK, IONQ, CRCL, AMZN, INTC, MU, AAPL, NVDA, DELL, NBIS, CLSK, ASML, BABA, USO, META, MSFT, SLV) is in the list below. Chainlink addresses are feed proxies, not token contracts, and are not used here.
- T1. sqd.dev (updated 2026-08-06) and QuickNode guide: addresses for TSLA, NVDA, AAPL, MSFT, AMZN, GOOGL, META, COIN, SPCX, SPY, QQQ, MSTR, QCOM all match.
- Not reachable: robinhoodchain.blockscout.com (API and token pages failed or rendered empty), robinscan.io (robots-disallowed), CoinGecko/DefiLlama/RWA.xyz not consulted.

Source column key: `R1` = name+address read from /rhj/assets today; `R2` = address read from /rhj/prices today; `R3` = address confirmed via /rhj/prices/{symbol} today; `S1` = name taken from the Sequence snapshot of Robinhood's registry (2026-09-16).

## 1. Token table (194 tokens, alphabetical)

Names are Robinhood's registry names with the " • Robinhood Token" suffix removed. Type is my classification (17 ETFs/ETPs, 177 single-company tokens), not a registry field.

| Ticker | Name | Type | Contract address | Source |
|---|---|---|---|---|
| AAOI | Applied Optoelectronics | Stock | `0x521Cf887E6531c6F667b5BC4D896E5d9bfE8EB2E` | R2 (address); name from S1 |
| AAPL | Apple | Stock | `0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9` | R2 (address); name from S1 |
| ABCL | Abcellera Biologics | Stock | `0x3139D77Ace0cbAA5bDfD38bD1F1911a794AF0B0e` | R3 (address); name from S1 |
| ADBE | Adobe | Stock | `0x232B8ed6377BE97813853B0Ac104c4Cda8378d1B` | R3 (address); name from S1 |
| AEHR | Aehr | Stock | `0x5F604fBA1162193A4388A5DFa56F556f3E133cC2` | R1 (name+address), R2; matches S1 |
| AEIS | Advanced Energy | Stock | `0xfAf9cb261B5FCC1f404Bb10CD39C5c6C1974E612` | R2 (address); name from S1 |
| ALAB | Astera Labs, Inc. | Stock | `0x748c32c3ca24eDf31ea597Db1F3d330a7a6DA3Dc` | R1 (name+address), R2; matches S1 |
| AMAT | Applied Materials | Stock | `0x36046893810a7E7fCE501229d57dc3FC8c8716d0` | R2 (address); name from S1 |
| AMBA | Ambarella | Stock | `0x99D9D8663545151603863C5AcbD6FC3218899009` | R2 (address); name from S1 |
| AMC | AMC Entertainment | Stock | `0x05a3d1Cd21d0C88145E82600E62e7E496e0F222B` | R2 (address); name from S1 |
| AMD | AMD | Stock | `0x86923f96303D656E4aa86D9d42D1e57ad2023fdC` | R1 (name+address), R2; matches S1 |
| AMKR | Amkor Technology | Stock | `0xDd356AA38F40A7b7076755aC854B6FBb1F0D305B` | R3 (address); name from S1 |
| AMZN | Amazon | Stock | `0x12f190a9F9d7D37a250758b26824B97CE941bF54` | R1 (name+address), R2; matches S1 |
| ANET | Arista | Stock | `0x28bABD556b60E53663B8615036479a29c2CDd1Bf` | R2 (address); name from S1 |
| APLD | Applied Digital | Stock | `0xb8DBf92F9741c9ac1c32115E78581f23509916FD` | R1 (name+address), R2; matches S1 |
| APP | AppLovin | Stock | `0xA249BAF1063Af884807C1E1400AEf7784836917E` | R2 (address); name from S1 |
| ASML | ASML Holding NV | Stock | `0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA` | R3 (address); name from S1 |
| ASTS | AST SpaceMobile | Stock | `0x1AF6446f07eb1d97c546AFC8c9544cBDF3AD5137` | R1 (name+address), R2; matches S1 |
| AUR | Aurora Innovation | Stock | `0x373C06c4f7BDe527D7Dae4BA169E42b55E393CeD` | R2 (address); name from S1 |
| AVAV | AeroVironment | Stock | `0xF6290b5e7C26502e2dA514C31509849718EA76A5` | R3 (address); name from S1 |
| AVGO | Broadcom | Stock | `0x156E175DD063a8cE274C50654eF40e0032b3fbcF` | R1 (name+address), R2; matches S1 |
| AXON | Axon | Stock | `0xC27dBD474aF5181c5A8777903690D8D262D12648` | R3 (address); name from S1 |
| AXTI | AXT | Stock | `0x141eEa040c2250eEc0314e336975e81f85f6585e` | R1 (name+address), R2; matches S1 |
| BA | Boeing | Stock | `0x4D21483a44Bf67a86b77E3dA301411880797D452` | R1 (name+address), R2; matches S1 |
| BABA | Alibaba | Stock | `0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4` | R1 (name+address), R2; matches S1 |
| BB | Blackberry | Stock | `0x48E39E56aCdbA37b09020C0b734A613C9a2f100A` | R1 (name+address), R2; matches S1 |
| BE | Bloom Energy | Stock | `0x822CC93fFD030293E9842c30BBD678F530701867` | R3 (address); name from S1 |
| BND | Vanguard Total Bond Market ETF | ETF | `0x2F62fC9fAbb470C690f141c28340eD832bB27020` | R1 (name+address), R2; matches S1 |
| BULL | Webull | Stock | `0xceF9027c7d6985b85f0BA431125073529A947A68` | R1 (name+address), R2; matches S1 |
| CBRS | Cerebras Systems | Stock | `0x5c90450Bbb4273D7b2f17CF6917AEB237A569679` | R1 (name+address), R2; matches S1 |
| CCL | Carnival Corporation | Stock | `0x9651342CeA770aE9a2969Ba2A52611523146aef9` | R1 (name+address), R2; matches S1 |
| CEG | Constellation Energy | Stock | `0xaE517A2903E68bd929Dfd15be875F8369D53e94a` | R1 (name+address), R2; matches S1 |
| CELH | Celsius | Stock | `0x8cF07C5A878945185d327aAa6e33FAa95F95e7bF` | R3 (address); name from S1 |
| CIEN | Ciena | Stock | `0x44f6D488021f8233B9416294d1FE9b1fEe28382d` | R1 (name+address), R2; matches S1 |
| CLOV | Clover Health Investments | Stock | `0x62200915e7DEab1eC7f79fb246daDbB80eACdDd0` | R1 (name+address), R2; matches S1 |
| CLS | Celestica | Stock | `0xBf449977089c718C004a66C554B26B94ef3Ad4De` | R1 (name+address), R2; matches S1 |
| CLSK | CleanSpark | Stock | `0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3` | R1 (name+address), R2; matches S1 |
| COHR | Coherent | Stock | `0x92F9F459F1a9a5AD266b182BE7Bffd1C6c666894` | R2 (address); name from S1 |
| COIN | Coinbase | Stock | `0x6330D8C3178a418788dF01a47479c0ce7CCF450b` | R2 (address); name from S1 |
| COST | Costco | Stock | `0x4EA005168D7F09a7A0Ba9D1DEf21a479950E44C2` | R3 (address); name from S1 |
| CRCL | Circle Internet Group | Stock | `0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5` | R1 (name+address), R2; matches S1 |
| CRDO | Credo Technology Group | Stock | `0x4D67253bc223e6b0e104F1084c1fb2b669dDC41b` | R2 (address); name from S1 |
| CRM | Salesforce | Stock | `0xd95B44124e475743a7589e68F3D74008A5536D44` | R1 (name+address), R2; matches S1 |
| CRWD | CrowdStrike Holdings | Stock | `0xea72Ecca2d0f6bFA1394DBBCff85b52CD4233931` | R1 (name+address), R2; matches S1 |
| CRWV | CoreWeave | Stock | `0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3` | R1 (name+address), R2; matches S1 |
| CSCO | Cisco Systems | Stock | `0xF543967EEBB6f1917992eF0E68De63ab07a5a0dA` | R1 (name+address), R2; matches S1 |
| CTSH | Cognizant | Stock | `0x63D5a3b6939a33f1e75d8Bcd85759858239600DB` | R2 (address); name from S1 |
| CVNA | Carvana | Stock | `0xa4f319104089FE321dc8093C6E707d4fE190A988` | R1 (name+address), R2; matches S1 |
| DDOG | Datadog | Stock | `0x27c99fBde9D0d2AA4f4Bfb4943f237843DdF6958` | R3 (address); name from S1 |
| DELL | Dell | Stock | `0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd` | R1 (name+address), R2; matches S1 |
| DJT | Trump Media & Technology Group | Stock | `0x1D11f0496982706C5e14A514D4E79F2e6BdE4516` | R3 (address); name from S1 |
| DOCN | DigitalOcean | Stock | `0xc02f12B9fe9E707079EC0d546f3050d3F6C1F8bD` | R3 (address); name from S1 |
| ELF | e.l.f. Beauty | Stock | `0x39EC44Bee4F6A116c6F9B8De566848a985C53C60` | R1 (name+address), R2; matches S1 |
| EWT | iShares MSCI Taiwan Capped ETF | ETF | `0x1c690498150252222C275A5CEd69d3A6b1f52D5E` | R3 (address); name from S1 |
| EWY | iShares MSCI South Korea fund | ETF | `0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc` | R1 (name+address), R2; matches S1 |
| F | Ford Motor | Stock | `0x25C288E6D899b9BC30160965aD9644c67e73bE0C` | R2 (address); name from S1 |
| FICO | Fair Isaac | Stock | `0xa48F22A46C0F1C46CA7D111CB6c137c271987180` | R1 (name+address), R2; matches S1 |
| FIG | Figma | Stock | `0x41F4267525a8AFf329540eF24fD83d9044758B33` | R1 (name+address), R2; matches S1 |
| FISV | Fiserv | Stock | `0x9ECe29A4A2397C0a35fb5fA8EE2b9509130a98cc` | R1 (name+address), R2; matches S1 |
| FIX | Comfort Systems | Stock | `0x93Dbb1d2Dc5D63F4abACFF30485273f538Df68Ac` | R1 (name+address), R2; matches S1 |
| FLNC | Fluence Energy | Stock | `0x282e87451E10fA6679BC7D76C69BE44cD3fC777C` | R3 (address); name from S1 |
| FLY | Firefly Aerospace Inc. | Stock | `0x03BC731Ffb162cdd7B98D3C6542bFC291126075d` | R1 (name+address), R2; matches S1 |
| FTNT | Fortinet | Stock | `0x3FB8976980d486084b2eb4a404BD12e72823958f` | R3 (address); name from S1 |
| FUTU | Futu Holdings | Stock | `0xeB30663bDFf0622Ef4e4E5cBb4E975F19f33f51D` | R1 (name+address), R2; matches S1 |
| GE | General Electric | Stock | `0x63b814DDBd6BF339f25Fed8c36158a008D5B373e` | R1 (name+address), R2; matches S1 |
| GEV | GE Vernova | Stock | `0x94B8AAE43A1cCc08Aa64B7D1F29b4D920aF4a0C9` | R2 (address); name from S1 |
| GLD | SPDR Gold Trust | ETF | `0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e` | R1 (name+address), R2; matches S1 |
| GLW | Corning | Stock | `0x7c04E6A3368F2A1DE3874f0e80d2e0A1a9915da6` | R1 (name+address), R2; matches S1 |
| GLXY | Galaxy Digital Inc. | Stock | `0x2D427692E928fa156ec22acfaBaFA0447C5805B7` | R1 (name+address), R2; matches S1 |
| GME | GameStop | Stock | `0x1b0E319c6A659F002271B69dB8A7df2F911c153E` | R2 (address); name from S1 |
| GOOGL | Alphabet Class A | Stock | `0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3` | R1 (name+address), R2; matches S1 |
| HII | Huntington Ingalls | Stock | `0xEB61c0Ed490A367d4E3631cCf8a74B3bfc7E775D` | R3 (address); name from S1 |
| HIMS | Hims & Hers Health | Stock | `0xCceE82fE024c36fA15E1005edE3E9e4787e23D09` | R3 (address); name from S1 |
| HPE | HP Enterprise | Stock | `0x59dd09d4900C2E4B5F75b7c0d4E6796fcc234Cb1` | R3 (address); name from S1 |
| HWM | Howmet Aerospace | Stock | `0xAEa445c5F3DB1a462998ccC422A875A361ee5d99` | R3 (address); name from S1 |
| IBM | IBM | Stock | `0x980dcf6766FA79f5Cf0c4AAdb3ab477ff15a9619` | R2 (address); name from S1 |
| IBRX | ImmunityBio, | Stock | `0x7c148F74ac7445D1F28366b7FcDC6792a9Fcd0Cf` | R3 (address); name from S1 |
| INDA | iShares MSCI India ETF | ETF | `0xACEF2e09adb47aD6aBeBAD9fF06689E60615C2B6` | R3 (address); name from S1 |
| INFQ | Infleqtion | Stock | `0xB853bC83a753342a4f8320ea680b4B1E84118D21` | R1 (name+address), R2; matches S1 |
| INOD | Innodata | Stock | `0xf1953DAB6FaD537488d5A022361FfAa8B4c95eC6` | R2 (address); name from S1 |
| INTC | Intel | Stock | `0xc72b96e0E48ecd4DC75E1e45396e26300BC39681` | R1 (name+address), R2; matches S1 |
| INTU | Intuit | Stock | `0x56d23beE5f41A7120170b0c603Dae30128e460e9` | R1 (name+address), R2; matches S1 |
| IONQ | IonQ | Stock | `0x558378E000D634A36593E338eBacdd6207640EfE` | R2 (address); name from S1 |
| IREN | IREN Limited | Stock | `0xF0AB0c93bE6F41369d302e55db1A96b3c430212D` | R1 (name+address), R2; matches S1 |
| JBL | Jabil Inc. | Stock | `0xEAf2512dFC1bEAc608F8794B3793CD4E02894Aa6` | R2 (address); name from S1 |
| JNJ | Johnson & Johnson | Stock | `0x03DfbBE0AC4E7bCDaFd08eD41A400326B77D8c80` | R2 (address); name from S1 |
| JOBY | Joby Aviation | Stock | `0xb334C5cE741B80B5B671F47F5C269Cb193fe8E24` | R2 (address); name from S1 |
| KLAC | KLA | Stock | `0x96b933C74eCB4A0926b9210cef7b743EF46be2E9` | R3 (address); name from S1 |
| KSS | Kohls Corporation | Stock | `0x12e3c047bf9AeCAF9dDC98c05C31BFD1dd043993` | R2 (address); name from S1 |
| KTOS | Kratos Defense & Security Solutions | Stock | `0x7FD06a4d81cCfA3F351394E144d5191874C31313` | R2 (address); name from S1 |
| LHX | L3Harris | Stock | `0x48d60243c66437c6ac3c2495Be94747aEd5Dfe25` | R1 (name+address), R2; matches S1 |
| LITE | Lumentum | Stock | `0x8eF20885F94e3D9bc7eB3080279188Bd5ED7c08C` | R2 (address); name from S1 |
| LLY | Eli Lilly | Stock | `0x8005d266423c7ea827372c9c864491e5786600ea` | R2 (address); name from S1 |
| LMT | Lockheed | Stock | `0x329fcACEb9AD6F9580DD5F643fed0646900D043c` | R1 (name+address), R2; matches S1 |
| LRCX | Lam Research Corp | Stock | `0x57b0030166DB0C31690d1A5aA167e2e26e2C29a4` | R1 (name+address), R2; matches S1 |
| LULU | Lululemon | Stock | `0x4e62068525Ab11FE768e29dfD00ef909B9803016` | R1 (name+address), R2; matches S1 |
| LUNR | Intuitive Machines | Stock | `0xa5D4968421bA94814Be3B136b15cf422101aC1a3` | R3 (address); name from S1 |
| MDB | MongoDB | Stock | `0xDdf2266b79abf0B48898959B0ed6E6adf512be74` | R3 (address); name from S1 |
| META | Meta Platforms | Stock | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | R1 (name+address), R2; matches S1 |
| MOD | Modine | Stock | `0xc6Cbad1016b38B797610c25E1dc7D95988B1f362` | R1 (name+address), R2; matches S1 |
| MPWR | Monolithic Power Systems | Stock | `0x52D50D0280AD1054b43f052bD70a49a212A1b128` | R2 (address); name from S1 |
| MRNA | Moderna | Stock | `0x43B07D15cE533bEc5476d70C22a78a1B2B662155` | R1 (name+address), R2; matches S1 |
| MRVL | Marvell Technology | Stock | `0x62fd0668e10D8B72339BE2DCF7643001688ff13B` | R2 (address); name from S1 |
| MSFT | Microsoft | Stock | `0xe93237C50D904957Cf27E7B1133b510C669c2e74` | R1 (name+address), R2; matches S1 |
| MSTR | Strategy Inc. | Stock | `0xec262a75e413fAfD0dF80480274532C79D42da09` | R3 (address); name from S1 |
| MTSI | MACOM | Stock | `0xC93f4d80e268AB922e871bd169156C3CC41894e6` | R1 (name+address), R2; matches S1 |
| MU | Micron Technology | Stock | `0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD` | R1 (name+address), R2; matches S1 |
| MXL | MaxLinear | Stock | `0x48961813349333209994750ffA89b3c5C22eC969` | R1 (name+address), R2; matches S1 |
| NAVN | Navan | Stock | `0xf7181b63Fdb858558A74ba96BC42732684cd7965` | R2 (address); name from S1 |
| NBIS | Nebius Group | Stock | `0x9D9c6684F596F66a64C030B93A886D51Fd4D7931` | R2 (address); name from S1 |
| NET | Cloudflare, Inc. Class A common stock | Stock | `0x116F00968269B7bfbaD4109cE591d6E74c0601d4` | R2 (address); name from S1 |
| NFLX | Netflix | Stock | `0xE0444EF8BF4eD74f74FD73686e2ddF4C1c5591E8` | R1 (name+address), R2; matches S1 |
| NNE | Nano Nuclear Energy | Stock | `0xBEF75684C43c4ea7BD18Dd532a2244674Ee8b926` | R1 (name+address), R2; matches S1 |
| NOW | ServiceNow | Stock | `0x0C3260aF4B8f13a69c4c2dFb84fD667890CDFa14` | R2 (address); name from S1 |
| NU | Nu | Stock | `0x408c14038a04f7bD235329E26d2bf569ee20e250` | R1 (name+address), R2; matches S1 |
| NVDA | NVIDIA | Stock | `0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC` | R2 (address); name from S1 |
| NVTS | Navitas Semiconductor | Stock | `0xbE6702d7b70315376dC48a3293f24f0982F86386` | R2 (address); name from S1 |
| OKLO | Oklo | Stock | `0x8B2f88497f15A18E9D4FFa1a8fFB8538399aE774` | R3 (address); name from S1 |
| ON | ON Semiconductor | Stock | `0xbBD09F72b025360FeE5C928053Dca6248d35be54` | R1 (name+address), R2; matches S1 |
| ONTO | Onto Innovation | Stock | `0x8ff63eAeEe3fE54Ba450c4F5538064Ec5A893Aef` | R3 (address); name from S1 |
| ORCL | Oracle | Stock | `0xb0992820E760d836549ba69BC7598b4af75dEE03` | R2 (address); name from S1 |
| OUST | Ouster | Stock | `0x40E7a279850e443f582059ae5dC1c3b6563E6395` | R1 (name+address), R2; matches S1 |
| P | Everpure | Stock | `0x1Cdad396DB64BDa184d5182A97Dd9B3C62100b7D` | R1 (name+address), R2; matches S1 |
| PANW | Palo Alto Networks | Stock | `0xB039597eD45CBa7B6E2fb9E8BE51802969CEe5Be` | R1 (name+address), R2; matches S1 |
| PATH | UiPath | Stock | `0xfb2664f07B6Aadd29ea7a59D8859b1AeB8645cDa` | R2 (address); name from S1 |
| PENG | Penguin Solutions | Stock | `0x9b23573b156B52565012F5cE02CDF60AFBaa70Be` | R2 (address); name from S1 |
| PFE | Pfizer | Stock | `0x7066A64c24e4206CD62E83bf198c1E7EB361F51e` | R3 (address); name from S1 |
| PL | Planet Labs | Stock | `0xAA4d64474c172010aB57719cb9951E6142a100d3` | R2 (address); name from S1 |
| PLTR | Palantir Technologies | Stock | `0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A` | R1 (name+address), R2; matches S1 |
| POET | POET Technologies | Stock | `0xcf6B2D875361be807EAfa57458c80f28521F9333` | R2 (address); name from S1 |
| POWL | Powell Industries | Stock | `0x237c16D66590F67B886d978ACD362EAeaD8B18c7` | R1 (name+address), R2; matches S1 |
| PR | Permian Resources | Stock | `0x4189F0c66EBBB0bfeF1C31f763131361EF32f77C` | R1 (name+address), R2; matches S1 |
| PWR | Quanta | Stock | `0x9Ab02Ead789b6903c3c44d0ED32F9c707CDF12FD` | R2 (address); name from S1 |
| QBTS | D-Wave Quantum Inc. Common Stock | Stock | `0xC583c60aeF9Dc401Da72cEC1B404743a93cea1Cc` | R1 (name+address), R2; matches S1 |
| QCOM | Qualcomm | Stock | `0x0f17206447090e464C277571124dD2688E48AEA9` | R2 (address); name from S1 |
| QQQ | Invesco QQQ | ETF | `0xD5f3879160bc7c32ebb4dC785F8a4F505888de68` | R1 (name+address), R2; matches S1 |
| QUBT | Quantum Computing | Stock | `0x59818904ab4cE163b3cE4FfB64f2D6Ca02c434B4` | R2 (address); name from S1 |
| RBLX | Roblox | Stock | `0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8` | R3 (address); name from S1 |
| RCAT | Red Cat | Stock | `0xFDE6b5d9BB419B10C23268c74e369AbFF39C0460` | R1 (name+address), R2; matches S1 |
| RDDT | Reddit | Stock | `0x05b37Fb53A299a1b874A619e1c4C404D52C36F4C` | R1 (name+address), R2; matches S1 |
| RDW | Redwire | Stock | `0x92Ef19E82bD8fF36661DE838D5eaE7e5CEF0EfFE` | R3 (address); name from S1 |
| RGTI | Rigetti Computing | Stock | `0x284358abc07F9359f19f4b5b4aC91901Be2597Ba` | R1 (name+address), R2; matches S1 |
| RIVN | Rivian Automotive | Stock | `0xB1BF26c1D20ff267A4f93550d1E0d06ac40a114B` | R2 (address); name from S1 |
| RKLB | Rocket Lab Corporation | Stock | `0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2` | R1 (name+address), R2; matches S1 |
| RUN | Sunrun | Stock | `0x756Bc80af765C82da966a788858d65aDF14f3793` | R1 (name+address), R2; matches S1 |
| SATS | EchoStar | Stock | `0x95052ddcd5DC25641657424A8Cf04834997E1730` | R1 (name+address), R2; matches S1 |
| SCHD | Schwab US Dividend Equity ETF | ETF | `0xd63ABB2C13d7a8421a8017a712802053568e3C1D` | R2 (address); name from S1 |
| SGOV | iShares 0-3 Month Treasury Bond | ETF | `0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5` | R1 (name+address), R2; matches S1 |
| SHOP | Shopify | Stock | `0xF53F66751B1Eff985311b693531E3290F600c410` | R2 (address); name from S1 |
| SHY | iShares 1-3 Year Treasury Bond ETF | ETF | `0xBE274710Bf3d9567e1B290eF6a5F9f90ca016FD8` | R2 (address); name from S1 |
| SIMO | Silicon Motion | Stock | `0x77E655E37F4d913fB9540e0d541D824171a60e81` | R1 (name+address), R2; matches S1 |
| SKHY | SK hynix Inc. American Depositary Shares | Stock | `0x84CAb63bc87912E71ad199ff14A0bA45de68FeF8` | R1 (name+address), R2; matches S1 |
| SLS | SELLAS Life Sciences | Stock | `0x285b231728c7E4333799183DF1094d775246a535` | R1 (name+address), R2; matches S1 |
| SLV | iShares Silver Trust | ETF | `0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f` | R3 (address); name from S1 |
| SMCI | Super Micro Computer | Stock | `0xc01aA1fECeC0605b13bc84874ff7256C0f5F562a` | R1 (name+address), R2; matches S1 |
| SMH | VanEck Semiconductor ETF | ETF | `0x072f979c2CAc8e1391B0162a87Fee094bF8744a0` | R2 (address); name from S1 |
| SMR | NuScale Power | Stock | `0x1Eebee7F74517e0279dFb09d25B0407bEEc3FDd6` | R2 (address); name from S1 |
| SNAP | Snap | Stock | `0xF6589F11Bc40b669e584073F428B05562F568733` | R1 (name+address), R2; matches S1 |
| SNDK | Sandisk Corporation | Stock | `0xB90A19fF0Af67f7779afF50A882A9CfF42446400` | R1 (name+address), R2; matches S1 |
| SNOW | Snowflake | Stock | `0xBa0CAB75495255d0cB58E22B648bFED4ECD1F47E` | R1 (name+address), R2; matches S1 |
| SOFI | SoFi Technologies | Stock | `0x98E75885157C80992A8D41b696D8c9C6Fb30A926` | R3 (address); name from S1 |
| SOUN | SoundHound AI | Stock | `0x6E3Dfd9f7e1649BaA14D25cac18C94d62dB10A54` | R2 (address); name from S1 |
| SOXX | iShares Semiconductor ETF | ETF | `0x75742c18BC1f1C5c5f448f4C9D9C6F66dafAAa38` | R3 (address); name from S1 |
| SPCX | Space Exploration Technologies Corp. Class A Common Stock | Stock | `0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa` | R1 (name+address), R2; matches S1 |
| SPMO | Invesco S&P 500 Momentum ETF | ETF | `0xAd622320e520de39e72d41EF07438C3Fd3354875` | R3 (address); name from S1 |
| SPY | SPDR S&P 500 ETF Trust | ETF | `0x117cc2133c37B721F49dE2A7a74833232B3B4C0C` | R1 (name+address), R2; matches S1 |
| TE | T1 Energy | Stock | `0xb1969f6604CA1AE7a2cD3F1827876e914594CA2D` | R2 (address); name from S1 |
| TEAM | Atlassian Corporation | Stock | `0x5B97476b922F3305131B8f0B9D333172E87f4aaE` | R1 (name+address), R2; matches S1 |
| TEM | Tempus AI | Stock | `0xB1CC0EC7Db69Cf43539119814df40071b9d61793` | R1 (name+address), R2; matches S1 |
| TER | Teradyne | Stock | `0x2778C5024D5cA2CdB0f8eAD671ffc69963AdCD9C` | R1 (name+address), R2; matches S1 |
| TSEM | Tower Semiconductor | Stock | `0x89776d4Cd68193597A2fC132cfaC1fDe36CCeA8a` | R1 (name+address), R2; matches S1 |
| TSLA | Tesla | Stock | `0x322F0929c4625eD5bAd873c95208D54E1c003b2d` | R3 (address); name from S1 |
| TSM | Taiwan Semiconductor Manufacturing | Stock | `0x58FfE4a942d3885bAa22D7520691F611EF09e7AA` | R1 (name+address), R2; matches S1 |
| TTD | Trade Desk | Stock | `0x0b5fb4031cae9163db10B169Ee72685F0EdC8545` | R3 (address); name from S1 |
| TTWO | Take-Two Interactive Software | Stock | `0x5e81213613b6B86EaB4c6c50d718d34359459786` | R1 (name+address), R2; matches S1 |
| UMC | United Microelectronics | Stock | `0x0E6e67Ba88e7b5d9B67636A215c76779B948dE79` | R2 (address); name from S1 |
| UNH | UnitedHealth | Stock | `0xcF364ea52787e289De6F32077834056E3E70D6A8` | R1 (name+address), R2; matches S1 |
| UPS | UPS | Stock | `0xf23250dac154D05Bb671CB0d0eBEf3c635c79CE2` | R1 (name+address), R2; matches S1 |
| USAR | USA Rare Earth | Stock | `0xd917B029C761D264c6A312BBbcDA868658eF86a6` | R1 (name+address), R2; matches S1 |
| USO | United States Oil Fund | ETF | `0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344` | R2 (address); name from S1 |
| VICR | Vicor | Stock | `0x6006ed4B2F94110851ff7509D97D034f0EeD9226` | R1 (name+address), R2; matches S1 |
| VRT | Vertiv | Stock | `0xFA78C12E6488814A0262E4e802749a4a737d5fB7` | R2 (address); name from S1 |
| VSAT | ViaSat | Stock | `0x26dCbfb34FC83CAbD6990f449674efDc6097fF85` | R3 (address); name from S1 |
| VST | Vistra | Stock | `0x561e2a49212b7cCF47f2744Ccb83e200722fADBc` | R1 (name+address), R2; matches S1 |
| VTI | Vanguard Morningstar Total Stock Market ETF | ETF | `0x0594134DF3f171a354D9C85eBD65b7A6148F6D09` | R1 (name+address), R2; matches S1 |
| WDAY | Workday | Stock | `0x82DA4646242e1D962e96e932269Dc644c94a9CaA` | R1 (name+address), R2; matches S1 |
| WDC | Western Digital | Stock | `0xF52597345A8Edf418bc4071b4a35112472277D3e` | R1 (name+address), R2; matches S1 |
| WULF | TeraWulf | Stock | `0x348Be1A8663f15edDe5CDf8A96BB69078f7aB6Fd` | R3 (address); name from S1 |
| WYFI | WhiteFiber, Inc. | Stock | `0x9e7ABD3C9139D14E4c86DcE0e455AAB7A0C2FB3E` | R1 (name+address), R2; matches S1 |
| XLK | State Street Technology Select Sector SPDR ETF | ETF | `0x15Cd20759CE7F3285c29A319dE2D1A2e098c6f43` | R2 (address); name from S1 |
| XNDU | Xanadu Quantum | Stock | `0xA8eB3BCcbf2017eE7CBfb652eB51CF2E1B153289` | R3 (address); name from S1 |
| XOM | ExxonMobil Holdings Corporation | Stock | `0xf9B46d3D1B22199D4D1025a9cEDB540A33F1a2d5` | R2 (address); name from S1 |
| ZM | Zoom | Stock | `0x44c4F142009036cF477eD2d09932051843137CF1` | R3 (address); name from S1 |
| ZS | Zscaler | Stock | `0x7dc013eB55e436f30d7ED1AFE4E36d6e45e3c3f7` | R2 (address); name from S1 |

Notes on individual rows:
- SPCX (SpaceX): registry name is "Space Exploration Technologies Corp. Class A Common Stock"; third-party coverage from mid-2026 described it as a private-company token. No other token in the registry is identifiable as a private-company token.
- IBRX registry name is literally "ImmunityBio," (truncated in the source).
- P = "Everpure" (registry name; formerly Pure Storage ticker). VTI name in registry is "Vanguard Morningstar Total Stock Market ETF"; XLK is "State Street Technology Select Sector SPDR ETF".
- Non-stock tokens on the same chain that are NOT in this list: WETH, USDG (Global Dollar), USDC.

## 2. Ticker symbols (lowercase, one per line)

```
aaoi
aapl
abcl
adbe
aehr
aeis
alab
amat
amba
amc
amd
amkr
amzn
anet
apld
app
asml
asts
aur
avav
avgo
axon
axti
ba
baba
bb
be
bnd
bull
cbrs
ccl
ceg
celh
cien
clov
cls
clsk
cohr
coin
cost
crcl
crdo
crm
crwd
crwv
csco
ctsh
cvna
ddog
dell
djt
docn
elf
ewt
ewy
f
fico
fig
fisv
fix
flnc
fly
ftnt
futu
ge
gev
gld
glw
glxy
gme
googl
hii
hims
hpe
hwm
ibm
ibrx
inda
infq
inod
intc
intu
ionq
iren
jbl
jnj
joby
klac
kss
ktos
lhx
lite
lly
lmt
lrcx
lulu
lunr
mdb
meta
mod
mpwr
mrna
mrvl
msft
mstr
mtsi
mu
mxl
navn
nbis
net
nflx
nne
now
nu
nvda
nvts
oklo
on
onto
orcl
oust
p
panw
path
peng
pfe
pl
pltr
poet
powl
pr
pwr
qbts
qcom
qqq
qubt
rblx
rcat
rddt
rdw
rgti
rivn
rklb
run
sats
schd
sgov
shop
shy
simo
skhy
sls
slv
smci
smh
smr
snap
sndk
snow
sofi
soun
soxx
spcx
spmo
spy
te
team
tem
ter
tsem
tsla
tsm
ttd
ttwo
umc
unh
ups
usar
uso
vicr
vrt
vsat
vst
vti
wday
wdc
wulf
wyfi
xlk
xndu
xom
zm
zs
```

## 3. Issuer / brand name labels (lowercase, one per line)

Derived by me from the registry names (not an official list): full name without punctuation plus obvious short brand forms. Includes ETF sponsor brands. Deduplicated and sorted.

```
abcellera
abcellerabiologics
adobe
advancedenergy
advancedmicrodevices
aehr
aehrtestsystems
aerovironment
alibaba
alphabet
amazon
ambarella
amcentertainment
amctheatres
amd
amkor
amkortechnology
apple
applieddigital
appliedmaterials
appliedoptoelectronics
applovin
arista
aristanetworks
asml
asmlholding
astera
asteralabs
astspacemobile
atlassian
aurora
aurorainnovation
axon
axt
blackberry
blackrock
bloomenergy
boeing
broadcom
carnival
carnivalcorporation
carvana
celestica
celsius
cerebras
cerebrassystems
charlesschwab
ciena
circle
circleinternetgroup
cisco
ciscosystems
cleanspark
cloudflare
cloverhealth
cognizant
coherent
coinbase
comfortsystems
constellation
constellationenergy
coreweave
corning
costco
credo
credotechnology
crowdstrike
datadog
dell
delltechnologies
digitalocean
dwave
dwavequantum
echostar
elf
elfbeauty
elililly
everpure
exxon
exxonmobil
facebook
fairisaac
fico
figma
firefly
fireflyaerospace
fiserv
fluence
fluenceenergy
ford
fordmotor
fortinet
futu
futuholdings
galaxy
galaxydigital
gamestop
geaerospace
generalelectric
gevernova
google
hers
hewlettpackardenterprise
hims
himsandhers
howmet
howmetaerospace
hpe
hpenterprise
huntingtoningalls
hynix
ibm
immunitybio
infleqtion
innodata
intel
intuit
intuitivemachines
invesco
invescoqqq
ionq
iren
ishares
isharesmsciindia
isharesmscisouthkorea
isharesmscitaiwan
isharessilvertrust
jabil
joby
jobyaviation
johnsonandjohnson
johnsonjohnson
kla
kohls
kratos
l3harris
lamresearch
lilly
lockheed
lockheedmartin
lululemon
lumentum
macom
marvell
marvelltechnology
maxlinear
meta
metaplatforms
micron
microntechnology
microsoft
microstrategy
moderna
modine
mongodb
monolithicpower
monolithicpowersystems
nanonuclear
nanonuclearenergy
navan
navitas
navitassemiconductor
nebius
nebiusgroup
netflix
nu
nubank
nuscale
nuscalepower
nvidia
oklo
onsemi
onsemiconductor
onto
ontoinnovation
oracle
ouster
palantir
paloalto
paloaltonetworks
penguin
penguinsolutions
permianresources
pfizer
planet
planetlabs
poet
poettechnologies
powell
powellindustries
qualcomm
quanta
quantaservices
quantumcomputing
redcat
reddit
redwire
rigetti
rigetticomputing
rivian
robinhood
roblox
rocketlab
salesforce
sandisk
schwab
sellas
sellaslifesciences
servicenow
shopify
siliconmotion
skhynix
snap
snapchat
snowflake
sofi
soundhound
soundhoundai
sp500
spacemobile
spacex
spdr
spdrgold
spdrgoldtrust
statestreet
strategy
sunrun
supermicro
supermicrocomputer
t1energy
taiwansemiconductor
taketwo
taketwointeractive
tempus
tempusai
teradyne
terawulf
tesla
thetradedesk
tower
towersemiconductor
tradedesk
trumpmedia
trumpmediatechnologygroup
truthsocial
tsmc
uipath
umc
unitedhealth
unitedhealthgroup
unitedmicroelectronics
unitedparcelservice
unitedstatesoilfund
ups
usarareearth
uscf
vaneck
vanguard
vanguardtotalbondmarket
vertiv
viasat
vicor
vistra
webull
westerndigital
whitefiber
workday
xanadu
xanaduquantum
zoom
zscaler
```

(271 labels. `robinhood` and `blackrock` (iShares sponsor) added as issuer-level names; Robinhood itself, ticker HOOD, has no Stock Token in the registry.)

## 4. Completeness

- Official count: Robinhood publishes no headline count on its docs pages. The registry API itself is the list. As of the Sequence snapshot of that registry on 2026-09-16 it held 194 tokens (all ASSET_STATUS_ACTIVE per the PR).
- Captured: 194 of 194. Today (2026-10-12) all 194 were re-confirmed against Robinhood's own API: 154 by direct read of the registry/price list (addresses identical to the snapshot, zero mismatches), 40 by individual `/rhj/prices/{symbol}` calls (all returned the expected address).
- Not verified: whether Robinhood added tokens after 2026-09-16. The fetch tool truncates the API response (~76-81k characters), so the tail of today's registry could not be read. Evidence against new additions is indirect: the first 154 records of today's response contain no symbol absent from the September snapshot; today's corporate-actions feed (42 records) contains no new symbol; and 36 plausible unlisted tickers probed individually all returned errors (HOOD, UBER, DIS, WMT, JPM, V, KO, ARM, MARA, IWM, TLT, VOO, IBIT, GOOG, PYPL, NIO, OPEN, BMNR, NVO, DKNG, TXN, STX, ADI, CCJ, MP, ACHR, RIOT, MA, NKE, SPOT, TQQQ, DIA, CVX, AFRM, LCID, BAC). A handful of post-September listings could still exist. To close this gap, run `curl https://api.robinhood.com/rhj/assets | jq -r '.assets[].tokenSymbol' | wc -l` from a machine with normal internet access and diff against section 2.
- Names for 96 tokens (those beyond record 98 of today's /assets read) come from the Sequence copy of the registry rather than a direct read today; addresses for all 194 were confirmed directly today.
- Some quotes carry stale `generatedAt` timestamps (e.g. COST 2026-08-11, BE/ASML/AMKR 2026-08-14, AVAV 2026-08-14, DJT 2026-09-02, INDA 2026-09-02, HIMS 2026-09-04, RBLX 2026-09-05, SLV 2026-09-30, ABCL 2026-10-01), which may mean those tokens are not actively quoted/tradable; they are still served by the API and were active in the registry on 2026-09-16. Their current registry status was not readable today.
- Earlier research figure of "roughly 95" Chainlink feeds could not be confirmed (table did not render; JSON truncated at 52 feeds). Chainlink coverage is a subset of the registry, not a list of tokens.
- Robinhood's docs state a Stock Token is identified by its canonical contract address, not by name or ticker; look-alike tokens with the same tickers exist on the chain.
