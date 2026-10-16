// lib/types/profile.ts

export type UserRole = 'admin' | 'customer';

export interface NotificationPrefs {
  session_ending: boolean;
  booking_starting: boolean;
  wallet: boolean;
  posts: boolean;
  sound: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: UserRole;
  wallet_balance: number;
  time_credit_min: number;
  notification_prefs: NotificationPrefs;
  created_at: string;
}