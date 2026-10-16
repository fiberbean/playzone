// lib/actions/wallet.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { WalletTxnSource, WalletTxnType } from '@/lib/types/wallet';

interface LedgerInput {
  user_id: string;
  type: WalletTxnType;
  amount: number;
  source: WalletTxnSource;
  booking_id?: string;
  recharge_request_id?: string;
  created_by?: string;
  reason_short?: string;
  reason_long?: string;
  linked_txn_id?: string;
  metadata?: Record<string, unknown>;
  note?: string;
}

/**
 * The ONLY way to move money. Never touch profiles.wallet_balance directly.
 * The DB trigger updates balance + sets balance_after.
 */
export async function insertWalletTxn(input: LedgerInput) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('wallet_transactions')
    .insert({
      user_id: input.user_id,
      type: input.type,
      amount: input.amount,
      balance_after: 0, // overwritten by trigger
      source: input.source,
      booking_id: input.booking_id ?? null,
      recharge_request_id: input.recharge_request_id ?? null,
      created_by: input.created_by ?? null,
      reason_short: input.reason_short ?? null,
      reason_long: input.reason_long ?? null,
      linked_txn_id: input.linked_txn_id ?? null,
      metadata: input.metadata ?? null,
      note: input.note ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/** Admin manually adjusts balance (with mandatory reason) */
export async function manualAdjustment(
  userId: string,
  amount: number,
  type: 'credit' | 'debit',
  reason: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not admin');

  await insertWalletTxn({
    user_id: userId,
    type, amount,
    source: 'manual_adjustment',
    created_by: user.id,
    reason_short: type === 'credit' ? 'Admin credit' : 'Admin debit',
    reason_long: reason,
    note: reason,
  });

  revalidatePath('/playzonemama/wallet');
}