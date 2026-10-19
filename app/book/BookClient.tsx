'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatINR, calcAmount, getPlayerRate, getDiscountInfo } from '@/lib/utils/money'
import { formatDate, formatTime, formatDuration, formatTimeRange, todayIST, addDaysIST } from '@/lib/utils/time'
import { generateSlots, validDurations, type BookedRange } from '@/lib/utils/slots'
import { SlotGrid } from '@/components/SlotGrid'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { GameDetailModal } from '@/components/GameDetailModal'
import { toast } from '@/components/ui/Toast'
import { createBooking } from '@/lib/actions/bookings'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  single_player_rate: number
  multiplayer_rate: number
  pricing_mode: 'flat' | 'pct_discount' | 'amt_discount' | string | null
  player_rates: Record<string, number> | null
  max_players: number
  display_order: number
}

type Category = { id: string; name: string }

type ConsoleWithAvailability = {
  id: string
  name: string
  type: string
  joysticks: number
  status: 'free' | 'busy' | 'maintenance'
  bookedRanges: BookedRange[]
  freeAt: string | null
}

type Step = 1 | 2 | 3 | 4

interface Props {
  games: Game[]
  categories: Category[]
  settings: any
}

export function BookClient({ games, categories, settings }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState(1)
  const [console_, setConsole] = useState<ConsoleWithAvailability | null>(null)
  const [date, setDate] = useState(todayIST())
  const [slotStart, setSlotStart] = useState<Date | null>(null)
  const [slotEnd, setSlotEnd] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)

  const [consoles, setConsoles] = useState<ConsoleWithAvailability[]>([])
  const [loadingConsoles, setLoadingConsoles] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const [detailGame, setDetailGame] = useState<Game | null>(null)
  const [consoleCountMap, setConsoleCountMap] = useState<Record<string, number>>({})
  const [nowTick, setNowTick] = useState(0)

  const cfg = useMemo(() => ({
    open_hour: Number(settings.open_hour ?? 9),
    close_hour: Number(settings.close_hour ?? 21),
    slot_minutes: Number(settings.slot_minutes ?? 30),
    min_duration_min: Number(settings.min_duration_min ?? 30),
    max_duration_min: Number(settings.max_duration_min ?? 240),
    cutoff_hours: Number(settings.cutoff_hours ?? 2),
    cancellation_fee_pct: Number(settings.cancellation_fee_pct ?? 0.1),
  }), [settings])

  useEffect(() => {
    setStep(1)
    setGame(null)
    setPlayers(1)
    setConsole(null)
    setDate(todayIST())
    setSlotStart(null)
    setSlotEnd(null)
    setConsoles([])
    setLoadingConsoles(false)
    setConfirmOpen(false)
    setBusy(false)
    setSearch('')
    setCategoryFilter(null)
    setDetailGame(null)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 60 * 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('game_consoles')
        .select('game_id, console:consoles(id, is_active)')

      const map: Record<string, number> = {}
      for (const m of (data ?? []) as any[]) {
        if (m.console?.is_active) {
          map[m.game_id] = (map[m.game_id] ?? 0) + 1
        }
      }
      setConsoleCountMap(map)
    })()
  }, [])

  useEffect(() => {
    if (step === 1) {
      setConsole(null)
      setSlotStart(null)
      setSlotEnd(null)
    }
    if (step === 2) {
      setConsole(null)
      setSlotStart(null)
      setSlotEnd(null)
    }
  }, [step])

  useEffect(() => {
    if (!game || step < 3) return
    void loadConsolesForGame(game.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, step, date])

  const loadConsolesForGame = async (gameId: string) => {
    setLoadingConsoles(true)
    const supabase = createClient()

    const { data: mappings } = await supabase
      .from('game_consoles')
      .select('console_id')
      .eq('game_id', gameId)
    const consoleIds = (mappings ?? []).map((m: any) => m.console_id)
    if (consoleIds.length === 0) {
      setConsoles([])
      setLoadingConsoles(false)
      return
    }

    const { data: rawConsoles } = await supabase
      .from('consoles')
      .select('id, name, type, joysticks, is_active')
      .in('id', consoleIds)
      .eq('is_active', true)
      .order('display_order')

    const { data: maints } = await supabase
      .from('console_maintenance')
      .select('console_id')
      .in('console_id', consoleIds)
      .eq('status', 'active')
    const maintSet = new Set((maints ?? []).map((m: any) => m.console_id))

    const dayStartIso = startOfDayISO(date)
    const dayEndIso = endOfDayISO(date)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('console_id, slot_start, slot_end, status')
      .in('console_id', consoleIds)
      .in('status', ['pending', 'confirmed', 'active'])
      .lt('slot_start', dayEndIso)
      .gt('slot_end', dayStartIso)

    const result: ConsoleWithAvailability[] = (rawConsoles ?? []).map((c: any) => {
      const ranges: BookedRange[] = []
      if (maintSet.has(c.id)) {
        ranges.push({ start: dayStartIso, end: dayEndIso, status: 'maintenance' })
      }
      for (const b of bookings ?? []) {
        if (b.console_id !== c.id) continue
        ranges.push({
          start: b.slot_start,
          end: b.slot_end,
          status: b.status === 'pending' ? 'pending' : 'confirmed',
        })
      }

      const isMaint = maintSet.has(c.id)
      const freeAt = findFirstFreeSlot(ranges, date)

      return {
        id: c.id,
        name: c.name,
        type: c.type,
        joysticks: c.joysticks,
        status: isMaint ? 'maintenance' : freeAt === 'now' ? 'free' : 'busy',
        bookedRanges: ranges,
        freeAt: freeAt === 'now' ? null : freeAt,
      }
    })

    setConsoles(result)
    setLoadingConsoles(false)
  }

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
      if (categoryFilter && g.category !== categoryFilter) return false
      return true
    })
  }, [games, search, categoryFilter])

  // --- PRICING CALCULATIONS ---
  const perPlayerRate = useMemo(() => {
    if (!game) return 0
    return getPlayerRate(
      game.player_rates,
      game.pricing_mode,
      players,
      game.single_player_rate ?? 100
    )
  }, [game, players])

  const totalHourlyRate = useMemo(() => {
    return perPlayerRate * players
  }, [perPlayerRate, players])

  const baseRate = useMemo(() => {
    if (!game) return 0
    return Number(game.player_rates?.['1'] ?? game.single_player_rate ?? 0)
  }, [game])

  const discountInfo = useMemo(() => {
    const totalBaseRate = baseRate * players;
    return getDiscountInfo(totalBaseRate, totalHourlyRate);
  }, [baseRate, totalHourlyRate, players]);

  const duration = useMemo(() => {
    if (!slotStart || !slotEnd) return 0
    return Math.round((slotEnd.getTime() - slotStart.getTime()) / 60000)
  }, [slotStart, slotEnd])

  const amount = useMemo(() => {
    if (!totalHourlyRate || !duration) return 0
    return calcAmount(totalHourlyRate, duration)
  }, [totalHourlyRate, duration])

  const slots = useMemo(() => {
    if (!console_) return []
    return generateSlots({
      date,
      openHour: cfg.open_hour,
      closeHour: cfg.close_hour,
      slotMinutes: cfg.slot_minutes,
      bookedRanges: console_.bookedRanges,
      nowOverride: undefined,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [console_, date, cfg, nowTick])

  const canProceedStep1 = !!game
  const canProceedStep2 = players >= 1 && players <= (game?.max_players ?? 4)
  const canProceedStep3 = !!console_ && !!slotStart && !!slotEnd && duration > 0

  const nextStep = () => {
    if (step === 1 && canProceedStep1) setStep(2)
    else if (step === 2 && canProceedStep2) setStep(3)
    else if (step === 3 && canProceedStep3) setStep(4)
  }

  const prevStep = () => {
    if (step > 1) setStep((step - 1) as Step)
  }

  const handleHeaderBack = () => {
    if (step > 1) {
      prevStep()
    } else {
      router.push('/')
    }
  }

  const handleSelectConsole = (c: ConsoleWithAvailability) => {
    if (console_?.id === c.id) {
      setConsole(null)
      setSlotStart(null)
      setSlotEnd(null)
    } else {
      setConsole(c)
      setSlotStart(null)
      setSlotEnd(null)
    }
  }

  const handleSelectPlayers = (n: number) => {
    setPlayers(n)
    if (console_ && console_.joysticks < n) {
      setConsole(null)
      setSlotStart(null)
      setSlotEnd(null)
    }
  }

  const handleSlotClick = (s: Date) => {
    if (!console_) return
    if (s.getTime() <= Date.now()) return

    if (!slotStart) {
      setSlotStart(s)
      setSlotEnd(null)
      return
    }

    if (!slotEnd) {
      const clickMs = s.getTime()
      const startMs = slotStart.getTime()

      if (clickMs === startMs) {
        setSlotStart(null)
        return
      }

      if (clickMs < startMs) {
        setSlotStart(s)
        setSlotEnd(null)
        return
      }

      const mins = Math.round((clickMs - startMs) / 60000)

      const validMins = validDurations(
        slotStart,
        cfg.close_hour,
        cfg.slot_minutes,
        cfg.min_duration_min,
        cfg.max_duration_min,
        console_.bookedRanges
      )

      if (!validMins.includes(mins)) {
        toast.error(
          'Invalid duration',
          `Pick an end time within ${cfg.min_duration_min}-${cfg.max_duration_min} mins`
        )
        return
      }

      setSlotEnd(s)
      return
    }

    setSlotStart(s)
    setSlotEnd(null)
  }

  const handleConfirm = async () => {
    if (!game || !console_ || !slotStart || !slotEnd) return
    setBusy(true)
    try {
      // ✅ Ikkada 'amount' pass chesthunnamu
      await createBooking({
        game_id: game.id,
        console_id: console_.id,
        slot_start: slotStart.toISOString(),
        duration_min: duration,
        players,
        amount: amount, // 👈 Added amount
      })
      toast.success('Booking placed', 'Waiting for admin confirmation')
      router.push('/bookings')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      const isConflict =
        msg.toLowerCase().includes('booked') ||
        msg.toLowerCase().includes('slot')

      if (isConflict) {
        toast.error('Slot just taken', msg)
        if (game) void loadConsolesForGame(game.id)
        setSlotStart(null)
        setSlotEnd(null)
      } else {
        toast.error('Booking failed', msg)
      }
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleHeaderBack}
            aria-label="Back"
            className="text-gray-400 hover:text-cyan-400 transition text-lg leading-none"
          >
            ←
          </button>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            BOOK SESSION
          </h1>
        </div>

        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center gap-1">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`flex-1 h-1 rounded-full transition ${
                  step >= s ? 'bg-gradient-to-r from-cyan-400 to-pink-500' : 'bg-neutral-800'
                }`}
              />
            </div>
          ))}
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-2 flex justify-between text-[10px] tracking-wider font-bold">
          <span className={step >= 1 ? 'text-cyan-400' : 'text-gray-600'}>GAME</span>
          <span className={step >= 2 ? 'text-cyan-400' : 'text-gray-600'}>PLAYERS</span>
          <span className={step >= 3 ? 'text-cyan-400' : 'text-gray-600'}>TIME</span>
          <span className={step >= 4 ? 'text-cyan-400' : 'text-gray-600'}>CONFIRM</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-28">
        {step === 1 && (
          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Search games..."
                className="flex-1 bg-[#12121a] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryFilter(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                  !categoryFilter
                    ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                    : 'bg-white/5 border-white/10 text-gray-400'
                }`}
              >
                ALL
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryFilter(c.name)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                    categoryFilter === c.name
                      ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                      : 'bg-white/5 border-white/10 text-gray-400'
                  }`}
                >
                  {c.name.toUpperCase()}
                </button>
              ))}
            </div>

            {filteredGames.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-5xl mb-3">🎮</div>
                <p className="text-gray-400 text-sm">No games found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredGames.map((g) => {
                  const isSelected = game?.id === g.id
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDetailGame(g)
                      }}
                      className={`relative text-left rounded-2xl overflow-hidden border-2 transition-all duration-200 active:scale-[0.97] cursor-pointer ${
                        isSelected
                          ? 'border-cyan-500 ring-4 ring-cyan-500/30 shadow-lg shadow-cyan-500/20'
                          : 'border-white/10 hover:border-cyan-500/60'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-cyan-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-cyan-500/50">
                          ✓
                        </div>
                      )}

                      <div className="absolute top-2 left-2 z-10 w-9 h-9 rounded-full bg-cyan-500/15 backdrop-blur-md border-2 border-cyan-500/60 shadow-lg shadow-cyan-500/30 flex items-center justify-center">
                        <span className="text-[10px] font-black text-cyan-300 tabular-nums">
                          {g.max_players}P
                        </span>
                      </div>

                      <div className="relative aspect-square bg-gradient-to-br from-cyan-500/20 to-pink-500/20">
                        {g.image_url ? (
                          <img
                            src={g.image_url}
                            alt={g.name}
                            className="w-full h-full object-cover pointer-events-none"
                            draggable={false}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">🎮</div>
                        )}
                      </div>
                      <div className="p-2.5 bg-[#12121a]">
                        <div className="font-bold text-sm text-white truncate">{g.name}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-cyan-500/20">
              <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
                {game && (
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-500 tracking-wider">SELECTED</div>
                    <div className="text-sm font-bold text-white truncate">{game.name}</div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!canProceedStep1}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm tracking-wider disabled:opacity-40"
                >
                  {canProceedStep1 ? 'CONTINUE →' : 'SELECT A GAME'}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 2 && game && (
          <div className="space-y-5">
            <div className="text-center py-4">
              <div className="text-xs text-gray-500 tracking-wider mb-1">SELECTED</div>
              <div className="font-bold text-white">{game.name}</div>
            </div>

            <div className="bg-[#12121a] border border-cyan-500/20 rounded-2xl p-4">
              <div className="text-xs text-gray-500 tracking-wider mb-2">HOW MANY PLAYERS?</div>
              <div className="text-[10px] text-cyan-400 mb-3">Max {game.max_players} players</div>

              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((n) => {
                  const locked = n > game.max_players
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => !locked && handleSelectPlayers(n)}
                      disabled={locked}
                      className={`py-3 rounded-xl border text-sm font-bold transition relative ${
                        locked
                          ? 'border-white/5 bg-white/[0.02] text-gray-700 cursor-not-allowed'
                          : players === n
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                          : 'border-white/10 bg-white/5 text-gray-300 hover:border-cyan-500/40'
                      }`}
                    >
                      <span className={locked ? 'opacity-40' : ''}>{n}</span>
                      {locked && <span className="absolute top-1 right-1 text-[9px]">🔒</span>}
                    </button>
                  )
                })}
              </div>

              <div
                className="grid gap-1 mt-2 text-[9px] text-center"
                style={{ gridTemplateColumns: `repeat(${game.max_players}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: game.max_players }, (_, i) => i + 1).map((n) => {
                  const rate = getPlayerRate(game.player_rates, game.pricing_mode, n, game.single_player_rate)
                  return (
                    <div key={n} className={n === players ? 'text-cyan-400 font-bold' : 'text-gray-500'}>
                      ₹{rate}/player/hr
                    </div>
                  )
                })}
              </div>

              {/* New Detailed Pricing Summary in Step 2 */}
              <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4 mt-5">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Per Player Rate</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">₹{perPlayerRate}/hr</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400">Total Players</span>
                    <span className="font-bold text-white">× {players}</span>
                  </div>

                  <div className="h-px bg-white/10 my-1 w-full" />

                  <div className="flex justify-between items-center">
                    <span className="text-cyan-400 font-bold text-sm">Total Rate</span>
                    <div className="flex items-center gap-2">
                      {discountInfo.hasDiscount && (
                        <span className="text-xs text-gray-500 line-through font-mono">
                          ₹{baseRate * players}/hr
                        </span>
                      )}
                      <span className="font-black text-cyan-400 text-lg">
                        ₹{totalHourlyRate}/hr
                      </span>
                    </div>
                  </div>
                  
                  {discountInfo.hasDiscount && (
                    <div className="text-right text-[10px] text-green-400 font-bold mt-1">
                      🎉 {discountInfo.pct}% OFF Applied
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && game && (
          <div className="space-y-5">
            {loadingConsoles ? (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
              </div>
            ) : consoles.length === 0 ? (
              <div className="text-center py-10">
                <div className="text-4xl mb-2">😔</div>
                <p className="text-sm text-gray-400">No consoles available for this game right now.</p>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-xs text-gray-500 tracking-wider mb-2">
                    1. PICK CONSOLE ({players} player{players > 1 ? 's' : ''})
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {consoles.map((c) => {
                      const incompatible = c.joysticks < players
                      const maint = c.status === 'maintenance'
                      const disabled = incompatible || maint
                      const selected = console_?.id === c.id

                      const cardClass = disabled
                        ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/[0.02]'
                        : selected
                        ? 'border-cyan-400 bg-gradient-to-br from-cyan-500/20 to-pink-500/10 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/30'
                        : 'border-cyan-500/20 bg-gradient-to-br from-[#12121a] to-[#0a0a0f] hover:border-cyan-400/60 hover:shadow-lg hover:shadow-cyan-500/10'

                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => !disabled && handleSelectConsole(c)}
                          disabled={disabled}
                          className={`relative text-left rounded-xl border-2 p-3 transition-all duration-200 active:scale-[0.97] ${cardClass}`}
                        >
                          <div className="absolute top-3 right-3">
                            <span className={`block w-2.5 h-2.5 rounded-full ${
                              maint
                                ? 'bg-amber-400 shadow-lg shadow-amber-400/50'
                                : incompatible
                                ? 'bg-red-400 shadow-lg shadow-red-400/50'
                                : c.status === 'busy'
                                ? 'bg-amber-400 shadow-lg shadow-amber-400/50'
                                : 'bg-green-400 shadow-lg shadow-green-400/50 animate-pulse'
                            }`} />
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xl">🎮</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm text-white truncate">{c.name}</div>
                              <div className="text-[10px] text-gray-500 truncate">{c.type}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] text-cyan-300 font-bold mb-2">
                            <span>🎮</span>
                            <span>{c.joysticks} joysticks</span>
                          </div>

                          <div className="text-[10px] font-bold">
                            {maint ? (
                              <span className="text-amber-400">🔧 Maintenance</span>
                            ) : incompatible ? (
                              <span className="text-red-400">❌ Need {players}</span>
                            ) : c.status === 'busy' && c.freeAt ? (
                              <span className="text-amber-400">🟡 Busy · {formatTime(c.freeAt)}</span>
                            ) : (
                              <span className="text-green-400">🟢 Free</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {console_ && (
                  <>
                    <div>
                      <div className="text-xs text-gray-500 tracking-wider mb-2">2. DATE</div>
                      <div className="flex gap-2 overflow-x-auto pb-1 hide-scroll">
                        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                          const dt = addDaysIST(todayIST(), d)
                          const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(dt)
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setDate(dt)
                                setSlotStart(null)
                                setSlotEnd(null)
                              }}
                              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition ${
                                date === dt
                                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                  : 'border-white/10 bg-white/5 text-gray-400'
                              }`}
                            >
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 tracking-wider mb-2">3. TIME SLOT</div>

                      <div
                        className={`rounded-xl border px-4 py-3 mb-4 transition-all flex items-center justify-between ${
                          slotStart && slotEnd
                            ? 'border-green-500/40 bg-green-500/10 text-green-300 shadow-lg shadow-green-500/10'
                            : slotStart
                            ? 'border-pink-500/40 bg-pink-500/10 text-pink-300 shadow-lg shadow-pink-500/10'
                            : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                        }`}
                      >
                        {slotStart && slotEnd ? (
                          <>
                            <div>
                              <div className="text-[10px] font-bold tracking-wider uppercase opacity-70 mb-0.5">
                                Selected Time
                              </div>
                              <div className="font-bold text-sm text-white">
                                {formatTime(slotStart.toISOString())} - {formatTime(slotEnd.toISOString())}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSlotStart(null)
                                setSlotEnd(null)
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition"
                            >
                              CLEAR
                            </button>
                          </>
                        ) : slotStart ? (
                          <span>
                            👉 Now tap a <span className="font-bold">later slot</span> to set end time
                          </span>
                        ) : (
                          <span>
                            👉 Tap any slot to set <span className="font-bold">start time</span>
                          </span>
                        )}
                      </div>

                      <div className="relative">
                        {slotStart && slotEnd && (
                          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none rounded-lg">
                            <div className="absolute inset-0 w-[200%] bg-gradient-to-r from-transparent via-white/10 to-transparent animate-laser" />
                          </div>
                        )}
                        
                        <div className="relative z-10">
                          <SlotGrid
                            slots={slots}
                            selectedStart={slotStart}
                            selectedEnd={slotEnd}
                            onSelect={handleSlotClick}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-[9px] text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded border border-white/20 bg-white/10" /> Free
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded bg-green-500/60" /> Booked
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded bg-yellow-500/60" /> Pending
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded bg-red-500/60" /> Maintenance
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {step === 4 && game && console_ && slotStart && slotEnd && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-5">
              <div className="text-xs text-gray-500 tracking-wider mb-4">BOOKING SUMMARY</div>

              <div className="space-y-2 text-sm">
                <Row label="Game" value={game.name} />
                <Row label="Console" value={`${console_.name} (🎮 ${console_.joysticks})`} />
                <Row label="Date" value={formatDate(slotStart)} />
                <Row label="Time" value={formatTimeRange(slotStart, slotEnd)} />
                <Row label="Duration" value={formatDuration(duration)} />
                <Row label="Players" value={`${players} ${players === 1 ? '(single)' : '(multi)'}`} />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                {discountInfo.hasDiscount ? (
                  <>
                    <Row label={`Base Rate (${players} players)`} value={`₹${baseRate * players}/hr`} />
                    <Row
                      label="Offer Rate"
                      value={`₹${totalHourlyRate}/hr (${discountInfo.pct}% off)`}
                    />
                  </>
                ) : (
                  <Row label={`Rate (${players} players)`} value={`₹${totalHourlyRate}/hr`} />
                )}
                
                {/* Adding per player clarity in Summary */}
                <div className="text-[10px] text-gray-500 text-right mt-1">
                  (₹{perPlayerRate}/hr per player × {players} players)
                </div>

                <Row label="Total" value={formatINR(amount)} bold />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 text-xs text-amber-300 space-y-1">
                <div>ⓘ Amount deducted only after admin confirms your booking.</div>
                <div>ⓘ Free cancel/reschedule up to {cfg.cutoff_hours} hrs before start. {Math.round(cfg.cancellation_fee_pct * 100)}% fee after.</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold tracking-wider"
            >
              CONFIRM BOOKING
            </button>
          </div>
        )}
      </main>

      {step > 1 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-cyan-500/20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={prevStep}
              className="px-4 py-3 rounded-xl border border-white/10 text-sm font-bold text-gray-300 hover:border-cyan-500/40 transition"
            >
              ← BACK
            </button>

            {step < 4 && (
              <button
                type="button"
                onClick={nextStep}
                disabled={
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                }
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm tracking-wider disabled:opacity-40 transition flex items-center justify-center gap-2"
              >
                {step === 3 && slotStart && slotEnd ? (
                  <>
                    CONFIRM {formatTime(slotStart.toISOString())} - {formatTime(slotEnd.toISOString())} →
                  </>
                ) : (
                  <>CONTINUE →</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {confirmOpen && game && console_ && slotStart && slotEnd && (
        <ConfirmActionModal
          open
          title="Confirm Booking"
          variant="info"
          summary={[
            `${game.name} • ${console_.name}`,
            `${formatDate(slotStart)} • ${formatTimeRange(slotStart, slotEnd)}`,
            `${players} player${players > 1 ? 's' : ''} • ${formatDuration(duration)}`,
          ]}
          breakdown={[
            ...(discountInfo.hasDiscount
              ? [
                  { label: `Base Rate (${players} players)`, value: baseRate * players },
                  { label: `Offer Rate (${discountInfo.pct}% off)`, value: totalHourlyRate, highlight: 'green' as const },
                ]
              : [{ label: `Rate (${players} players)`, value: totalHourlyRate }]),
            { label: 'Total', value: amount, bold: true },
          ]}
          notices={[
            'Amount deducted after admin confirms.',
            `Cancel/reschedule within ${cfg.cutoff_hours} hrs. ${Math.round(cfg.cancellation_fee_pct * 100)}% fee applies.`,
          ]}
          confirmLabel={busy ? 'Placing...' : 'Confirm Booking'}
          cancelLabel="Go Back"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {detailGame && (
        <GameDetailModal
          game={detailGame}
          consoleCount={consoleCountMap[detailGame.id]}
          onClose={() => setDetailGame(null)}
          onSelect={() => {
            setGame(detailGame)
            setPlayers(1)
            setDetailGame(null)
            toast.success('Selected', detailGame.name)
          }}
        />
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-gray-400">{label}</span>
      <span className={`text-right ${bold ? 'font-bold text-cyan-400' : 'text-white'}`}>{value}</span>
    </div>
  )
}

function startOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600000).toISOString()
}

function endOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1) - 5.5 * 3600000).toISOString()
}

function findFirstFreeSlot(ranges: BookedRange[], date: string): 'now' {
  if (ranges.length === 0) return 'now'
  return 'now'
}