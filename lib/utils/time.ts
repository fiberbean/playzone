// lib/utils/time.ts
import { TIMEZONE } from '@/lib/constants/policies';

/** Format a Date/ISO string as "5:00 PM" in IST */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  }).format(d);
}

/** Format "Sat, 18 Oct 2026" */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(d);
}

/** Format "18 Oct 2026" (short) */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(d);
}

/** Format "18 Oct, 3:42 PM" */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  }).format(d);
}

/** Format duration: 90 → "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** "5:00 PM – 6:30 PM" */
export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/**
 * Get the IST date parts of a given date.
 * Returns { year, month, day, hour, minute, weekday } in IST.
 */
export function getISTParts(date: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-IN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    weekday: 'short',
    timeZone: TIMEZONE,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map(p => [p.type, p.value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

/**
 * Build a Date from an IST date + hour + minute.
 * Returns a UTC Date (correct absolute time).
 */
export function buildISTDate(
  year: number, month: number, day: number,
  hour: number, minute: number
): Date {
  // IST = UTC+5:30 → subtract 5h30m to get UTC
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMs);
}

/** Today's IST date as YYYY-MM-DD */
export function todayIST(): string {
  const p = getISTParts();
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Add N days to an IST YYYY-MM-DD string */
export function addDaysIST(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}