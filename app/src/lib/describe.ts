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
import { locale, mark, t } from '../i18n';

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
  ['HoodRegistrarController', mark('Registrar')],
  ['PublicResolver', mark('Records (resolver)')],
  ['ReverseRegistrar', mark('Primary names')],
  ['ENSRegistry', mark('Name registry')],
  ['BaseRegistrar', mark('Name ownership (NFT)')],
  ['NameWrapper', mark('Name wrapper')],
  ['HoodResolverPolicy', mark('Resolver policy')],
  ['HoodGiftCard', mark('Gift cards')],
  ['HoodPointsLedger', mark('Points')],
  ['HoodReferralHub', mark('Referral earnings')],
  ['Stablecoin', mark('Test dollar (tUSD)')],
];

export function contractName(address: Address): string {
  if (!deployment) return mark('Contract');
  for (const [key, name] of CONTRACT_NAMES) {
    const a = deployment[key];
    if (typeof a === 'string' && a.toLowerCase() === address.toLowerCase()) return name;
  }
  return 'Contract';
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An address as a person would recognise it. */
function who(address: Address, me?: Address): string {
  if (me && address.toLowerCase() === me.toLowerCase()) return t('your wallet');
  const name = knownAddressName(address);
  if (name) return `${name} (${short(address)})`;
  const c = contractName(address);
  if (c !== 'Contract') return t('the {name} contract', { name: t(c) });
  return short(address);
}

const nameOf = (node: Hex) => knownName(node) ?? t('a name ({id}…)', { id: node.slice(0, 10) });
const years = (seconds: bigint) => {
  const y = Number(seconds) / Number(YEAR);
  if (Number.isInteger(y)) return y === 1 ? t('1 year') : t('{n} years', { n: y });
  return t('{n} days', { n: Math.round(Number(seconds) / 86400) });
};
const ethAmount = (wei: bigint) => `${Number(formatEther(wei)).toLocaleString(locale(), { maximumFractionDigits: 6 })} ETH`;
function tokenAmount(token: Address, amount: bigint) {
  const known = tokens.get(token.toLowerCase());
  if (!known) return t('{n} units of {token}', { n: amount.toString(), token: short(token) });
  return `${Number(formatUnits(amount, known.decimals)).toLocaleString(locale(), { maximumFractionDigits: 2 })} ${known.symbol}`;
}
const usd = (amount: bigint) =>
  Number(formatUnits(amount, 18)).toLocaleString(locale(), { style: 'currency', currency: 'USD' });

function cards(ids: readonly bigint[], amounts: readonly bigint[]) {
  return ids
    .map((id, i) => {
      const face = giftFaces.get(id.toString());
      return `${amounts[i]} × ${face ? usd(face) : t('card #{id}', { id: id.toString() })}`;
    })
    .join(', ');
}

const TEXT_LABELS: Record<string, string> = {
  'com.twitter': 'X',
  'org.telegram': 'Telegram',
  url: mark('website'),
  avatar: mark('profile picture'),
  description: mark('bio'),
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
            ? t('Clear the wallet address of {name}', { name: nameOf(a[0] as Hex) })
            : t('Point {name} to {who}', { name: nameOf(a[0] as Hex), who: who(to, me) });
        }
        return t('Set a {coin} address on {name}', { coin: String(a[1]), name: nameOf(a[0] as Hex) });
      case 'setText': {
        const key = String(a[1]);
        const value = String(a[2]);
        const label = TEXT_LABELS[key] ? t(TEXT_LABELS[key]) : `"${key}"`;
        const name = nameOf(a[0] as Hex);
        if (!value) return t('Clear the {record} of {name}', { record: label, name });
        if (value.startsWith('data:image/'))
          return t('Set the {record} of {name} to an uploaded image ({kb} KB, stored on-chain)', { record: label, name, kb: Math.round(value.length / 1024) });
        return t('Set the {record} of {name} to “{value}”', { record: label, name, value: value.length > 80 ? value.slice(0, 77) + '…' : value });
      }
      case 'setName':
        return t('Set the name record of {name} to “{value}”', { name: nameOf(a[0] as Hex), value: String(a[1]) });
      default:
        return t('{action} on {name}', { action: d.functionName, name: nameOf(a[0] as Hex) });
    }
  } catch {
    return t('An instruction this page could not read');
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
  let title = t('Call {action} on the {name} contract', { action: decoded.functionName, name: t(base.contractName) });
  const parent = deployment?.parentName ?? 'hood';
  const refund = (v: bigint) => t('Send {amount} (anything above the price is refunded)', { amount: ethAmount(v) });
  let warning: string | undefined;

  switch (decoded.functionName) {
    case 'commit':
      title = t('Reserve your chosen name privately (step 1 of 2)');
      details.push(t('Nothing is paid now apart from the network fee. The name and price are only revealed in step 2, so nobody can take it first.'));
      break;
    case 'registerWithPayment':
    case 'register': {
      const reg = a[0] as { label: string; owner: Address; duration: bigint; reverseRecord: number; referrer: Hex; data: readonly Hex[] };
      const pay = a[1] as { token: Address; usePoints: boolean; maxTokenAmount: bigint } | undefined;
      title = t('Register {name} for {period}', { name: `${reg.label}.${parent}`, period: years(reg.duration) });
      details.push(t('Owner: {who}', { who: who(reg.owner, me) }));
      if (pay && pay.token !== zeroAddress) details.push(t('Pay up to {amount}', { amount: tokenAmount(pay.token, pay.maxTokenAmount) }));
      if (value > 0n) details.push(refund(value));
      if (pay?.usePoints) details.push(t('Use your gift-card points first'));
      for (const r of reg.data) details.push(describeRecord(r, me));
      if (reg.reverseRecord) details.push(t('Make it your primary name'));
      if (reg.referrer && !/^0x0+$/.test(reg.referrer)) {
        const ref = knownLabel(reg.referrer);
        details.push(ref ? t('Referred by {name}', { name: `${ref}.${parent}` }) : t('Referred by a name'));
      }
      break;
    }
    case 'renewWithPayment':
    case 'renew': {
      const pay = a[3] as { token: Address; usePoints: boolean; maxTokenAmount: bigint } | undefined;
      title = t('Renew {name} for {period}', { name: `${String(a[0])}.${parent}`, period: years(a[1] as bigint) });
      if (pay && pay.token !== zeroAddress) details.push(t('Pay up to {amount}', { amount: tokenAmount(pay.token, pay.maxTokenAmount) }));
      if (value > 0n) details.push(refund(value));
      if (pay?.usePoints) details.push(t('Use your gift-card points first'));
      details.push(t('The name stays with its current owner.'));
      break;
    }
    case 'multicall': {
      const calls = a[0] as readonly Hex[];
      title = calls.length === 1 ? describeRecord(calls[0], me) : t('Save {n} record changes', { n: calls.length });
      if (calls.length > 1) for (const c of calls) details.push(describeRecord(c, me));
      break;
    }
    case 'setAddr':
    case 'setText':
      title = describeRecord(data, me);
      break;
    case 'setName':
      title = t('Make {name} your primary name', { name: String(a[0]) });
      details.push(t('Apps that support it will show this name instead of your address.'));
      break;
    case 'approve':
      title = t('Allow the {name} contract to take {amount}', { name: t(contractName(a[0] as Address)), amount: tokenAmount(call.address, a[1] as bigint) });
      details.push(t('Needed once before paying in this token. It covers this payment only.'));
      break;
    case 'setSubnodeRecord': {
      if (base.contractName === 'Name wrapper') {
        title = t('Create the subname {name}', { name: `${String(a[1])}.${nameOf(a[0] as Hex)}` });
        details.push(t('Owner: {who}', { who: who(a[2] as Address, me) }));
      } else {
        const label = knownLabel(a[1] as Hex);
        title = label
          ? t('Create the subname {name}', { name: `${label}.${nameOf(a[0] as Hex)}` })
          : t('Create a subname of {name}', { name: nameOf(a[0] as Hex) });
        details.push(t('Owner: {who}', { who: who(a[2] as Address, me) }));
      }
      break;
    }
    case 'approveSubnames': {
      const nodes = a[0] as readonly Hex[];
      const on = a[1] as boolean;
      title = on ? t('Switch on {names}', { names: nodes.map(nameOf).join(', ') }) : t('Switch off {names}', { names: nodes.map(nameOf).join(', ') });
      details.push(on ? t('It will resolve while you own the name above it.') : t('It will stop resolving.'));
      break;
    }
    case 'setResolver':
      title = t('Use the standard resolver for {name}', { name: nameOf(a[0] as Hex) });
      break;
    case 'safeTransferFrom': {
      if (base.contractName === 'Gift cards') {
        title = t('Send {cards} gift card to {who}', { cards: cards([a[2] as bigint], [a[3] as bigint]), who: who(a[1] as Address, me) });
        warning = t('Gift cards sent to the wrong address cannot be recovered.');
      } else if (base.contractName === 'Name wrapper') {
        title = t('Give {name} to {who}', { name: nameOf(('0x' + (a[2] as bigint).toString(16).padStart(64, '0')) as Hex), who: who(a[1] as Address, me) });
        warning = t('This cannot be undone. The recipient controls the name at once.');
      } else {
        const label = knownLabel(('0x' + (a[2] as bigint).toString(16).padStart(64, '0')) as Hex);
        title = label
          ? t('Give {name} to {who}', { name: `${label}.${parent}`, who: who(a[1] as Address, me) })
          : t('Give this name to {who}', { who: who(a[1] as Address, me) });
        warning = t('This cannot be undone. The recipient controls the name at once.');
      }
      break;
    }
    case 'safeBatchTransferFrom':
      title = t('Send {cards} gift cards to {who}', { cards: cards(a[2] as bigint[], a[3] as bigint[]), who: who(a[1] as Address, me) });
      warning = t('Gift cards sent to the wrong address cannot be recovered.');
      break;
    case 'buy': {
      const many = (a[2] as bigint[]).some((n) => n > 1n) || (a[1] as bigint[]).length > 1;
      const v = { cards: cards(a[1] as bigint[], a[2] as bigint[]), who: who(a[0] as Address, me) };
      title = many ? t('Buy {cards} gift cards for {who}', v) : t('Buy {cards} gift card for {who}', v);
      details.push(refund(value));
      break;
    }
    case 'buyWithToken': {
      const many = (a[4] as bigint[]).some((n) => n > 1n) || (a[3] as bigint[]).length > 1;
      const v = { cards: cards(a[3] as bigint[], a[4] as bigint[]), who: who(a[2] as Address, me) };
      title = many ? t('Buy {cards} gift cards for {who}', v) : t('Buy {cards} gift card for {who}', v);
      details.push(t('Pay up to {amount}', { amount: tokenAmount(a[0] as Address, a[1] as bigint) }));
      break;
    }
    case 'redeem':
      title = t('Turn {cards} gift cards into points', { cards: cards(a[0] as bigint[], a[1] as bigint[]) });
      details.push(t('The cards are used up. The points stay in your account and are spent when you choose Points to pay for a name.'));
      break;
    case 'withdraw':
      title = t('Withdraw your referral earnings in {token}', { token: a[0] === zeroAddress ? 'ETH' : tokenAmount(a[0] as Address, 0n).replace(/^0 /, '') });
      break;
    case 'claim':
      title = t('Claim 1,000 test dollars (no value)');
      details.push(t('Once every six hours per wallet.'));
      break;
  }
  return { ...base, title, details, warning };
}
