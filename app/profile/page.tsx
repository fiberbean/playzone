// app/profile/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileClient } from './ProfileClient'

export const instant = false

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, phone, role, wallet_balance, time_credit_min, notification_prefs, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Booking stats
  const { data: bookings } = await supabase
    .from('bookings')
    .select('status, amount')
    .eq('user_id', user.id)

  const stats = {
    total: bookings?.length ?? 0,
    completed: bookings?.filter((b: any) => b.status === 'completed').length ?? 0,
    spend: bookings?.filter((b: any) => ['completed', 'active', 'confirmed'].includes(b.status))
      .reduce((s: number, b: any) => s + Number(b.amount), 0) ?? 0,
  }

  return (
    <ProfileClient
      profile={profile as any}
      stats={stats}
    />
  )
}