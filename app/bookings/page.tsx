// app/bookings/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BookingsClient } from './BookingsClient'
import { getAllSettings } from '@/lib/actions/settings'

export const instant = false

export default async function BookingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const settings = await getAllSettings()

  const { data: bookings } = await supabase
    .from('bookings')
    .select(`
      id, user_id, game_id, console_id,
      slot_start, slot_end, duration_min, players,
      hourly_rate_snapshot, rate_type, amount,
      cancellation_fee, reschedule_fee, refund_amount,
      status, created_at, confirmed_at, started_at, ended_at,
      cancelled_at, cancel_reason,
      actual_start_at, actual_end_at, arrival_delta_min,
      overrun_min, overrun_charged,
      rescheduled_from, rescheduled_to, reschedule_count,
      game:games(id, name, image_url),
      console:consoles(id, name, type, joysticks)
    `)
    .eq('user_id', user.id)
    .order('slot_start', { ascending: false })
    .limit(100)

  const { data: profile } = await supabase
    .from('profiles')
    .select('wallet_balance, time_credit_min')
    .eq('id', user.id)
    .single()

  return (
    <BookingsClient
      bookings={(bookings ?? []) as any}
      settings={settings}
      walletBalance={Number(profile?.wallet_balance ?? 0)}
      timeCredit={Number(profile?.time_credit_min ?? 0)}
    />
  )
}