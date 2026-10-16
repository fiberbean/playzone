// lib/actions/maintenance.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { insertWalletTxn } from './wallet';
import { createNotification } from './notifications';

export interface StartMaintenanceInput {
  console_id: string;
  reason: string;
  description?: string;
  expected_end_at?: string;
  cost?: number;
  vendor?: string;
}

export async function startMaintenance(input: StartMaintenanceInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create maintenance row
  const { data: maint, error } = await supabase
    .from('console_maintenance')
    .insert({
      console_id: input.console_id,
      reason: input.reason,
      description: input.description ?? null,
      expected_end_at: input.expected_end_at ?? null,
      cost: input.cost ?? 0,
      vendor: input.vendor ?? null,
      reported_by: user.id,
      status: 'active',
    })
    .select()
    .single();

  if (error) throw error;

  // Auto-cancel future bookings on this console (100% refund)
  const { data: futureBookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('console_id', input.console_id)
    .in('status', ['pending', 'confirmed'])
    .gt('slot_start', new Date().toISOString());

  for (const b of futureBookings ?? []) {
    if (b.status === 'confirmed') {
      await insertWalletTxn({
        user_id: b.user_id,
        type: 'credit',
        amount: b.amount,
        source: 'refund',
        booking_id: b.id,
        created_by: user.id,
        reason_short: 'Refund — Maintenance',
        reason_long: 'Console under maintenance. Full refund.',
        metadata: { reason: 'maintenance', maintenance_id: maint.id },
      });
    }

    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_fee: 0,
      refund_amount: b.amount,
      cancel_reason: 'Console under maintenance',
    }).eq('id', b.id);

    await createNotification({
      user_id: b.user_id,
      type: 'booking_cancelled',
      title: '⚠ Booking cancelled — Maintenance',
      body: `Your booking on this console was cancelled. ${b.status === 'confirmed' ? `₹${b.amount} fully refunded.` : 'No charge.'}`,
      booking_id: b.id,
      priority: 'high',
    });
  }

  revalidatePath('/playzonemama/maintenance');
  revalidatePath('/playzonemama/consoles');
  revalidatePath('/playzonemama/bookings');
}

export async function resolveMaintenance(
  maintenanceId: string,
  actualCost: number,
  resolutionNotes?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('console_maintenance').update({
    status: 'resolved',
    ended_at: new Date().toISOString(),
    cost: actualCost,
    description: resolutionNotes ?? null,
    resolved_by: user.id,
  }).eq('id', maintenanceId);

  revalidatePath('/playzonemama/maintenance');
  revalidatePath('/playzonemama/consoles');
}