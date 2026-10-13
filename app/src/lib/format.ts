import { formatEther, formatUnits, getAddress, type Address } from 'viem';

export const shortAddress = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/** USD amounts in the contracts carry 18 decimals. */
export function usd(amount: bigint | undefined): string {
  if (amount === undefined) return '…';
  const value = Number(formatUnits(amount, 18));
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function eth(amount: bigint | undefined, digits = 6): string {
  if (amount === undefined) return '…';
  const value = Number(formatEther(amount));
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits })} ETH`;
}

export function token(amount: bigint | undefined, decimals: number, symbol: string): string {
  if (amount === undefined) return '…';
  const value = Number(formatUnits(amount, decimals));
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} ${symbol}`;
}

export function date(seconds: bigint | number | undefined): string {
  if (!seconds) return '—';
  return new Date(Number(seconds) * 1000).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ago(seconds: bigint | number | undefined): string {
  if (!seconds) return 'unknown';
  const diff = Date.now() / 1000 - Number(seconds);
  const days = Math.floor(diff / 86400);
  if (days >= 365) return `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''}`;
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(diff / 3600);
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return 'minutes';
}

/** True for any 0x address, whatever its letter case. */
export const isAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

/** A typed address in its checksummed form, or undefined. Letter case is ignored. */
export const toAddress = (s: string): Address | undefined =>
  isAddress(s) ? getAddress(s.trim().toLowerCase()) : undefined;
