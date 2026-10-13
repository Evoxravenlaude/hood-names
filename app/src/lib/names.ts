import { ens_normalize } from '@adraffy/ens-normalize';
import { concat, keccak256, toBytes, type Hex } from 'viem';
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

export const labelhash = (label: string): Hex => keccak256(toBytes(label));

export const nodeOf = (label: string): Hex =>
  keccak256(concat([(deployment?.parentNode ?? ('0x' + '0'.repeat(64))) as Hex, labelhash(label)]));

export const subnodeOf = (parentNode: Hex, label: string): Hex =>
  keccak256(concat([parentNode, labelhash(label)]));

export const fullName = (label: string): string => `${label}.${parentName}`;
