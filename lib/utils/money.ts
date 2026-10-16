// lib/utils/money.ts

/** Format ₹1,234 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format ₹1,234.50 (with paise) */
export function formatINRPrecise(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compute amount = hourlyRate × (durationMin / 60), rounded to 2 decimals */
export function calcAmount(hourlyRate: number, durationMin: number): number {
  const raw = hourlyRate * (durationMin / 60);
  return Math.round(raw * 100) / 100;
}

/**
 * Compute cancellation fee + refund.
 * fee = amount × feePct (rounded up to 2 decimals)
 * refund = amount − fee
 */
export function calcCancellation(amount: number, feePct: number) {
  const fee = Math.round(amount * feePct * 100) / 100;
  const refund = Math.round((amount - fee) * 100) / 100;
  return { fee, refund };
}

/** Signed label: "+₹100" or "−₹100" */
export function formatSigned(amount: number, type: 'credit' | 'debit'): string {
  const sign = type === 'credit' ? '+' : '−';
  return `${sign}${formatINR(Math.abs(amount))}`;
}