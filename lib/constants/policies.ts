// lib/constants/policies.ts
// Fallback defaults — actual values loaded from Supabase `settings` table.
// NEVER hardcode business values in components. Always read from settings.

export const POLICY_DEFAULTS = {
  zone_name: 'Power Play Gaming Zone',
  zone_upi_id: 'playzone@upi',
  zone_phone: '',

  open_hour: 9,
  close_hour: 21,
  slot_minutes: 30,
  min_duration_min: 30,
  max_duration_min: 240,
  advance_days: 3,

  cancellation_fee_pct: 0.10,
  reschedule_fee_pct: 0.10,
  cutoff_hours: 2,

  reminder_minutes: [10, 5, 2, 0],
  booking_start_reminders: [30, 10],

  scan_enabled: true,
  scan_require_code: true,
  scan_code_length: 4,
  scan_code_expiry_sec: 120,
  scan_code_max_attempts: 3,
  scan_override_enabled: true,
  scan_early_minutes: 15,
  scan_late_minutes: 15,
  scan_no_show_minutes: 20,
  scan_overrun_grace_min: 5,
  scan_overrun_round_min: 30,

  time_credit_expiry_days: 90,
  time_credit_min_use_min: 15,
} as const;

export type PolicyKey = keyof typeof POLICY_DEFAULTS;

// Static constants that never change
export const TIMEZONE = 'Asia/Kolkata';
export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'active',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
] as const;

export const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'active'] as const;