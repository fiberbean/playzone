// lib/types/wallet.ts

export type WalletTxnType = 'credit' | 'debit';

export type WalletTxnSource =
  | 'booking_confirm'
  | 'booking_cancel'
  | 'booking_reschedule_out'
  | 'booking_reschedule_in'
  | 'extra_time'
  | 'overrun'
  | 'recharge'
  | 'manual_adjustment'
  | 'refund';

export interface WalletTransaction {
  id: string;
  user_id: string;

  type: WalletTxnType;
  amount: number;
  balance_after: number;

  source: WalletTxnSource;

  booking_id: string | null;
  recharge_request_id: string | null;
  created_by: string | null;

  reason_short: string | null;
  reason_long: string | null;
  linked_txn_id: string | null;
  metadata: Record<string, unknown> | null;

  note: string | null;
  created_at: string;
}

export type RechargeStatus = 'pending' | 'approved' | 'rejected';

export interface RechargeRequest {
  id: string;
  user_id: string;
  amount: number;
  upi_ref: string;
  upi_app: string | null;
  screenshot_url: string | null;
  screenshot_key: string | null;
  status: RechargeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export type TimeCreditType = 'earned' | 'used' | 'expired' | 'manual';

export interface TimeCreditLedgerRow {
  id: string;
  user_id: string;
  type: TimeCreditType;
  minutes: number;
  balance_after: number;
  source: string | null;
  booking_id: string | null;
  note: string | null;
  expires_at: string | null;
  created_at: string;
}