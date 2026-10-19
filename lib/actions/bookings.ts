// lib/actions/bookings.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getAllSettings } from './settings';
import { insertWalletTxn } from './wallet';
import { createNotification, createSessionReminders } from './notifications';
import { grantTimeCredit } from './timeCredit';
import { calcAmount, calcCancellation, getPlayerRate } from '@/lib/utils/money';
import { formatTime, formatDateShort, formatTimeRange } from '@/lib/utils/time';

// ---------- CREATE ----------
export interface CreateBookingInput {
  game_id: string;
  console_id: string;
  slot_start: string; // ISO
  duration_min: number;
  players: number;
  amount: number; // 👈 Added: UI nunchi total amount pass avuthundi
  notes?: string;
}

export async function createBooking(input: CreateBookingInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const minDur = settings.min_duration_min as number;
  const maxDur = settings.max_duration_min as number;
  const slotMin = settings.slot_minutes as number;
  
  // Auto-confirm setting check
  const autoConfirm = settings.auto_confirm_bookings === true;

  // Validate duration
  if (input.duration_min < minDur || input.duration_min > maxDur) {
    throw new Error(`Duration must be ${minDur}–${maxDur} minutes`);
  }
  if (input.duration_min % slotMin !== 0) {
    throw new Error(`Duration must be in multiples of ${slotMin} minutes`);
  }

  // Load game + console
  const { data: game } = await supabase
    .from('games').select('*').eq('id', input.game_id).single();
  if (!game || !game.is_active) throw new Error('Game not available');

  const { data: console } = await supabase
    .from('consoles').select('*').eq('id', input.console_id).single();
  if (!console || !console.is_active) throw new Error('Console not available');

  // Verify mapping
  const { data: mapping } = await supabase
    .from('game_consoles')
    .select('id')
    .eq('game_id', input.game_id)
    .eq('console_id', input.console_id)
    .maybeSingle();
  if (!mapping) throw new Error('This game is not available on this console');

  // Verify players count
  if (input.players < 1) throw new Error('At least 1 player required');
  if (input.players > console.joysticks) {
    throw new Error(`This console supports up to ${console.joysticks} players`);
  }

  const amount = input.amount; 
  const rateType = input.players === 1 ? 'single' : 'multiplayer';
  const hourly_rate_snapshot = amount / (input.duration_min / 60);

  const slotStart = new Date(input.slot_start);
  const slotEnd = new Date(slotStart.getTime() + input.duration_min * 60 * 1000);

  // Server-side conflict check
  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('console_id', input.console_id)
    .in('status', ['pending', 'confirmed', 'active'])
    .lt('slot_start', slotEnd.toISOString())
    .gt('slot_end', slotStart.toISOString());

  if (conflictErr) throw new Error(conflictErr.message);
  if (conflicts && conflicts.length > 0) {
    throw new Error('This time slot on the selected console has just been booked. Please pick a different time or console.');
  }

  // Insert booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      user_id: user.id,
      game_id: input.game_id,
      console_id: input.console_id,
      slot_start: slotStart.toISOString(),
      slot_end: slotEnd.toISOString(),
      duration_min: input.duration_min,
      players: input.players,
      hourly_rate_snapshot: hourly_rate_snapshot,
      rate_type: rateType,
      amount,
      status: 'pending',
      created_by: user.id,
      notes: input.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') {
      throw new Error('This time slot on the selected console has just been booked. Please pick a different time or console.');
    }
    throw error;
  }

  // ✅ AUTO-CONFIRM LOGIC
  if (autoConfirm) {
    try {
      // Wallet nunchi amount cut cheddam
      const txn = await insertWalletTxn({
        user_id: user.id,
        type: 'debit',
        amount: amount,
        source: 'booking_confirm',
        booking_id: booking.id,
        created_by: user.id,
        reason_short: 'Auto Booking Confirmed',
        reason_long: `${game.name} • ${console.name}`,
        metadata: {
          rate: hourly_rate_snapshot,
          rate_type: rateType,
          duration_min: input.duration_min,
          players: input.players,
        },
      });

      // Wallet cut ayyaka confirm cheyadam
      await supabase.from('bookings')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', booking.id);

      // Notification pampadam
      await createNotification({
        user_id: user.id,
        type: 'booking_confirmed',
        title: '✅ Booking Auto-Confirmed',
        body: `₹${amount} debited instantly. See you at ${formatTime(slotStart)}.`,
        booking_id: booking.id,
        wallet_txn_id: txn.id,
        priority: 'high',
      });

      // Local booking data update
      booking.status = 'confirmed'; 

    } catch (e) {
      // Balance saripokapothe error handling
      await supabase.from('bookings').update({ 
        status: 'cancelled', 
        cancel_reason: 'Auto-confirm failed: Insufficient balance' 
      }).eq('id', booking.id);
      
      throw new Error('Insufficient wallet balance for auto-confirmation. Please recharge and try again.');
    }
  } else {
    // Auto-confirm OFF unte purathala la pending notification
    await createNotification({
      user_id: user.id,
      type: 'booking_confirmed',
      title: '⏳ Booking placed',
      body: `${game.name} • ${console.name}\n${formatDateShort(slotStart)} • ${formatTimeRange(slotStart, slotEnd)}\nAwaiting admin confirmation.`,
      booking_id: booking.id,
      priority: 'normal',
    });
  }

  revalidatePath('/bookings');
  revalidatePath('/playzonemama/bookings');
  return booking;
}

// ---------- CONFIRM (admin) ----------
export async function confirmBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name)')
    .eq('id', bookingId)
    .single();
  if (!booking) throw new Error('Booking not found');
  if (booking.status !== 'pending') throw new Error('Booking is not pending');

  // Debit wallet via ledger (trigger checks for insufficient balance)
  try {
    const txn = await insertWalletTxn({
      user_id: booking.user_id,
      type: 'debit',
      amount: booking.amount,
      source: 'booking_confirm',
      booking_id: booking.id,
      created_by: user.id,
      reason_short: 'Booking Confirmed',
      reason_long: `${booking.game?.name} • ${booking.console?.name}`,
      metadata: {
        rate: booking.hourly_rate_snapshot,
        rate_type: booking.rate_type,
        duration_min: booking.duration_min,
        players: booking.players,
      },
    });

    await supabase.from('bookings').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
    }).eq('id', bookingId);

    await createNotification({
      user_id: booking.user_id,
      type: 'booking_confirmed',
      title: '✅ Booking confirmed',
      body: `₹${booking.amount} debited. See you at ${formatTime(booking.slot_start)}.`,
      booking_id: booking.id,
      wallet_txn_id: txn.id,
      priority: 'high',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed';
    if (msg.includes('Insufficient')) {
      await createNotification({
        user_id: booking.user_id,
        type: 'system',
        title: '❌ Booking failed',
        body: 'Insufficient wallet balance. Please recharge and try again.',
        booking_id: booking.id,
        priority: 'high',
      });
    }
    throw e;
  }

  revalidatePath('/playzonemama/bookings');
  revalidatePath('/bookings');
}

// ---------- CANCEL ----------
export async function cancelBooking(bookingId: string, reason?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const cutoffHours = settings.cutoff_hours as number;
  const feePct = settings.cancellation_fee_pct as number;

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name)')
    .eq('id', bookingId)
    .single();
  if (!booking) throw new Error('Not found');
  if (booking.status !== 'pending' && booking.status !== 'confirmed') {
    throw new Error('Cannot cancel this booking');
  }

  // Cutoff check
  const cutoffMs = cutoffHours * 60 * 60 * 1000;
  if (Date.now() >= new Date(booking.slot_start).getTime() - cutoffMs) {
    throw new Error(`Cancellation not allowed within ${cutoffHours} hours of start`);
  }

  const { fee, refund } = calcCancellation(booking.amount, feePct);

  // Only refund if the booking was already charged (confirmed)
  if (booking.status === 'confirmed') {
    const txn = await insertWalletTxn({
      user_id: booking.user_id,
      type: 'credit',
      amount: refund,
      source: 'booking_cancel',
      booking_id: booking.id,
      created_by: user.id,
      reason_short: 'Refund — Cancelled',
      reason_long: `10% cancellation fee (₹${fee}) applied`,
      metadata: {
        original_amount: booking.amount,
        fee_pct: feePct,
        fee_amount: fee,
        refund_amount: refund,
      },
    });

    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_fee: fee,
      refund_amount: refund,
      cancel_reason: reason ?? null,
    }).eq('id', bookingId);

    await createNotification({
      user_id: booking.user_id,
      type: 'booking_cancelled',
      title: '❌ Booking cancelled',
      body: `₹${refund} refunded (₹${fee} fee applied).`,
      booking_id: booking.id,
      wallet_txn_id: txn.id,
      priority: 'normal',
    });
  } else {
    // Pending → just cancel, no money moved
    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_fee: 0,
      refund_amount: 0,
      cancel_reason: reason ?? null,
    }).eq('id', bookingId);

    await createNotification({
      user_id: booking.user_id,
      type: 'booking_cancelled',
      title: '❌ Booking cancelled',
      body: 'No charge applied (booking was pending).',
      booking_id: booking.id,
      priority: 'normal',
    });
  }

  revalidatePath('/bookings');
  revalidatePath('/playzonemama/bookings');
}

// ---------- RESCHEDULE ----------
export async function rescheduleBooking(
  oldBookingId: string,
  newSlotStart: string,
  newDurationMin: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const cutoffHours = settings.cutoff_hours as number;
  const feePct = settings.reschedule_fee_pct as number;

  const { data: old } = await supabase
    .from('bookings')
    .select('*, game:games(*), console:consoles(*)')
    .eq('id', oldBookingId)
    .single();
  if (!old) throw new Error('Booking not found');
  if (old.status !== 'pending' && old.status !== 'confirmed') {
    throw new Error('Cannot reschedule this booking');
  }

  const cutoffMs = cutoffHours * 60 * 60 * 1000;
  if (Date.now() >= new Date(old.slot_start).getTime() - cutoffMs) {
    throw new Error(`Reschedule not allowed within ${cutoffHours} hours`);
  }

  // Compute new amount (using dynamic pricing)
  const perPlayerRate = getPlayerRate(
    old.game?.player_rates as any,
    old.game?.pricing_mode as any,
    old.players,
    old.game?.single_player_rate ?? 100
  );
  const totalHourlyRate = perPlayerRate * old.players;
  const newAmount = calcAmount(totalHourlyRate, newDurationMin);
  
  const fee = Math.round(old.amount * feePct * 100) / 100;
  const refundFromOld = Math.round((old.amount - fee) * 100) / 100;

  const newStart = new Date(newSlotStart);
  const newEnd = new Date(newStart.getTime() + newDurationMin * 60 * 1000);

  // 1. Refund old (if it was confirmed — money was charged)
  if (old.status === 'confirmed') {
    await insertWalletTxn({
      user_id: old.user_id,
      type: 'credit',
      amount: refundFromOld,
      source: 'booking_reschedule_out',
      booking_id: old.id,
      created_by: user.id,
      reason_short: 'Refund — Rescheduled',
      reason_long: `10% reschedule fee (₹${fee}) applied`,
      metadata: {
        original_amount: old.amount,
        fee_pct: feePct,
        fee_amount: fee,
        refund_amount: refundFromOld,
      },
    });
  }

  // 2. Mark old as rescheduled
  await supabase.from('bookings').update({
    status: 'rescheduled',
    reschedule_fee: fee,
    refund_amount: refundFromOld,
  }).eq('id', old.id);

  // 3. Create new booking (pending) - Server-side conflict check
  const { data: conflicts, error: conflictErr } = await supabase
    .from('bookings')
    .select('id')
    .eq('console_id', old.console_id)
    .in('status', ['pending', 'confirmed', 'active'])
    .lt('slot_start', newEnd.toISOString())
    .gt('slot_end', newStart.toISOString());

  if (conflictErr) throw new Error(conflictErr.message);
  if (conflicts && conflicts.length > 0) {
    throw new Error('New slot already booked. Pick another.');
  }

  const { data: newBooking, error } = await supabase
    .from('bookings')
    .insert({
      user_id: old.user_id,
      game_id: old.game_id,
      console_id: old.console_id,
      slot_start: newStart.toISOString(),
      slot_end: newEnd.toISOString(),
      duration_min: newDurationMin,
      players: old.players,
      hourly_rate_snapshot: totalHourlyRate, // Snapshot total hourly rate
      rate_type: old.rate_type,
      amount: newAmount,
      status: 'pending',
      created_by: user.id,
      rescheduled_from: old.id,
      reschedule_count: (old.reschedule_count ?? 0) + 1,
      notes: old.notes,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23P01') throw new Error('New slot already booked. Pick another.');
    throw error;
  }

  // 4. Link old → new
  await supabase.from('bookings')
    .update({ rescheduled_to: newBooking.id })
    .eq('id', old.id);

  // 5. Notify
  await createNotification({
    user_id: old.user_id,
    type: 'booking_rescheduled',
    title: '🔄 Booking rescheduled',
    body: `New slot: ${formatDateShort(newStart)} • ${formatTimeRange(newStart, newEnd)}. ₹${fee} fee applied.`,
    booking_id: newBooking.id,
    priority: 'normal',
  });

  revalidatePath('/bookings');
  revalidatePath('/playzonemama/bookings');
  return newBooking;
}

// ---------- START SESSION (admin) ----------
export async function startSession(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const settings = await getAllSettings();
  const intervals = settings.reminder_minutes as number[];

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name)')
    .eq('id', bookingId)
    .single();
  if (!booking) throw new Error('Not found');
  if (booking.status !== 'confirmed') throw new Error('Booking must be confirmed');

  const now = new Date();
  const arrivalDelta = Math.round(
    (now.getTime() - new Date(booking.slot_start).getTime()) / 60000
  );

  await supabase.from('bookings').update({
    status: 'active',
    started_at: now.toISOString(),
    actual_start_at: now.toISOString(),
    arrival_delta_min: arrivalDelta,
  }).eq('id', bookingId);

  await createSessionReminders(
    booking.id,
    booking.user_id,
    booking.slot_end,
    booking.game?.name ?? 'Game',
    intervals
  );

  revalidatePath('/playzonemama/live');
  revalidatePath('/playzonemama/bookings');
}

// ---------- END SESSION ----------
export async function endSession(bookingId: string, opts?: {
  overrunCharge?: number;
  overrunMin?: number;
  actualEndAt?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, game:games(name), console:consoles(name)')
    .eq('id', bookingId)
    .single();
  if (!booking) throw new Error('Not found');
  if (booking.status !== 'active') throw new Error('Not active');

  const now = new Date();
  const actualEnd = opts?.actualEndAt ?? now.toISOString();
  const overrunMin = opts?.overrunMin ?? 0;
  const overrunCharge = opts?.overrunCharge ?? 0;

  // Charge overrun if any
  if (overrunCharge > 0) {
    await insertWalletTxn({
      user_id: booking.user_id,
      type: 'debit',
      amount: overrunCharge,
      source: 'overrun',
      booking_id: booking.id,
      created_by: user.id,
      reason_short: 'Overrun Charge',
      reason_long: `+${overrunMin} min beyond scheduled end`,
      metadata: { overrun_min: overrunMin, rate: booking.hourly_rate_snapshot },
    });
  }

  await supabase.from('bookings').update({
    status: 'completed',
    ended_at: now.toISOString(),
    actual_end_at: actualEnd,
    overrun_min: overrunMin,
    overrun_charged: overrunCharge,
  }).eq('id', bookingId);

  revalidatePath('/playzonemama/live');
  revalidatePath('/bookings');
}

// ---------- NO SHOW ----------
export async function markNoShow(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: booking } = await supabase
    .from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) throw new Error('Not found');

  await supabase.from('bookings').update({
    status: 'no_show',
    cancelled_at: new Date().toISOString(),
    cancel_reason: 'No-show',
  }).eq('id', bookingId);

  // No refund — full amount kept (customer didn't show up)

  await createNotification({
    user_id: booking.user_id,
    type: 'system',
    title: '🚫 Marked as no-show',
    body: 'You did not check in to your booking. No refund applied.',
    booking_id: booking.id,
    priority: 'high',
  });

  revalidatePath('/playzonemama/bookings');
  revalidatePath('/bookings');
}