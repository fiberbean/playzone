// lib/utils/slots.ts
import { buildISTDate, getISTParts } from './time';

export interface SlotDef {
  start: Date;
  end: Date;
  label: string;
  startMin: number;
  isPast: boolean;
  isBooked: boolean;
  isPending: boolean;
  isMaintenance: boolean;
}

export interface BookedRange {
  start: string;
  end: string;
  status: 'pending' | 'confirmed' | 'active' | 'maintenance';
}

export interface GenerateSlotsOptions {
  date: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  bookedRanges: BookedRange[];
  nowOverride?: Date | null;
}

export function generateSlots(opts: GenerateSlotsOptions): SlotDef[] {
  const {
    date, openHour, closeHour, slotMinutes,
    bookedRanges, nowOverride,
  } = opts;

  const [y, m, d] = date.split('-').map(Number);
  const now = nowOverride === undefined ? new Date() : nowOverride;

  const slots: SlotDef[] = [];
  const totalMinutes = (closeHour - openHour) * 60;

  for (let offset = 0; offset < totalMinutes; offset += slotMinutes) {
    const startMin = openHour * 60 + offset;
    const endMin = startMin + slotMinutes;

    const startHour = Math.floor(startMin / 60);
    const startMinute = startMin % 60;
    const endHour = Math.floor(endMin / 60);
    const endMinute = endMin % 60;

    const start = buildISTDate(y, m, d, startHour, startMinute);
    const end = buildISTDate(y, m, d, endHour, endMinute);

    const isPast = now !== null && start.getTime() < now.getTime();

    let isBooked = false;
    let isPending = false;
    let isMaintenance = false;

    for (const range of bookedRanges) {
      const rs = new Date(range.start).getTime();
      const re = new Date(range.end).getTime();
      const ss = start.getTime();
      const se = end.getTime();
      const overlaps = ss < re && se > rs;
      if (!overlaps) continue;

      if (range.status === 'maintenance') isMaintenance = true;
      else if (range.status === 'pending') isPending = true;
      else isBooked = true;
    }

    const label = new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric', minute: '2-digit', hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(start);

    slots.push({
      start, end, label, startMin,
      isPast, isBooked, isPending, isMaintenance,
    });
  }

  return slots;
}

export function canBookFrom(
  start: Date,
  durationMin: number,
  bookedRanges: BookedRange[]
): boolean {
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const ss = start.getTime();
  const se = end.getTime();

  for (const range of bookedRanges) {
    const rs = new Date(range.start).getTime();
    const re = new Date(range.end).getTime();
    if (ss < re && se > rs) return false;
  }
  return true;
}

/**
 * List valid durations given a start slot.
 * Returns durations (min) that don't overflow close hour or collide.
 */
export function validDurations(
  start: Date,
  closeHour: number,
  slotMinutes: number,
  minDur: number,
  maxDur: number,
  bookedRanges: BookedRange[]
): number[] {
  const result: number[] = [];

  const closeHourN = Number(closeHour);
  const slotMinutesN = Number(slotMinutes);
  const minDurN = Number(minDur);
  const maxDurN = Number(maxDur);

  if (
    Number.isNaN(closeHourN) ||
    Number.isNaN(slotMinutesN) ||
    Number.isNaN(minDurN) ||
    Number.isNaN(maxDurN)
  ) {
    return [];
  }

  const parts = getISTParts(start);
  const startMin = parts.hour * 60 + parts.minute;
  const closeMin = closeHourN * 60;
  const availableMin = closeMin - startMin;

  for (let d = minDurN; d <= Math.min(maxDurN, availableMin); d += slotMinutesN) {
    const canBook = canBookFrom(start, d, bookedRanges);
    if (canBook) result.push(d);
  }

  return result;
}