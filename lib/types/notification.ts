// lib/types/notification.ts

export type NotificationType =
  | 'session_ending'
  | 'booking_starting'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'wallet_credited'
  | 'wallet_debited'
  | 'recharge_approved'
  | 'recharge_rejected'
  | 'time_credit_earned'
  | 'time_credit_used'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationChannel = 'in_app' | 'push' | 'sound';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;

  booking_id: string | null;
  wallet_txn_id: string | null;

  priority: NotificationPriority;
  channels: NotificationChannel[];

  is_read: boolean;
  read_at: string | null;

  reminder_minutes_before: number | null;
  created_at: string;
}