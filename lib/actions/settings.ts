// lib/actions/settings.ts
'use server'

import { createClient } from '@/lib/supabase/server'

const NUMERIC_KEYS = new Set([
  'open_hour',
  'close_hour',
  'slot_minutes',
  'min_duration_min',
  'max_duration_min',
  'advance_days',
  'cutoff_hours',
  'cancellation_fee_pct',
  'reschedule_fee_pct',
  'scan_code_length',
  'scan_code_expiry_sec',
  'scan_code_max_attempts',
  'scan_early_minutes',
  'scan_late_minutes',
  'scan_no_show_minutes',
  'scan_overrun_grace_min',
  'scan_overrun_round_min',
  'time_credit_expiry_days',
  'time_credit_min_use_min',
])

const BOOLEAN_KEYS = new Set([
  'scan_enabled',
  'scan_require_code',
  'scan_override_enabled',
])

/**
 * Fetch all settings from DB as a flat key → value map.
 * Numeric keys are coerced to numbers, booleans to booleans.
 * Array values (e.g. reminder_minutes) are passed through.
 */
export async function getAllSettings(): Promise<Record<string, any>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')

  if (error) {
    console.error('[getAllSettings] error:', error)
    return {}
  }

  const result: Record<string, any> = {}
  for (const row of data ?? []) {
    let v = (row as any).value

    // Coerce numeric
    if (NUMERIC_KEYS.has(row.key) && v !== null && v !== undefined) {
      const n = Number(v)
      if (!Number.isNaN(n)) v = n
    }

    // Coerce boolean
    if (BOOLEAN_KEYS.has(row.key) && v !== null && v !== undefined) {
      if (typeof v === 'string') v = v === 'true' || v === '1'
      else v = Boolean(v)
    }

    result[row.key] = v
  }

  return result
}

/**
 * Fetch a single setting by key.
 */
export async function getSetting(key: string): Promise<any> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  return data?.value ?? null
}

/**
 * Update a setting value (admin only — RLS handles auth).
 */
export async function updateSetting(key: string, value: any): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() })

  if (error) throw new Error(error.message)
}