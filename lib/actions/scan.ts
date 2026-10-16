// lib/actions/scan.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getAllSettings } from './settings';
import { confirmBooking, startSession, endSession } from './bookings';
import { insertWalletTxn } from './wallet';
import { createNotification } from './notifications';

/**
 * Called when admin scans a QR code.
 * Returns booking + creates a scan_challenge if code is required.
 */
export async function scanQR(qrPayload: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const requireCode = settings.scan_require_code as boolean;
  const codeLen = settings.scan_code_length as number;
  const expirySec = settings.scan_code_expiry_sec as number;

  // QR format: playzone://booking/{id}  OR  just the uuid
  const bookingId = qrPayload.startsWith('playzone://booking/')
    ? qrPayload.replace('playzone://booking/', '')
    : qrPayload;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name), profile:profiles(full_name, avatar_url, email)')
    .eq('id', bookingId)
    .single();

  if (!booking) throw new Error('Booking not found');

  // Determine scan type based on current status
  let scanType: 'in' | 'out';
  if (booking.status === 'pending' || booking.status === 'confirmed') {
    scanType = 'in';
  } else if (booking.status === 'active') {
    scanType = 'out';
  } else {
    throw new Error(`Booking is ${booking.status} — cannot scan`);
  }

  if (!requireCode) {
    // Direct action
    await executeScan(booking, scanType, 'qr');
    return { booking, scanType, requireCode: false };
  }

  // Generate code
  const code = generateCode(codeLen);
  const expiresAt = new Date(Date.now() + expirySec * 1000).toISOString();

  await supabase.from('scan_challenges').insert({
    booking_id: booking.id,
    scan_type: scanType,
    code,
    expires_at: expiresAt,
    max_attempts: settings.scan_code_max_attempts as number,
  });

  // Push to customer via Realtime (they read from scan_challenges subscription)
  await createNotification({
    user_id: booking.user_id,
    type: 'system',
    title: '🔑 Check-in code',
    body: `Show code to admin: ${code}`,
    booking_id: booking.id,
    priority: 'urgent',
    channels: ['in_app', 'sound'],
  });

  return {
    booking,
    scanType,
    requireCode: true,
    challengeId: null, // client fetches latest challenge
  };
}

/**
 * Verify the 4-digit code entered by admin.
 */
export async function verifyScanCode(bookingId: string, enteredCode: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get latest unverified challenge
  const { data: challenge } = await supabase
    .from('scan_challenges')
    .select('*')
    .eq('booking_id', bookingId)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!challenge) throw new Error('No active code. Rescan QR.');

  if (new Date(challenge.expires_at) < new Date()) {
    throw new Error('Code expired. Please rescan.');
  }

  if (challenge.attempts >= challenge.max_attempts) {
    throw new Error('Too many attempts. Please rescan.');
  }

  if (challenge.code !== enteredCode) {
    await supabase.from('scan_challenges')
      .update({ attempts: challenge.attempts + 1 })
      .eq('id', challenge.id);
    throw new Error(`Wrong code. ${challenge.max_attempts - challenge.attempts - 1} tries left.`);
  }

  // Mark verified
  await supabase.from('scan_challenges').update({
    verified_at: new Date().toISOString(),
  }).eq('id', challenge.id);

  // Load booking
  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) throw new Error('Booking not found');

  const scanType = challenge.scan_type as 'in' | 'out';
  await executeScan(booking, scanType, 'qr');

  revalidatePath('/playzonemama/live');
  return { success: true };
}

/** Admin manual override (with reason) */
export async function overrideScan(bookingId: string, scanType: 'in' | 'out', reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) throw new Error('Booking not found');

  await supabase.from('scan_logs').insert({
    booking_id: bookingId,
    scanned_by: user.id,
    scan_type: scanType,
    method: 'override',
    note: reason,
  });

  await executeScan(booking, scanType, 'override');
}

/** Internal: run the actual in/out logic */
async function executeScan(
  booking: { id: string; status: string; user_id: string; amount: number },
  scanType: 'in' | 'out',
  method: 'qr' | 'barcode' | 'manual' | 'override'
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (scanType === 'in') {
    if (booking.status === 'pending') {
      await confirmBooking(booking.id);
    }
    await startSession(booking.id);
  } else if (scanType === 'out') {
    await endSession(booking.id);
  }

  await supabase.from('scan_logs').insert({
    booking_id: booking.id,
    scanned_by: user?.id ?? null,
    scan_type: scanType,
    method,
  });
}

function generateCode(len: number): string {
  let code = '';
  for (let i = 0; i < len; i++) code += Math.floor(Math.random() * 10);
  return code;
}