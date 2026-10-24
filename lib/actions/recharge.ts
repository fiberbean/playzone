// lib/actions/recharge.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ============================================================
// SUBMIT RECHARGE REQUEST (customer)
// ============================================================
export async function submitRecharge(payload: {
  amount: number
  upi_ref: string
  upi_app?: string
  screenshot_url?: string
  screenshot_key?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { amount, upi_ref, upi_app, screenshot_url, screenshot_key } = payload

  if (!amount || amount <= 0) throw new Error('Set the amount to lock in')
  if (!upi_ref || upi_ref.length < 6)
    throw new Error('UTR looks off — check again')
  if (!screenshot_url || !screenshot_key)
    throw new Error('Drop a screenshot to continue')

  const { data: existing } = await supabase
    .from('recharge_requests')
    .select('id, status')
    .eq('upi_ref', upi_ref.trim())
    .maybeSingle()

  if (existing) {
    const msg =
      existing.status === 'pending'
        ? 'Already pending verification'
        : existing.status === 'approved'
        ? 'Already banked'
        : 'Already rejected'
    throw new Error(`This UTR's already on the leaderboard! (${msg})`)
  }

  const { data: txnExists } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('source', 'recharge')
    .ilike('note', `%${upi_ref.trim()}%`)
    .maybeSingle()

  if (txnExists) {
    throw new Error("That UTR's already banked!")
  }

  const { data: inserted, error } = await supabase
    .from('recharge_requests')
    .insert({
      user_id: user.id,
      amount,
      upi_ref: upi_ref.trim(),
      upi_app: upi_app ?? null,
      screenshot_url,
      screenshot_key,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw new Error("This UTR's already on the leaderboard!")
    }
    console.error('[submitRecharge] Insert error:', error)
    throw new Error(error.message || 'Failed to submit')
  }

  revalidatePath('/wallet')
  revalidatePath('/playzonemama/wallet')

  return { success: true, id: inserted?.id }
}

// ============================================================
// APPROVE RECHARGE (admin)
// ============================================================
export async function approveRecharge(requestId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  // ---- Admin check ----
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Admin access required')

  // ---- Fetch request ----
  const { data: request, error: fetchErr } = await supabase
    .from('recharge_requests')
    .select('id, user_id, amount, upi_ref, status')
    .eq('id', requestId)
    .single()

  if (fetchErr || !request) throw new Error('Recharge request not found')
  if (request.status !== 'pending')
    throw new Error(`Already ${request.status}`)

  // 👈 1. Get current balance
  const { data: userProfile, error: balanceErr } = await supabase
    .from('profiles')
    .select('wallet_balance')
    .eq('id', request.user_id)
    .single()

  if (balanceErr || !userProfile) {
    throw new Error('User profile not found')
  }

  const currentBalance = Number(userProfile.wallet_balance ?? 0)
  const newBalance = currentBalance + request.amount

  // ---- Mark approved ----
  const { error: updateErr } = await supabase
    .from('recharge_requests')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (updateErr) throw updateErr

  // 👈 2. Insert wallet transaction with balance_after
  const { error: txnErr } = await supabase.from('wallet_transactions').insert({
    user_id: request.user_id,
    type: 'credit',
    amount: request.amount,
    balance_after: newBalance,
    source: 'recharge',
    reason_short: 'Wallet recharge',
    reason_long: `UPI recharge approved (UTR: ${request.upi_ref})`,
    booking_id: null,
    recharge_request_id: request.id,
    created_by: user.id,
    note: `Recharge #${requestId.slice(0, 8)} · UTR ${request.upi_ref}`,
  })

  if (txnErr) {
    await supabase
      .from('recharge_requests')
      .update({
        status: 'pending',
        reviewed_by: null,
        reviewed_at: null,
      })
      .eq('id', requestId)

    throw new Error(`Wallet credit failed: ${txnErr.message}`)
  }

  // 👈 3. Update profile wallet_balance
  const { error: profileUpdateErr } = await supabase
    .from('profiles')
    .update({ wallet_balance: newBalance })
    .eq('id', request.user_id)

  if (profileUpdateErr) {
    console.error('Profile update failed:', profileUpdateErr)
    throw new Error('Failed to update wallet balance')
  }

  // ---- Notify customer ----
  await supabase.from('notifications').insert({
    user_id: request.user_id,
    type: 'recharge_approved',
    title: 'Recharge approved',
    body: `₹${request.amount} credited to your wallet`,
    wallet_txn_id: null,
    booking_id: null,
    priority: 'normal',
    channels: ['in_app'],
  })

  revalidatePath('/wallet')
  revalidatePath('/playzonemama/wallet')

  return { success: true }
}

// ============================================================
// REJECT RECHARGE (admin)
// ============================================================
export async function rejectRecharge(
  requestId: string,
  reason: string,
  adminNote?: string
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Admin access required')

  const trimmed = (reason || '').trim()
  if (trimmed.length < 3) throw new Error('Reason is required')

  const { data: request, error: fetchErr } = await supabase
    .from('recharge_requests')
    .select('id, user_id, amount, upi_ref, status')
    .eq('id', requestId)
    .single()

  if (fetchErr || !request) throw new Error('Recharge request not found')
  if (request.status !== 'pending')
    throw new Error(`Already ${request.status}`)

  const { error: updateErr } = await supabase
    .from('recharge_requests')
    .update({
      status: 'rejected',
      rejection_reason: trimmed,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (updateErr) throw updateErr

  await supabase.from('notifications').insert({
    user_id: request.user_id,
    type: 'recharge_rejected',
    title: 'Recharge rejected',
    body: `Reason: ${trimmed}`,
    booking_id: null,
    priority: 'high',
    channels: ['in_app'],
  })

  revalidatePath('/wallet')
  revalidatePath('/playzonemama/wallet')

  return { success: true }
}