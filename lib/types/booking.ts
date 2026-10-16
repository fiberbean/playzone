// lib/types/booking.ts

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type RateType = 'single' | 'multiplayer';

export interface Booking {
  id: string;
  user_id: string;
  game_id: string;
  console_id: string;

  slot_start: string;
  slot_end: string;
  duration_min: number;
  players: number;

  hourly_rate_snapshot: number;
  rate_type: RateType;

  amount: number;
  cancellation_fee: number;
  reschedule_fee: number;
  refund_amount: number;

  status: BookingStatus;

  created_by: string | null;
  confirmed_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;

  actual_start_at: string | null;
  actual_end_at: string | null;
  arrival_delta_min: number | null;
  overrun_min: number;
  overrun_charged: number;

  rescheduled_from: string | null;
  rescheduled_to: string | null;
  reschedule_count: number;

  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookingWithRelations extends Booking {
  game?: { id: string; name: string; image_url: string | null };
  console?: { id: string; name: string; type: string; joysticks: number };
  profile?: {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  };
}