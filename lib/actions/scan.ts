// lib/actions/scan.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getAllSettings } from './settings';
import { confirmBooking, startSession, endSession } from './bookings';
import { insertWalletTxn } from './wallet';
import { createNotification } from './notifications';

// 👈 Distance formula
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function generateCheckinCode(bookingId: string, userLat: number, userLng: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const geofencingEnabled = settings.zone_geofencing_enabled === true;

  if (geofencingEnabled) {
    const zoneLat = Number(settings.zone_latitude ?? 0);
    const zoneLng = Number(settings.zone_longitude ?? 0);
    const radius = Number(settings.zone_radius_meters ?? 50);

    const distance = getDistanceInMeters(userLat, userLng, zoneLat, zoneLng);
    if (distance > radius) {
      throw new Error(`You are too far from Play Zone (${Math.round(distance)}m away).`);
    }
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('status')
    .eq('id', bookingId)
    .single();

  if (!booking) throw new Error('Booking not found');
  
  const scanType = ['pending', 'confirmed'].includes(booking.status) ? 'in' : 'out';

  await supabase
    .from('scan_challenges')
    .delete()
    .eq('booking_id', bookingId);

  const bookingCode = Math.floor(10000000 + Math.random() * 90000000).toString();
  const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();

  const { error } = await supabase
    .from('scan_challenges')
    .insert({
      booking_id: bookingId,
      code: bookingCode,
      otp_code: null,
      expires_at: expiresAt,
      scan_type: scanType,
      attempts: 0,
      max_attempts: 3,
    });

  if (error) throw new Error(error.message);

  return { code: bookingCode, expires_at: expiresAt };
}

export async function scanQR(qrPayload: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const requireCode = settings.scan_require_code as boolean;

  const qrId = qrPayload.startsWith('playzone://booking/')
    ? qrPayload.replace('playzone://booking/', '')
    : qrPayload;

  let booking: any = null;
  let challenge: any = null;

  // 👈 1. Search by 8-digit code in scan_challenges
  if (/^\d{8}$/.test(qrId)) {
    const { data: c } = await supabase
      .from('scan_challenges')
      .select('*, booking_id')
      .eq('code', qrId)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    challenge = c;

    if (challenge) {
      const { data: b } = await supabase
        .from('bookings')
        .select('*, game:games(name), console:consoles(name), profile:profiles!bookings_user_id_fkey(full_name, avatar_url, email)')
        .eq('id', challenge.booking_id)
        .single();
      if (b) booking = b;
    }
  }

  // 👈 2. Search by PZBKID or UUID in bookings
  if (!booking) {
    if (qrId.startsWith('PZBKID')) {
      const { data: b } = await supabase
        .from('bookings')
        .select('*, game:games(name), console:consoles(name), profile:profiles!bookings_user_id_fkey(full_name, avatar_url, email)')
        .eq('booking_code', qrId.toUpperCase())
        .maybeSingle();
      if (b) booking = b;
    } else if (!/^\d{8}$/.test(qrId)) {
      const { data: b } = await supabase
        .from('bookings')
        .select('*, game:games(name), console:consoles(name), profile:profiles!bookings_user_id_fkey(full_name, avatar_url, email)')
        .eq('id', qrId)
        .maybeSingle();
      if (b) booking = b;
    }
  }

  if (!booking) throw new Error('Booking not found. Please check the code.');

  // 👈 3. Late Arrival Rule (12 hours grace) with "Booking Expired" message
  const now = new Date();
  const slotDate = new Date(booking.slot_start);
  const hoursSinceBooking = (now.getTime() - slotDate.getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceBooking > 12) {
    throw new Error('Booking Expired. This slot is no longer valid.');
  }

  let scanType: 'in' | 'out';
  if (booking.status === 'pending' || booking.status === 'confirmed') {
    scanType = 'in';
  } else if (booking.status === 'active') {
    scanType = 'out';
  } else {
    throw new Error(`Booking is ${booking.status} — cannot scan`);
  }

  if (!requireCode) {
    await executeScan(booking, scanType, 'qr');
    return { booking, scanType, requireCode: false };
  }

  // 👈 Generate OTP for this challenge
  const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
  
  if (challenge) {
    await supabase
      .from('scan_challenges')
      .update({ otp_code: otpCode })
      .eq('id', challenge.id);
  } else {
    await supabase
      .from('scan_challenges')
      .insert({
        booking_id: booking.id,
        code: qrId,
        otp_code: otpCode,
        expires_at: new Date(Date.now() + 30 * 1000).toISOString(),
        scan_type: scanType,
        attempts: 0,
        max_attempts: 3,
      });
  }

  return { booking, scanType, requireCode: true };
}

export async function verifyScanCode(bookingId: string, enteredBookingCode: string, enteredOtp: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: challenge } = await supabase
    .from('scan_challenges')
    .select('*')
    .eq('booking_id', bookingId)
    .is('verified_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!challenge) throw new Error('No active code. Ask customer to refresh.');

  if (new Date(challenge.expires_at) < new Date()) {
    throw new Error('Code expired. Ask customer to refresh.');
  }

  if (challenge.code !== enteredBookingCode) {
    throw new Error('Wrong Booking ID. Please check again.');
  }

  if (challenge.otp_code !== enteredOtp) {
    throw new Error('Wrong Verification Code. Please check again.');
  }

  await supabase.from('scan_challenges').update({
    verified_at: new Date().toISOString(),
  }).eq('id', challenge.id);

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) throw new Error('Booking not found');

  const scanType = challenge.scan_type as 'in' | 'out';
  await executeScan(booking, scanType, 'qr');

  revalidatePath('/playzonemama/live');
  return { success: true };
}

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