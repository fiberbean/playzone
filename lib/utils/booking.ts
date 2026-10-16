// lib/utils/booking.ts
import type { Booking, BookingStatus } from '@/lib/types/booking';
import { formatTimeRange, formatDuration } from './time';
import { formatINR } from './money';

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending Admin',
  confirmed: 'Confirmed',
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  rescheduled: 'Rescheduled',
};

export const STATUS_COLORS: Record<BookingStatus, string> = {
  pending: 'yellow',
  confirmed: 'cyan',
  active: 'blue',
  completed: 'green',
  cancelled: 'red',
  no_show: 'gray',
  rescheduled: 'purple',
};

/** "FIFA 24 • PS4-1" */
export function bookingSummary(b: Booking & {
  game?: { name: string };
  console?: { name: string };
}): string {
  const g = b.game?.name ?? 'Game';
  const c = b.console?.name ?? 'Console';
  return `${g} • ${c}`;
}

/** "Sat, 18 Oct • 5:00 PM – 6:30 PM" — depends on formatters */
export function bookingTimeLine(b: Booking): string {
  return `${formatTimeRange(b.slot_start, b.slot_end)} • ${formatDuration(b.duration_min)}`;
}

/** "₹150" or "₹150 (90% refunded)" depending on status */
export function bookingMoneyLine(b: Booking): string {
  if (b.status === 'cancelled' || b.status === 'rescheduled') {
    return `${formatINR(b.amount)} → refunded ${formatINR(b.refund_amount)}`;
  }
  return formatINR(b.amount);
}

/** Is this booking within the cancellation cutoff window? */
export function isWithinCutoff(
  b: Booking,
  cutoffHours: number,
  now: Date = new Date()
): boolean {
  const cutoffMs = cutoffHours * 60 * 60 * 1000;
  const startMs = new Date(b.slot_start).getTime();
  return now.getTime() >= startMs - cutoffMs;
}

/** Can customer cancel this booking right now? */
export function canCancel(
  b: Booking,
  cutoffHours: number,
  now: Date = new Date()
): boolean {
  if (b.status !== 'pending' && b.status !== 'confirmed') return false;
  return !isWithinCutoff(b, cutoffHours, now);
}

/** Can customer reschedule this booking right now? */
export function canReschedule(
  b: Booking,
  cutoffHours: number,
  now: Date = new Date()
): boolean {
  if (b.status !== 'pending' && b.status !== 'confirmed') return false;
  return !isWithinCutoff(b, cutoffHours, now);
}