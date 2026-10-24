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

export async function insertWalletTxn(input: LedgerInput) {
  const supabase = await createClient();

  // 👈 STEP 1: Profile fetch
  console.log('STEP 1: Fetching profile for user:', input.user_id)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', input.user_id)
    .single();

  if (profileError || !profile) {
    console.error('STEP 1 ERROR: Profile fetch failed:', profileError)
    throw new Error('Profile not found');
  }
  console.log('STEP 1 SUCCESS: Profile found:', profile)

  const currentBalance = Number(profile.wallet_balance ?? 0);
  console.log('STEP 1: Current balance:', currentBalance)

  // 👈 STEP 2: Calculate new balance
  const newBalance = input.type === 'credit' 
    ? currentBalance + input.amount 
    : currentBalance - input.amount;
  console.log('STEP 2: New balance calculated:', newBalance)

  // 👈 STEP 3: Block negative balance
  if (newBalance < 0) {
    console.error('STEP 3 ERROR: Insufficient balance')
    throw new Error('Insufficient wallet balance');
  }

  // 👈 STEP 4: Insert transaction
  console.log('STEP 4: Inserting wallet_transaction with:', {
    user_id: input.user_id,
    type: input.type,
    amount: input.amount,
    balance_after: newBalance,
  })
  
  const { data, error } = await supabase
    .from('wallet_transactions')
    .insert({
      user_id: input.user_id,
      type: input.type,
      amount: input.amount,
      balance_after: newBalance,
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

  if (error) {
    console.error('STEP 4 ERROR: Insert failed:', error)
    throw error;
  }
  console.log('STEP 4 SUCCESS: Transaction inserted:', data)

  // 👈 STEP 5: Update profile
  console.log('STEP 5: Updating profile balance to:', newBalance)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ wallet_balance: newBalance })
    .eq('id', input.user_id);

  if (updateError) {
    console.error('STEP 5 ERROR: Profile update failed:', updateError)
    throw updateError;
  }
  console.log('STEP 5 SUCCESS: Profile updated')

  revalidatePath('/wallet');
  revalidatePath('/playzonemama/wallet');

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