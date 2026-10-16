'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  hourly_rate: number
  is_active: boolean
}

type Console = {
  id: string
  name: string
  type: string
  is_active: boolean
}

export default function MappingPage() {
  const [games, setGames] = useState<Game[]>([])
  const [consoles, setConsoles] = useState<Console[]>([])
  const [mappings, setMappings] = useState<Record<string, Set<string>>>({})
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const fetchData = async () => {
    const supabase = createClient()

    const [gamesRes, consolesRes, mappingsRes] = await Promise.all([
      supabase.from('games').select('*').eq('is_active', true).order('display_order'),
      supabase.from('consoles').select('*').eq('is_active', true).order('display_order'),
      supabase.from('game_consoles').select('game_id, console_id'),
    ])

    setGames((gamesRes.data as any) ?? [])
    setConsoles((consolesRes.data as any) ?? [])

    const map: Record<string, Set<string>> = {}
    mappingsRes.data?.forEach((m: any) => {
      if (!map[m.game_id]) map[m.game_id] = new Set()
      map[m.game_id].add(m.console_id)
    })
    setMappings(map)
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  const toggleMapping = (gameId: string, consoleId: string) => {
    setMappings((prev) => {
      const newMap = { ...prev }
      if (!newMap[gameId]) newMap[gameId] = new Set()
      const set = new Set(newMap[gameId])
      if (set.has(consoleId)) {
        set.delete(consoleId)
      } else {
        set.add(consoleId)
      }
      newMap[gameId] = set
      return newMap
    })
  }

  const handleSave = async () => {
    if (!selectedGame) return
    setSaving(true)

    const supabase = createClient()
    const gameId = selectedGame.id
    const selectedConsoleIds = Array.from(mappings[gameId] ?? [])

    // Delete all existing mappings for this game
    await supabase.from('game_consoles').delete().eq('game_id', gameId)

    // Insert new mappings
    if (selectedConsoleIds.length > 0) {
      const inserts = selectedConsoleIds.map((consoleId) => ({
        game_id: gameId,
        console_id: consoleId,
      }))
      const { error } = await supabase.from('game_consoles').insert(inserts)
      if (error) {
        alert('Save failed: ' + error.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    setSelectedGame(null)
    fetchData()
    router.refresh()
  }

  const typeColors: Record<string, string> = {
    PS4: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    PS5: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    Xbox: 'bg-green-500/20 text-green-300 border-green-500/50',
    PC: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
    VR: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          GAME ↔ CONSOLE
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          EE GAME EE CONSOLE LO UNDO SET CHEY
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Games List */}
          <div>
            <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-3">
              GAMES
            </h3>
            <div className="space-y-2">
              {games.map((g) => {
                const count = mappings[g.id]?.size ?? 0
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGame(g)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                      selectedGame?.id === g.id
                        ? 'bg-cyan-500/20 border-cyan-500'
                        : 'bg-[#12121a] border-cyan-500/20 hover:border-cyan-500/50'
                    }`}
                  >
                    {g.image_url ? (
                      <img
                        src={g.image_url}
                        alt={g.name}
                        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-xl">🎮</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate">{g.name}</p>
                      <p className="text-[10px] text-gray-500">
                        {count === 0
                          ? '⚠️ No consoles'
                          : `✅ ${count} console${count !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Right: Consoles Selection */}
          <div>
            <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-3">
              {selectedGame
                ? `CONSOLES FOR "${selectedGame.name}"`
                : 'SELECT A GAME'}
            </h3>

            {!selectedGame ? (
              <div className="bg-[#12121a] border border-cyan-500/20 rounded-2xl p-10 text-center">
                <p className="text-gray-500 text-sm">
                  ← Left nunchi game select chey
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4">
                  {consoles.map((c) => {
                    const isSelected =
                      mappings[selectedGame.id]?.has(c.id) ?? false
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleMapping(selectedGame.id, c.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition text-left ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-500'
                            : 'bg-[#12121a] border-cyan-500/20 hover:border-cyan-500/50'
                        }`}
                      >
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                            isSelected
                              ? 'bg-cyan-500 border-cyan-500'
                              : 'border-gray-600'
                          }`}
                        >
                          {isSelected && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-sm">{c.name}</p>
                            <span
                              className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full border ${
                                typeColors[c.type] ?? typeColors.PS4
                              }`}
                            >
                              {c.type}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50 tracking-wider"
                >
                  {saving ? 'SAVING...' : `SAVE MAPPING`}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}