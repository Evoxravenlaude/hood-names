import {
  decodeFunctionData,
  encodeFunctionData,
  formatEther,
  formatUnits,
  slice,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { resolverAbi } from '../abi';
import { deployment, YEAR } from '../config';
import { knownAddressName, knownLabel, knownName } from './names';
import type { WriteArgs } from './tx';

/** A transaction as a person reads it, built from the exact data the wallet will sign. */
export interface Described {
  /** One sentence: what this does. */
  title: string;
  /** Further plain facts. */
  details: string[];
  /** Something to pause on, such as an irreversible transfer. */
  warning?: string;
  contractName: string;
  contract: Address;
  functionName: string;
  /** The first four bytes of the data; wallets show this at the start of the raw data. */
  selector: Hex;
  data: Hex;
  value: bigint;
}

/* Facts the page learns as it loads, used to describe amounts. */
const tokens = new Map<string, { symbol: string; decimals: number }>();
const giftFaces = new Map<string, bigint>();
export const rememberToken = (address: Address, symbol: string, decimals: number) =>
  tokens.set(address.toLowerCase(), { symbol, decimals });
export const rememberGiftFace = (id: bigint, usd: bigint) => giftFaces.set(id.toString(), usd);

const CONTRACT_NAMES: [keyof NonNullable<typeof deployment>, string][] = [
  ['HoodRegistrarController', 'Registrar'],
  ['PublicResolver', 'Records (resolver)'],
  ['ReverseRegistrar', 'Primary names'],
  ['ENSRegistry', 'Name registry'],
  ['BaseRegistrar', 'Name ownership (NFT)'],
  ['NameWrapper', 'Name wrapper'],
  ['HoodResolverPolicy', 'Resolver policy'],
  ['HoodGiftCard', 'Gift cards'],
  ['HoodPointsLedger', 'Points'],
  ['HoodReferralHub', 'Referral earnings'],
  ['Stablecoin', 'Test dollar (tUSD)'],
];

export function contractName(address: Address): string {
  if (!deployment) return 'Contract';
  for (const [key, name] of CONTRACT_NAMES) {
    const a = deployment[key];
    if (typeof a === 'string' && a.toLowerCase() === address.toLowerCase()) return name;
  }
  return 'Contract';
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An address as a person would recognise it. */
function who(address: Address, me?: Address): string {
  if (me && address.toLowerCase() === me.toLowerCase()) return 'your wallet';
  const name = knownAddressName(address);
  if (name) return `${name} (${short(address)})`;
  const c = contractName(address);
  if (c !== 'Contract') return `the ${c} contract`;
  return short(address);
}

const nameOf = (node: Hex) => knownName(node) ?? `a name (${node.slice(0, 10)}…)`;
const years = (seconds: bigint) => {
  const y = Number(seconds) / Number(YEAR);
  return Number.isInteger(y) ? `${y} year${y === 1 ? '' : 's'}` : `${Math.round(Number(seconds) / 86400)} days`;
};
const ethAmount = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString('en-US', { maximumFractionDigits: 6 })} ETH`;
function tokenAmount(token: Address, amount: bigint) {
  const t = tokens.get(token.toLowerCase());
  if (!t) return `${amount.toString()} units of ${short(token)}`;
  return `${Number(formatUnits(amount, t.decimals)).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${t.symbol}`;
}
const usd = (amount: bigint) =>
  Number(formatUnits(amount, 18)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function cards(ids: readonly bigint[], amounts: readonly bigint[]) {
  return ids
    .map((id, i) => {
      const face = giftFaces.get(id.toString());
      return `${amounts[i]} × ${face ? usd(face) : `card #${id}`}`;
    })
    .join(', ');
}

const TEXT_LABELS: Record<string, string> = {
  'com.twitter': 'X',
  'org.telegram': 'Telegram',
  url: 'website',
  avatar: 'avatar',
  description: 'bio',
};

/** One resolver record change, as a sentence. */
function describeRecord(data: Hex, me?: Address): string {
  try {
    const d = decodeFunctionData({ abi: resolverAbi, data });
    const a = d.args as readonly unknown[];
    switch (d.functionName) {
      case 'setAddr':
        if (a.length === 2) {
          const to = a[1] as Address;
          return to === zeroAddress
            ? `Clear the wallet address of ${nameOf(a[0] as Hex)}`
            : `Point ${nameOf(a[0] as Hex)} to ${who(to, me)}`;
        }
        return `Set a ${String(a[1])} address on ${nameOf(a[0] as Hex)}`;
      case 'setText': {
        const key = String(a[1]);
        const value = String(a[2]);
        const label = TEXT_LABELS[key] ?? `"${key}"`;
        if (!value) return `Clear the ${label} of ${nameOf(a[0] as Hex)}`;
        if (value.startsWith('data:image/'))
          return `Set the ${label} of ${nameOf(a[0] as Hex)} to an uploaded image (${Math.round(value.length / 1024)} KB, stored on-chain)`;
        return `Set the ${label} of ${nameOf(a[0] as Hex)} to "${value.length > 80 ? value.slice(0, 77) + '…' : value}"`;
      }
      case 'setName':
        return `Set the name record of ${nameOf(a[0] as Hex)} to "${String(a[1])}"`;
      default:
        return `${d.functionName} on ${nameOf(a[0] as Hex)}`;
    }
  } catch {
    return 'An instruction this page could not read';
  }
}

/**
 * Describes a contract call in plain language. The description is built by
 * encoding the call exactly as the wallet will receive it and decoding that
 * data again, so what is shown here is what will be signed.
 */
export function describe(call: WriteArgs, me?: Address): Described {
  const data = encodeFunctionData({ abi: call.abi as Abi, functionName: call.functionName, args: call.args ?? [] } as never);
  const decoded = decodeFunctionData({ abi: call.abi as Abi, data });
  const a = (decoded.args ?? []) as readonly unknown[];
  const value = call.value ?? 0n;
  const base = {
    contractName: contractName(call.address),
    contract: call.address,
    functionName: decoded.functionName,
    selector: slice(data, 0, 4),
    data,
    value,
  };
  const details: string[] = [];
  let title = `Call ${decoded.functionName} on the ${base.contractName} contract`;
  let warning: string | undefined;

  switch (decoded.functionName) {
    case 'commit':
      title = 'Reserve your chosen name privately (step 1 of 2)';
      details.push('Nothing is paid now apart from the network fee. The name and price are only revealed in step 2, so nobody can take it first.');
      break;
    case 'registerWithPayment':
    case 'register': {
      const reg = a[0] as { label: string; owner: Address; duration: bigint; reverseRecord: number; referrer: Hex; data: readonly Hex[] };
      const pay = a[1] as { token: Address; usePoints: boolean; maxTokenAmount: bigint } | undefined;
      title = `Register ${reg.label}.${deployment?.parentName ?? 'hood'} for ${years(reg.duration)}`;
      details.push(`Owner: ${who(reg.owner, me)}`);
      if (pay && pay.token !== zeroAddress) details.push(`Pay up to ${tokenAmount(pay.token, pay.maxTokenAmount)}`);
      if (value > 0n) details.push(`Send ${ethAmount(value)} (anything above the price is refunded)`);
      if (pay?.usePoints) details.push('Use your gift-card points first');
      for (const r of reg.data) details.push(describeRecord(r, me));
      if (reg.reverseRecord) details.push('Make it your primary name');
      if (reg.referrer && !/^0x0+$/.test(reg.referrer)) {
        const ref = knownLabel(reg.referrer);
        details.push(`Referred by ${ref ? `${ref}.${deployment?.parentName ?? 'hood'}` : 'a name'}`);
      }
      break;
    }
    case 'renewWithPayment':
    case 'renew': {
      const pay = a[3] as { token: Address; usePoints: boolean; maxTokenAmount: bigint } | undefined;
      title = `Renew ${String(a[0])}.${deployment?.parentName ?? 'hood'} for ${years(a[1] as bigint)}`;
      if (pay && pay.token !== zeroAddress) details.push(`Pay up to ${tokenAmount(pay.token, pay.maxTokenAmount)}`);
      if (value > 0n) details.push(`Send ${ethAmount(value)} (anything above the price is refunded)`);
      if (pay?.usePoints) details.push('Use your gift-card points first');
      details.push('The name stays with its current owner.');
      break;
    }
    case 'multicall': {
      const calls = a[0] as readonly Hex[];
      title = calls.length === 1 ? describeRecord(calls[0], me) : `Save ${calls.length} record changes`;
      if (calls.length > 1) for (const c of calls) details.push(describeRecord(c, me));
      break;
    }
    case 'setAddr':
    case 'setText':
      title = describeRecord(data, me);
      break;
    case 'setName':
      title = `Make ${String(a[0])} your primary name`;
      details.push('Apps that support it will show this name instead of your address.');
      break;
    case 'approve':
      title = `Allow the ${contractName(a[0] as Address)} contract to take ${tokenAmount(call.address, a[1] as bigint)}`;
      details.push('Needed once before paying in this token. It covers this payment only.');
      break;
    case 'setSubnodeRecord': {
      if (base.contractName === 'Name wrapper') {
        title = `Create the subname ${String(a[1])}.${nameOf(a[0] as Hex)}`;
        details.push(`Owner: ${who(a[2] as Address, me)}`);
      } else {
        const label = knownLabel(a[1] as Hex) ?? 'a subname';
        title = `Create the subname ${label}.${nameOf(a[0] as Hex)}`;
        details.push(`Owner: ${who(a[2] as Address, me)}`);
      }
      break;
    }
    case 'approveSubnames': {
      const nodes = a[0] as readonly Hex[];
      const on = a[1] as boolean;
      title = `${on ? 'Switch on' : 'Switch off'} ${nodes.map(nameOf).join(', ')}`;
      details.push(on ? 'It will resolve while you own the name above it.' : 'It will stop resolving.');
      break;
    }
    case 'setResolver':
      title = `Use the standard resolver for ${nameOf(a[0] as Hex)}`;
      break;
    case 'safeTransferFrom': {
      if (base.contractName === 'Gift cards') {
        title = `Send ${cards([a[2] as bigint], [a[3] as bigint])} gift card to ${who(a[1] as Address, me)}`;
        warning = 'Gift cards sent to the wrong address cannot be recovered.';
      } else if (base.contractName === 'Name wrapper') {
        title = `Give ${nameOf(('0x' + (a[2] as bigint).toString(16).padStart(64, '0')) as Hex)} to ${who(a[1] as Address, me)}`;
        warning = 'This cannot be undone. The recipient controls the name at once.';
      } else {
        const label = knownLabel(('0x' + (a[2] as bigint).toString(16).padStart(64, '0')) as Hex);
        title = `Give ${label ? `${label}.${deployment?.parentName ?? 'hood'}` : 'this name'} to ${who(a[1] as Address, me)}`;
        warning = 'This cannot be undone. The recipient controls the name at once.';
      }
      break;
    }
    case 'safeBatchTransferFrom':
      title = `Send ${cards(a[2] as bigint[], a[3] as bigint[])} gift cards to ${who(a[1] as Address, me)}`;
      warning = 'Gift cards sent to the wrong address cannot be recovered.';
      break;
    case 'buy':
      title = `Buy ${cards(a[1] as bigint[], a[2] as bigint[])} gift card${(a[2] as bigint[]).some((n) => n > 1n) || (a[1] as bigint[]).length > 1 ? 's' : ''} for ${who(a[0] as Address, me)}`;
      details.push(`Send ${ethAmount(value)} (anything above the price is refunded)`);
      break;
    case 'buyWithToken':
      title = `Buy ${cards(a[3] as bigint[], a[4] as bigint[])} gift card${(a[4] as bigint[]).some((n) => n > 1n) || (a[3] as bigint[]).length > 1 ? 's' : ''} for ${who(a[2] as Address, me)}`;
      details.push(`Pay up to ${tokenAmount(a[0] as Address, a[1] as bigint)}`);
      break;
    case 'redeem':
      title = `Turn ${cards(a[0] as bigint[], a[1] as bigint[])} gift cards into points`;
      details.push('The cards are used up. The points stay in your account and are spent when you choose Points to pay for a name.');
      break;
    case 'withdraw':
      title = `Withdraw your referral earnings in ${a[0] === zeroAddress ? 'ETH' : tokenAmount(a[0] as Address, 0n).replace(/^0 /, '')}`;
      break;
    case 'claim':
      title = 'Claim 1,000 test dollars (no value)';
      details.push('Once every six hours per wallet.');
      break;
  }
  return { ...base, title, details, warning };
}
