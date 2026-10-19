// app/book/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BookClient } from './BookClient'
import { getAllSettings } from '@/lib/actions/settings'

export const instant = false

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>
}) {
  const { t } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load games with all pricing columns
  const { data: gamesData } = await supabase
    .from('games')
    .select(`
      id, name, category, image_url,
      single_player_rate, multiplayer_rate,
      pricing_mode, player_rates, max_players,
      display_order
    `)
    .eq('is_active', true)
    .order('display_order')

  // Load max joysticks per game (via game_consoles → consoles)
  const { data: mappings } = await supabase
    .from('game_consoles')
    .select('game_id, console:consoles(joysticks, is_active)')

  // Build game_id → max joysticks map
  const maxPlayersMap: Record<string, number> = {}
  for (const m of (mappings ?? []) as any[]) {
    const c = m.console
    if (!c || !c.is_active) continue
    const j = Number(c.joysticks ?? 2)
    if (!maxPlayersMap[m.game_id] || j > maxPlayersMap[m.game_id]) {
      maxPlayersMap[m.game_id] = j
    }
  }

  // Attach max_players to each game
  // Priority: 1) DB max_players (admin override), 2) auto from joysticks, 3) default 2
  const games = (gamesData ?? []).map((g) => {
    const dbMax = Number((g as any).max_players ?? 0)
    const autoMax = maxPlayersMap[g.id] ?? 2
    const finalMax = dbMax > 0 ? dbMax : autoMax

    return {
      ...g,
      max_players: finalMax,
      // Ensure player_rates is object
      player_rates: (g as any).player_rates ?? {},
      pricing_mode: (g as any).pricing_mode ?? 'flat',
    }
  })

  const { data: categories } = await supabase
    .from('game_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('display_order')

  const settings = await getAllSettings()

  return (
    <BookClient
      key={t ?? 'default'}
      games={games as any}
      categories={categories ?? []}
      settings={settings}
    />
  )
}