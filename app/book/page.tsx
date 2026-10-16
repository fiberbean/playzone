// app/book/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BookClient } from './BookClient'
import { getAllSettings } from '@/lib/actions/settings'

export const instant = false

export default async function BookPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load games with active status
  const { data: games } = await supabase
    .from('games')
    .select('id, name, category, image_url, single_player_rate, multiplayer_rate, display_order')
    .eq('is_active', true)
    .order('display_order')

  const { data: categories } = await supabase
    .from('game_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('display_order')

  const settings = await getAllSettings()

  return (
    <BookClient
      games={games ?? []}
      categories={categories ?? []}
      settings={settings}
    />
  )
}