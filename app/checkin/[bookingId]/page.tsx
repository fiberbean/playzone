// app/checkin/[bookingId]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { CheckinClient } from './CheckinClient'
import { getAllSettings } from '@/lib/actions/settings'

export const instant = false

export default async function CheckinPage({
  params,
}: {
  params: Promise<{ bookingId: string }>
}) {
  const { bookingId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, user_id, slot_start, slot_end, status, amount, players,
      game:games(name, image_url),
      console:consoles(name, type)
    `)
    .eq('id', bookingId)
    .single()

  if (!booking) notFound()
  if (booking.user_id !== user.id) redirect('/')

  const settings = await getAllSettings()

  return (
    <CheckinClient
      booking={booking as any}
      settings={settings}
    />
  )
}