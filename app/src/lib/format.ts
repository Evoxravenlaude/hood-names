import { formatEther, formatUnits, getAddress, type Address } from 'viem';
import { locale, t } from '../i18n';

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/** USD amounts in the contracts carry 18 decimals. */
export function usd(amount: bigint | undefined): string {
  if (amount === undefined) return '…';
  const value = Number(formatUnits(amount, 18));
  return value.toLocaleString(locale(), {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function eth(amount: bigint | undefined, digits = 6): string {
  if (amount === undefined) return '…';
  const value = Number(formatEther(amount));
  return `${value.toLocaleString(locale(), { maximumFractionDigits: digits })} ETH`;
}

export function token(amount: bigint | undefined, decimals: number, symbol: string): string {
  if (amount === undefined) return '…';
  const value = Number(formatUnits(amount, decimals));
  return `${value.toLocaleString(locale(), { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${symbol}`;
}

export function date(seconds: bigint | number | undefined): string {
  if (!seconds) return '—';
  return new Date(Number(seconds) * 1000).toLocaleDateString(locale() === 'en-US' ? 'en-GB' : locale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** How long ago, in words: "3 days ago", in the page's language. */
export function ago(seconds: bigint | number | undefined): string {
  if (!seconds) return t('unknown');
  const diff = Number(seconds) - Date.now() / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 60) return rtf.format(Math.round(diff / 86400), 'day');
  if (abs < 86400 * 730) return rtf.format(Math.round(diff / (86400 * 30)), 'month');
  return rtf.format(Math.round(diff / (86400 * 365)), 'year');
}

/** How long since a moment, as a length of time: "3 days", in the page's language. */
export function heldFor(seconds: bigint | number | undefined): string {
  if (!seconds) return t('unknown');
  const diff = Math.max(0, Date.now() / 1000 - Number(seconds));
  const unit = (n: number, u: 'minute' | 'hour' | 'day' | 'month' | 'year') =>
    new Intl.NumberFormat(locale(), { style: 'unit', unit: u, unitDisplay: 'long' }).format(Math.max(1, Math.floor(n)));
  if (diff < 3600) return unit(diff / 60, 'minute');
  if (diff < 86400) return unit(diff / 3600, 'hour');
  if (diff < 86400 * 60) return unit(diff / 86400, 'day');
  if (diff < 86400 * 730) return unit(diff / (86400 * 30), 'month');
  return unit(diff / (86400 * 365), 'year');
}

/** A plain number in the page's language: 1,284 or 1 284. */
export const num = (n: number, digits = 0) => n.toLocaleString(locale(), { maximumFractionDigits: digits });
export const pct = (n: number) => n.toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 0 });

/** True for any 0x address, whatever its letter case. */
export const isAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

/** A typed address in its checksummed form, or undefined. Letter case is ignored. */
export const toAddress = (s: string): Address | undefined =>
  isAddress(s) ? getAddress(s.trim().toLowerCase()) : undefined;
