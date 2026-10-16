// lib/actions/timeCredit.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { TimeCreditType } from '@/lib/types/wallet';

interface TimeCreditInput {
  user_id: string;
  type: TimeCreditType;
  minutes: number;
  source?: string;
  booking_id?: string;
  note?: string;
  expires_at?: string;
}

/** The ONLY way to change time credit. DB trigger updates profile. */
export async function insertTimeCredit(input: TimeCreditInput) {
  const supabase = await createClient();
  const signed =
    input.type === 'earned' || input.type === 'manual'
      ? Math.abs(input.minutes)
      : -Math.abs(input.minutes);

  const { data, error } = await supabase
    .from('time_credit_ledger')
    .insert({
      user_id: input.user_id,
      type: input.type,
      minutes: signed,
      balance_after: 0, // overwritten
      source: input.source ?? null,
      booking_id: input.booking_id ?? null,
      note: input.note ?? null,
      expires_at: input.expires_at ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Grant time credit for a late-arrival scenario (or any admin grant). */
export async function grantTimeCredit(
  userId: string,
  minutes: number,
  source: string,
  note: string,
  bookingId?: string
) {
  const supabase = await createClient();
  const { data: setting } = await supabase
    .from('settings').select('value').eq('key', 'time_credit_expiry_days').single();
  const expiryDays = (setting?.value as number) ?? 90;

  const expiresAt = new Date(
    Date.now() + expiryDays * 24 * 60 * 60 * 1000
  ).toISOString();

  return insertTimeCredit({
    user_id: userId,
    type: 'earned',
    minutes,
    source, note,
    booking_id: bookingId,
    expires_at: expiresAt,
  });
}

/** Use time credit during a booking (creates `used` row) */
export async function useTimeCredit(
  userId: string,
  minutes: number,
  bookingId: string
) {
  return insertTimeCredit({
    user_id: userId,
    type: 'used',
    minutes,
    source: 'booking',
    booking_id: bookingId,
    note: `Applied ${minutes} min to booking`,
  });
}