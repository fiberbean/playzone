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

// lib/utils/money.ts

export function getPlayerRate(
  playerRates: Record<string, number> | null | undefined,
  pricingMode: 'flat' | 'pct_discount' | 'amt_discount' | string | null | undefined,
  players: number,
  fallbackRate: number = 0
): number {
  if (!playerRates) return fallbackRate
  const key = String(players)
  const val = Number(playerRates[key] ?? 0)

  // Mode: Flat — direct rate per count
  if (!pricingMode || pricingMode === 'flat') {
    return val > 0 ? val : fallbackRate
  }

  // For discount modes, player_rates['1'] = base rate
  const baseRate = Number(playerRates['1'] ?? fallbackRate)
  if (players === 1) return baseRate

  // Mode: % Discount
  if (pricingMode === 'pct_discount') {
    const disc = Math.min(Math.max(val, 0), 100)
    return Math.round(baseRate * (1 - disc / 100))
  }

  // Mode: ₹ Discount
  if (pricingMode === 'amt_discount') {
    const off = Math.min(Math.max(val, 0), baseRate)
    return Math.max(baseRate - off, 0)
  }

  return baseRate
}

// lib/utils/money.ts

export function getDiscountInfo(baseRate: number, offerRate: number): {
  hasDiscount: boolean
  amount: number
  pct: number
} {
  if (!baseRate || !offerRate || offerRate >= baseRate) {
    return { hasDiscount: false, amount: 0, pct: 0 }
  }
  const amount = baseRate - offerRate
  const pct = Math.round((amount / baseRate) * 100)
  return { hasDiscount: true, amount, pct }
}