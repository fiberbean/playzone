// app/wallet/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WalletClient } from './WalletClient'
import { getAllSettings } from '@/lib/actions/settings'

export const instant = false

export default async function WalletPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getAllSettings()

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_balance, time_credit_min')
    .eq('id', user.id)
    .single()

  // Fetch both ledgers
  const [txnsRes, tcRes, rechargesRes] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select(`
        id, type, amount, balance_after, source,
        reason_short, reason_long, booking_id, linked_txn_id, metadata,
        note, created_at
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('time_credit_ledger')
      .select('id, type, minutes, balance_after, source, note, expires_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('recharge_requests')
      .select('id, amount, upi_ref, status, rejection_reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <WalletClient
      walletBalance={Number(profile?.wallet_balance ?? 0)}
      timeCredit={Number(profile?.time_credit_min ?? 0)}
      txns={(txnsRes.data ?? []) as any}
      timeCreditLog={(tcRes.data ?? []) as any}
      rechargeHistory={(rechargesRes.data ?? []) as any}
      settings={settings}
    />
  )
}