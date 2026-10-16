// lib/actions/live.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { getAllSettings } from './settings';

export async function getActiveSessions() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name), profile:profiles(full_name, avatar_url)')
    .eq('status', 'active')
    .order('slot_end', { ascending: true });
  return data ?? [];
}

/**
 * Compute overrun + charge for a session that is ending now.
 * Returns the preview the admin sees before confirming.
 */
export async function computeOverrun(bookingId: string) {
  const supabase = await createClient();
  const settings = await getAllSettings();
  const graceMin = settings.scan_overrun_grace_min as number;
  const roundMin = settings.scan_overrun_round_min as number;

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) throw new Error('Not found');

  const now = new Date();
  const scheduledEnd = new Date(booking.slot_end);
  const overrunMin = Math.max(
    0,
    Math.round((now.getTime() - scheduledEnd.getTime()) / 60000)
  );

  if (overrunMin <= graceMin) {
    return { overrunMin, chargeMin: 0, charge: 0 };
  }

  const billableMin = Math.ceil((overrunMin - graceMin) / roundMin) * roundMin;
  const rate = booking.hourly_rate_snapshot;
  const charge = Math.round((rate * billableMin / 60) * 100) / 100;

  return { overrunMin, chargeMin: billableMin, charge };
}