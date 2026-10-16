// app/book/BookClient.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatINR, calcAmount } from '@/lib/utils/money'
import { formatDate, formatTime, formatDuration, formatTimeRange, todayIST, addDaysIST } from '@/lib/utils/time'
import { generateSlots, canBookFrom, validDurations, type BookedRange } from '@/lib/utils/slots'
import { SlotGrid } from '@/components/SlotGrid'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { toast } from '@/components/ui/Toast'
import { createBooking } from '@/lib/actions/bookings'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  single_player_rate: number
  multiplayer_rate: number
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

  // selections
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState(1)
  const [console_, setConsole] = useState<ConsoleWithAvailability | null>(null)
  const [date, setDate] = useState(todayIST())
  const [slotStart, setSlotStart] = useState<Date | null>(null)
  const [duration, setDuration] = useState(60)
  const [customDuration, setCustomDuration] = useState(false)

  // derived data
  const [consoles, setConsoles] = useState<ConsoleWithAvailability[]>([])
  const [loadingConsoles, setLoadingConsoles] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)

  const maxPlayers = useMemo(() => {
    // Max across any console that supports this game — will refine once consoles loaded
    return 8
  }, [])

  // Reset on back-navigation logic
  useEffect(() => {
    if (step === 1) {
      setGame(null)
      setConsole(null)
      setSlotStart(null)
    }
    if (step === 2) {
      setConsole(null)
      setSlotStart(null)
    }
    if (step === 3) {
      setSlotStart(null)
    }
  }, [step])

  // Load consoles when game+players selected
  useEffect(() => {
    if (!game || step < 3) return
    void loadConsolesForGame(game.id)
  }, [game?.id, step, date])

  const loadConsolesForGame = async (gameId: string) => {
    setLoadingConsoles(true)
    const supabase = createClient()

    // Find consoles mapped to this game
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

    // Load console details
    const { data: rawConsoles } = await supabase
      .from('consoles')
      .select('id, name, type, joysticks, is_active')
      .in('id', consoleIds)
      .eq('is_active', true)
      .order('display_order')

    // Load active maintenance
    const { data: maints } = await supabase
      .from('console_maintenance')
      .select('console_id')
      .in('console_id', consoleIds)
      .eq('status', 'active')
    const maintSet = new Set((maints ?? []).map((m: any) => m.console_id))

    // Load bookings for chosen date
    const dayStartIso = startOfDayISO(date)
    const dayEndIso = endOfDayISO(date)
    const { data: bookings } = await supabase
      .from('bookings')
      .select('console_id, slot_start, slot_end, status')
      .in('console_id', consoleIds)
      .in('status', ['pending', 'confirmed', 'active'])
      .lt('slot_start', dayEndIso)
      .gt('slot_end', dayStartIso)

    // Build result
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

  // Filtering games
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (search && !g.name.toLowerCase().includes(search.toLowerCase())) return false
      if (categoryFilter && g.category !== categoryFilter) return false
      return true
    })
  }, [games, search, categoryFilter])

  // Rate selection
  const hourlyRate = useMemo(() => {
    if (!game) return 0
    return players === 1 ? game.single_player_rate : game.multiplayer_rate
  }, [game, players])

  const amount = useMemo(() => {
    if (!hourlyRate) return 0
    return calcAmount(hourlyRate, duration)
  }, [hourlyRate, duration])

  // Slot generation
  const slots = useMemo(() => {
    if (!console_) return []
    return generateSlots({
      date,
      openHour: settings.open_hour,
      closeHour: settings.close_hour,
      slotMinutes: settings.slot_minutes,
      bookedRanges: console_.bookedRanges,
      nowOverride: undefined,
    })
  }, [console_, date, settings])

  // Valid durations
  const availableDurations = useMemo(() => {
    if (!slotStart || !console_) return []
    return validDurations(
      slotStart,
      settings.close_hour,
      settings.slot_minutes,
      settings.min_duration_min,
      settings.max_duration_min,
      console_.bookedRanges
    )
  }, [slotStart, console_, settings])

  // Step guards
  const canProceedStep1 = !!game
  const canProceedStep2 = players >= 1 && players <= 8
  const canProceedStep3 = !!console_ && !!slotStart && duration > 0 && availableDurations.includes(duration)

  const nextStep = () => {
    if (step === 1 && canProceedStep1) setStep(2)
    else if (step === 2 && canProceedStep2) setStep(3)
    else if (step === 3 && canProceedStep3) setStep(4)
  }

  const prevStep = () => {
    if (step > 1) setStep((step - 1) as Step)
  }

  const handleConfirm = async () => {
    if (!game || !console_ || !slotStart) return
    setBusy(true)
    try {
      await createBooking({
        game_id: game.id,
        console_id: console_.id,
        slot_start: slotStart.toISOString(),
        duration_min: duration,
        players,
      })
      toast.success('Booking placed', 'Waiting for admin confirmation')
      router.push('/bookings')
      router.refresh()
    } catch (e) {
      toast.error('Booking failed', e instanceof Error ? e.message : 'Unknown')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            BOOK SESSION
          </h1>
        </div>

        {/* Progress */}
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
        {/* STEP 1: GAME */}
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
                {filteredGames.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setGame(g)}
                    className={`text-left rounded-2xl overflow-hidden border transition ${
                      game?.id === g.id
                        ? 'border-cyan-500 ring-2 ring-cyan-500/40'
                        : 'border-white/10 hover:border-cyan-500/40'
                    }`}
                  >
                    <div className="relative aspect-square bg-gradient-to-br from-cyan-500/20 to-pink-500/20">
                      {g.image_url ? (
                        <img src={g.image_url} alt={g.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl opacity-40">🎮</div>
                      )}
                    </div>
                    <div className="p-2.5 bg-[#12121a]">
                      <div className="font-bold text-sm text-white truncate">{g.name}</div>
                      <div className="flex gap-2 mt-1 text-[10px]">
                        <span className="text-cyan-400 font-bold">👤 ₹{g.single_player_rate}/hr</span>
                        <span className="text-pink-400 font-bold">👥 ₹{g.multiplayer_rate}/hr</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: PLAYERS */}
        {step === 2 && game && (
          <div className="space-y-5">
            <div className="text-center py-4">
              <div className="text-xs text-gray-500 tracking-wider mb-1">SELECTED</div>
              <div className="font-bold text-white">{game.name}</div>
            </div>

            <div className="bg-[#12121a] border border-cyan-500/20 rounded-2xl p-4">
              <div className="text-xs text-gray-500 tracking-wider mb-3">HOW MANY PLAYERS?</div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPlayers(n)}
                    className={`py-3 rounded-xl border text-sm font-bold transition ${
                      players === n
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-white/10 bg-white/5 text-gray-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Rate</span>
                  <span className="font-bold text-cyan-400">
                    {players === 1
                      ? `👤 ₹${game.single_player_rate}/hr (single)`
                      : `👥 ₹${game.multiplayer_rate}/hr (multiplayer)`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: TIME */}
        {step === 3 && game && (
          <div className="space-y-5">
            {/* Console picker */}
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
                  <div className="space-y-2">
                    {consoles.map((c) => {
                      const incompatible = c.joysticks < players
                      const maint = c.status === 'maintenance'
                      const disabled = incompatible || maint

                      return (
                        <button
                          key={c.id}
                          onClick={() => !disabled && setConsole(c)}
                          disabled={disabled}
                          className={`w-full text-left rounded-xl p-3 border flex items-center justify-between gap-3 transition ${
                            disabled
                              ? 'opacity-50 cursor-not-allowed border-white/5'
                              : console_?.id === c.id
                              ? 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500/30'
                              : 'border-white/10 hover:border-cyan-500/40'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{c.name}</span>
                              <span className="text-[10px] text-gray-500">{c.type}</span>
                              <span className="text-[10px] text-cyan-400 font-bold">🎮 {c.joysticks}</span>
                            </div>
                            <div className="text-[11px] mt-0.5">
                              {maint ? (
                                <span className="text-amber-400">🔧 Under Maintenance</span>
                              ) : incompatible ? (
                                <span className="text-red-400">❌ Only {c.joysticks} joysticks — need {players}</span>
                              ) : c.status === 'busy' && c.freeAt ? (
                                <span className="text-amber-400">🟡 Busy — free at {formatTime(c.freeAt)}</span>
                              ) : (
                                <span className="text-green-400">🟢 Free</span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {console_ && (
                  <>
                    {/* Date */}
                    <div>
                      <div className="text-xs text-gray-500 tracking-wider mb-2">2. DATE</div>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {[0, 1, 2].map((d) => {
                          const dt = addDaysIST(todayIST(), d)
                          const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(dt)
                          return (
                            <button
                              key={d}
                              onClick={() => {
                                setDate(dt)
                                setSlotStart(null)
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

                    {/* Slots */}
                    <div>
                      <div className="text-xs text-gray-500 tracking-wider mb-2">3. START TIME</div>
                      <SlotGrid
                        slots={slots}
                        selectedStart={slotStart}
                        onSelect={(s) => {
                          setSlotStart(s)
                          // Reset duration if no longer valid
                          if (!canBookFrom(s, duration, console_.bookedRanges)) {
                            setDuration(availableDurations[0] ?? 60)
                          }
                        }}
                      />
                    </div>

                    {/* Duration */}
                    {slotStart && (
                      <div>
                        <div className="text-xs text-gray-500 tracking-wider mb-2">4. DURATION</div>
                        <div className="flex gap-2 flex-wrap">
                          {[30, 60].map((d) => (
                            <button
                              key={d}
                              onClick={() => {
                                setDuration(d)
                                setCustomDuration(false)
                              }}
                              disabled={!availableDurations.includes(d)}
                              className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                                duration === d && !customDuration
                                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                  : 'border-white/10 bg-white/5 text-gray-300 disabled:opacity-30'
                              }`}
                            >
                              {d === 30 ? '30 MIN' : '1 HR'}
                            </button>
                          ))}
                          <button
                            onClick={() => setCustomDuration(true)}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                              customDuration
                                ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                : 'border-white/10 bg-white/5 text-gray-300'
                            }`}
                          >
                            CUSTOM
                          </button>
                        </div>

                        {customDuration && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {availableDurations.map((d) => (
                              <button
                                key={d}
                                onClick={() => setDuration(d)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                                  duration === d
                                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                                    : 'border-white/10 bg-white/5 text-gray-400'
                                }`}
                              >
                                {formatDuration(d)}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* STEP 4: CONFIRM */}
        {step === 4 && game && console_ && slotStart && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-5">
              <div className="text-xs text-gray-500 tracking-wider mb-4">BOOKING SUMMARY</div>

              <div className="space-y-2 text-sm">
                <Row label="Game" value={game.name} />
                <Row label="Console" value={`${console_.name} (🎮 ${console_.joysticks})`} />
                <Row label="Date" value={formatDate(slotStart)} />
                <Row
                  label="Time"
                  value={formatTimeRange(
                    slotStart,
                    new Date(slotStart.getTime() + duration * 60000)
                  )}
                />
                <Row label="Duration" value={formatDuration(duration)} />
                <Row label="Players" value={`${players} ${players === 1 ? '(single)' : '(multi)'}`} />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                <Row label="Rate" value={`${formatINR(hourlyRate)} / hr`} />
                <Row label="Total" value={formatINR(amount)} bold />
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 text-xs text-amber-300 space-y-1">
                <div>ⓘ Amount deducted only after admin confirms your booking.</div>
                <div>ⓘ Free cancel/reschedule up to {settings.cutoff_hours} hrs before start. {Math.round(settings.cancellation_fee_pct * 100)}% fee after.</div>
              </div>
            </div>

            <button
              onClick={() => setConfirmOpen(true)}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold tracking-wider"
            >
              CONFIRM BOOKING
            </button>
          </div>
        )}
      </main>

      {/* Bottom bar */}
      {step > 1 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-cyan-500/20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={prevStep}
              className="px-4 py-2.5 rounded-xl border border-white/10 text-sm font-bold text-gray-300"
            >
              ← BACK
            </button>

            {step < 4 && (
              <button
                onClick={nextStep}
                disabled={
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                }
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm tracking-wider disabled:opacity-40"
              >
                CONTINUE →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && game && console_ && slotStart && (
        <ConfirmActionModal
          open
          title="Confirm Booking"
          variant="info"
          summary={[
            `${game.name} • ${console_.name}`,
            `${formatDate(slotStart)} • ${formatTimeRange(
              slotStart,
              new Date(slotStart.getTime() + duration * 60000)
            )}`,
            `${players} player${players > 1 ? 's' : ''} • ${formatDuration(duration)}`,
          ]}
          breakdown={[
            { label: 'Total', value: amount, bold: true },
          ]}
          notices={[
            'Amount deducted after admin confirms.',
            `Cancel/reschedule within ${settings.cutoff_hours} hrs. ${Math.round(settings.cancellation_fee_pct * 100)}% fee applies.`,
          ]}
          confirmLabel={busy ? 'Placing...' : 'Confirm Booking'}
          cancelLabel="Go Back"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmOpen(false)}
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

// ---- helpers ----

function startOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600000).toISOString()
}

function endOfDayISO(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1) - 5.5 * 3600000).toISOString()
}

function findFirstFreeSlot(ranges: BookedRange[], date: string): string | 'now' {
  if (ranges.length === 0) return 'now'
  // simplistic — could be refined
  return 'now'
}