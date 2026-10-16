// lib/actions/recharge.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { insertWalletTxn } from './wallet';
import { createNotification } from './notifications';

export interface SubmitRechargeInput {
  amount: number;
  upi_ref: string;
  upi_app?: string;
  screenshot_url?: string;
  screenshot_key?: string;
}

export async function submitRecharge(input: SubmitRechargeInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (input.amount <= 0) throw new Error('Amount must be positive');
  if (!input.upi_ref || input.upi_ref.length < 6) {
    throw new Error('Valid UTR required');
  }

  const { data, error } = await supabase
    .from('recharge_requests')
    .insert({
      user_id: user.id,
      amount: input.amount,
      upi_ref: input.upi_ref,
      upi_app: input.upi_app ?? null,
      screenshot_url: input.screenshot_url ?? null,
      screenshot_key: input.screenshot_key ?? null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;

  await createNotification({
    user_id: user.id,
    type: 'system',
    title: '📥 Recharge submitted',
    body: `₹${input.amount} — awaiting admin verification`,
    priority: 'normal',
  });

  revalidatePath('/wallet');
  revalidatePath('/playzonemama/wallet');
  return data;
}

export async function approveRecharge(requestId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: req } = await supabase
    .from('recharge_requests').select('*').eq('id', requestId).single();
  if (!req) throw new Error('Not found');
  if (req.status !== 'pending') throw new Error('Already reviewed');

  const txn = await insertWalletTxn({
    user_id: req.user_id,
    type: 'credit',
    amount: req.amount,
    source: 'recharge',
    recharge_request_id: req.id,
    created_by: user.id,
    reason_short: 'Wallet Recharge',
    reason_long: `UPI • UTR ${req.upi_ref}`,
    metadata: {
      upi_ref: req.upi_ref,
      upi_app: req.upi_app,
      screenshot_url: req.screenshot_url,
    },
  });

  await supabase.from('recharge_requests').update({
    status: 'approved',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', requestId);

  await createNotification({
    user_id: req.user_id,
    type: 'recharge_approved',
    title: '💰 Recharge approved',
    body: `₹${req.amount} added to your wallet.`,
    wallet_txn_id: txn.id,
    priority: 'high',
  });

  revalidatePath('/playzonemama/wallet');
  revalidatePath('/wallet');
}

export async function rejectRecharge(requestId: string, reason: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: req } = await supabase
    .from('recharge_requests').select('*').eq('id', requestId).single();
  if (!req) throw new Error('Not found');
  if (req.status !== 'pending') throw new Error('Already reviewed');

  await supabase.from('recharge_requests').update({
    status: 'rejected',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    rejection_reason: reason,
  }).eq('id', requestId);

  await createNotification({
    user_id: req.user_id,
    type: 'recharge_rejected',
    title: '❌ Recharge rejected',
    body: reason || 'Please check your UTR and try again.',
    priority: 'high',
  });

  revalidatePath('/playzonemama/wallet');
  revalidatePath('/wallet');
}