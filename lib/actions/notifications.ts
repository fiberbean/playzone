// lib/actions/notifications.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import type { NotificationType, NotificationPriority, NotificationChannel } from '@/lib/types/notification';

export interface CreateNotificationInput {
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  priority?: NotificationPriority;
  channels?: NotificationChannel[];
  booking_id?: string;
  wallet_txn_id?: string;
  reminder_minutes_before?: number;
}

export async function createNotification(input: CreateNotificationInput) {
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').insert({
    user_id: input.user_id,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    priority: input.priority ?? 'normal',
    channels: input.channels ?? ['in_app'],
    booking_id: input.booking_id ?? null,
    wallet_txn_id: input.wallet_txn_id ?? null,
    reminder_minutes_before: input.reminder_minutes_before ?? null,
  });
  if (error) throw error;
}

/**
 * Create all reminder rows for a session that just started.
 * Intervals from settings.reminder_minutes (e.g. [10,5,2,0]).
 */
export async function createSessionReminders(
  bookingId: string,
  userId: string,
  slotEnd: string,
  gameName: string,
  intervals: number[]
) {
  const supabase = await createClient();
  const endLabel = new Date(slotEnd).toLocaleTimeString('en-IN', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata',
  });

  const rows = intervals.map((min) => {
    let title: string;
    let priority: NotificationPriority;
    let channels: NotificationChannel[];
    let body: string;

    if (min === 0) {
      title = '⏰ Session ended';
      body = `Your ${gameName} session has ended. Thanks for playing!`;
      priority = 'high';
      channels = ['in_app', 'push', 'sound'];
    } else if (min <= 2) {
      title = `🚨 ${min} minute${min > 1 ? 's' : ''} left`;
      body = `Your ${gameName} session ends at ${endLabel}`;
      priority = 'urgent';
      channels = ['in_app', 'push', 'sound'];
    } else if (min <= 5) {
      title = `⏱ ${min} minutes left`;
      body = `Your ${gameName} session ends at ${endLabel}`;
      priority = 'high';
      channels = ['in_app', 'push', 'sound'];
    } else {
      title = `⏱ ${min} minutes left`;
      body = `Your ${gameName} session ends at ${endLabel}`;
      priority = 'normal';
      channels = ['in_app', 'push'];
    }

    return {
      user_id: userId,
      type: 'session_ending' as const,
      title, body, priority, channels,
      booking_id: bookingId,
      reminder_minutes_before: min,
    };
  });

  const { error } = await supabase.from('notifications').insert(rows);
  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', user.id);
}

export async function markAllRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('is_read', false);
}