import { ens_normalize } from '@adraffy/ens-normalize';
import { concat, keccak256, toBytes, type Address, type Hex } from 'viem';
import { deployment, parentName } from '../config';

export type Parsed =
  | { ok: true; label: string; typed: string; folded: boolean }
  | { ok: false; typed: string; reason: string };

/**
 * Turns what someone typed into a label, the way every ENS-style interface
 * does (ENSIP-15). Capitals are folded here; the contracts then decide
 * whether the label is allowed and whether it looks like another name.
 */
export function parseLabel(input: string): Parsed {
  let typed = input.trim();
  const suffix = '.' + parentName;
  if (typed.toLowerCase().endsWith(suffix)) typed = typed.slice(0, -suffix.length);
  if (!typed) return { ok: false, typed, reason: 'Type a name.' };
  let label: string;
  try {
    label = ens_normalize(typed);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, typed, reason: explainNormalize(message) };
  }
  if (label.includes('.'))
    return { ok: false, typed, reason: 'A name cannot contain a dot. Subnames are made from a name you own.' };
  const length = [...label].length;
  if (length < 3) return { ok: false, typed, reason: 'Names are at least 3 characters.' };
  if (length > 63) return { ok: false, typed, reason: 'Names are at most 63 characters.' };
  return { ok: true, label, typed, folded: label !== typed };
}

function explainNormalize(message: string): string {
  if (/disallowed|invalid character/i.test(message)) return 'That name has a character that is not allowed.';
  if (/illegal mixture|whole-script/i.test(message))
    return 'That name mixes alphabets in a way that is not allowed.';
  if (/empty label/i.test(message)) return 'A name cannot be empty.';
  return 'That is not a valid name.';
}

/*
 * What this page knows about hashes and addresses it has worked with, so a
 * transaction can be described in names ("pay.sage.hood") rather than hashes.
 */
const labelsByHash = new Map<string, string>();
const namesByNode = new Map<string, string>();
const namesByAddress = new Map<string, string>();

export const labelhash = (label: string): Hex => {
  const hash = keccak256(toBytes(label));
  labelsByHash.set(hash.toLowerCase(), label);
  return hash;
};

export const fullName = (label: string): string => `${label}.${parentName}`;

export const nodeOf = (label: string): Hex => {
  const node = keccak256(concat([(deployment?.parentNode ?? ('0x' + '0'.repeat(64))) as Hex, labelhash(label)]));
  namesByNode.set(node.toLowerCase(), fullName(label));
  return node;
};

export const subnodeOf = (parentNode: Hex, label: string): Hex => {
  const node = keccak256(concat([parentNode, labelhash(label)]));
  const parent = namesByNode.get(parentNode.toLowerCase());
  if (parent) namesByNode.set(node.toLowerCase(), `${label}.${parent}`);
  return node;
};

export const knownLabel = (hash: Hex) => labelsByHash.get(hash.toLowerCase());
export const knownName = (node: Hex) => namesByNode.get(node.toLowerCase());
export const rememberNode = (node: Hex, name: string) => namesByNode.set(node.toLowerCase(), name);
const addressesByName = new Map<string, string>();
export const rememberAddressName = (address: Address, name: string) => {
  const before = addressesByName.get(name);
  if (before && before !== address.toLowerCase() && namesByAddress.get(before) === name) namesByAddress.delete(before);
  addressesByName.set(name, address.toLowerCase());
  namesByAddress.set(address.toLowerCase(), name);
};
export const knownAddressName = (address: Address) => namesByAddress.get(address.toLowerCase());
