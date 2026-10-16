// app/bookings/BookingsClient.tsx
'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatINR, calcCancellation, calcAmount } from '@/lib/utils/money'
import {
  formatTime, formatDate, formatDateShort, formatDateTime,
  formatDuration, formatTimeRange, todayIST, addDaysIST,
} from '@/lib/utils/time'
import { canCancel, canReschedule, STATUS_LABELS } from '@/lib/utils/booking'
import { generateSlots, validDurations, type BookedRange } from '@/lib/utils/slots'
import { SlotGrid } from '@/components/SlotGrid'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { BlockedActionModal } from '@/components/ui/BlockedActionModal'
import { toast } from '@/components/ui/Toast'
import { cancelBooking, rescheduleBooking } from '@/lib/actions/bookings'

type Tab = 'upcoming' | 'past'

type Booking = {
  id: string
  user_id: string
  game_id: string
  console_id: string
  slot_start: string
  slot_end: string
  duration_min: number
  players: number
  hourly_rate_snapshot: number
  rate_type: 'single' | 'multiplayer'
  amount: number
  cancellation_fee: number
  reschedule_fee: number
  refund_amount: number
  status: string
  cancel_reason: string | null
  rescheduled_from: string | null
  rescheduled_to: string | null
  reschedule_count: number
  actual_start_at: string | null
  actual_end_at: string | null
  overrun_min: number
  overrun_charged: number
  game: { id: string; name: string; image_url: string | null } | null
  console: { id: string; name: string; type: string; joysticks: number } | null
}

interface Props {
  bookings: Booking[]
  settings: any
  walletBalance: number
  timeCredit: number
}

export function BookingsClient({ bookings, settings, walletBalance, timeCredit }: Props) {
  const [tab, setTab] = useState<Tab>('upcoming')
  const [local, setLocal] = useState(bookings)
  const [now, setNow] = useState(() => Date.now())

  // Update clock every 30s so time-based actions re-evaluate
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Realtime updates
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('customer-bookings')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `user_id=eq.${bookings[0]?.user_id ?? ''}` },
        async () => {
          const { data } = await supabase
            .from('bookings')
            .select(`
              id, user_id, game_id, console_id,
              slot_start, slot_end, duration_min, players,
              hourly_rate_snapshot, rate_type, amount,
              cancellation_fee, reschedule_fee, refund_amount,
              status, cancel_reason,
              rescheduled_from, rescheduled_to, reschedule_count,
              actual_start_at, actual_end_at, overrun_min, overrun_charged,
              game:games(id, name, image_url),
              console:consoles(id, name, type, joysticks)
            `)
            .eq('user_id', bookings[0]?.user_id ?? '')
            .order('slot_start', { ascending: false })
            .limit(100)
          if (data) setLocal(data as any)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [bookings])

  const upcoming = useMemo(
    () => local.filter((b) => ['pending', 'confirmed', 'active'].includes(b.status)),
    [local]
  )
  const past = useMemo(
    () => local.filter((b) => !['pending', 'confirmed', 'active'].includes(b.status)),
    [local]
  )

  const shown = tab === 'upcoming' ? upcoming : past

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
            <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
              MY BOOKINGS
            </h1>
          </div>
          <Link
            href="/book"
            className="text-xs font-bold px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white tracking-wider"
          >
            + BOOK
          </Link>
        </div>

        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2">
          <button
            onClick={() => setTab('upcoming')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wider border transition ${
              tab === 'upcoming'
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}
          >
            UPCOMING ({upcoming.length})
          </button>
          <button
            onClick={() => setTab('past')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wider border transition ${
              tab === 'past'
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}
          >
            PAST ({past.length})
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {shown.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-gray-400 text-sm">
              {tab === 'upcoming' ? 'No upcoming bookings' : 'No past bookings'}
            </p>
            {tab === 'upcoming' && (
              <Link
                href="/book"
                className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm"
              >
                Book a session
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                settings={settings}
                walletBalance={walletBalance}
                timeCredit={timeCredit}
                now={now}
                onUpdate={(updated) => {
                  setLocal((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function BookingCard({
  booking, settings, walletBalance, timeCredit, now, onUpdate,
}: {
  booking: Booking
  settings: any
  walletBalance: number
  timeCredit: number
  now: number
  onUpdate: (b: Booking) => void
}) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [blocked, setBlocked] = useState<{ title: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const startDate = new Date(booking.slot_start)
  const endDate = new Date(booking.slot_end)

  const cutoffHours = settings.cutoff_hours as number
  const cancelable = canCancel(booking as any, cutoffHours, new Date(now))
  const reschedulable = canReschedule(booking as any, cutoffHours, new Date(now))

  const cutoffMs = cutoffHours * 3600_000
  const cutoffTime = new Date(startDate.getTime() - cutoffMs)

  const handleCancelClick = () => {
    if (!cancelable) {
      setBlocked({
        title: '🚫 Cancellation Not Available',
        message: `Your session starts at ${formatTime(booking.slot_start)}.\n\nCancellation is allowed only up to ${cutoffHours} hours before start (${formatTime(cutoffTime)}).\n\nContact admin for special requests.`,
      })
      return
    }
    setCancelOpen(true)
  }

  const handleRescheduleClick = () => {
    if (!reschedulable) {
      setBlocked({
        title: '🚫 Reschedule Not Available',
        message: `Your session starts at ${formatTime(booking.slot_start)}.\n\nReschedule is allowed only up to ${cutoffHours} hours before start (${formatTime(cutoffTime)}).`,
      })
      return
    }
    setRescheduleOpen(true)
  }

  const handleCancelConfirm = async (reason?: string) => {
    setBusy(true)
    try {
      await cancelBooking(booking.id, reason)
      toast.success('Cancelled', 'Refund credited to wallet')
      setCancelOpen(false)
      // Will update via realtime
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
    }
  }

  const feePct = settings.cancellation_fee_pct as number
  const { fee, refund } = calcCancellation(booking.amount, feePct)

  return (
    <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-2xl overflow-hidden">
      {/* Top strip */}
      <div className="flex items-center gap-3 p-3 border-b border-white/5">
        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-cyan-500/30 to-pink-500/30 flex items-center justify-center overflow-hidden shrink-0">
          {booking.game?.image_url ? (
            <img src={booking.game.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xl">🎮</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white text-sm truncate">
            {booking.game?.name ?? '—'} • {booking.console?.name ?? '—'}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            {formatDate(booking.slot_start)} • {formatTimeRange(booking.slot_start, booking.slot_end)}
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Duration</span>
          <span className="text-white">{formatDuration(booking.duration_min)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Players</span>
          <span className="text-white">
            {booking.players} {booking.rate_type === 'single' ? '(single)' : '(multi)'}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">Amount</span>
          <span className="text-cyan-400 font-bold">{formatINR(booking.amount)}</span>
        </div>

        {booking.status === 'cancelled' && (
          <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2 text-[11px] text-red-300 space-y-0.5">
            <div>Cancelled — {formatINR(booking.cancellation_fee)} fee</div>
            <div>Refunded: {formatINR(booking.refund_amount)}</div>
            {booking.cancel_reason && <div className="italic">"{booking.cancel_reason}"</div>}
          </div>
        )}

        {booking.status === 'rescheduled' && (
          <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 p-2 text-[11px] text-purple-300">
            Rescheduled — {formatINR(booking.reschedule_fee)} fee applied
          </div>
        )}

        {booking.status === 'no_show' && (
          <div className="rounded-lg bg-gray-500/5 border border-gray-500/20 p-2 text-[11px] text-gray-400">
            Marked as no-show. No refund applied.
          </div>
        )}

        {booking.status === 'active' && (
          <ActiveSessionTimer slotEnd={booking.slot_end} slotStart={booking.slot_start} />
        )}

        {booking.overrun_charged > 0 && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2 text-[11px] text-amber-300">
            Overrun: +{booking.overrun_min} min → {formatINR(booking.overrun_charged)} charged
          </div>
        )}
      </div>

      {/* Actions */}
      {['pending', 'confirmed'].includes(booking.status) && (
        <div className="p-3 border-t border-white/5 flex gap-2">
          <button
            onClick={handleCancelClick}
            disabled={busy}
            className="flex-1 py-2 rounded-lg border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/10 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleRescheduleClick}
            disabled={busy}
            className="flex-1 py-2 rounded-lg border border-cyan-500/40 text-cyan-300 text-xs font-bold hover:bg-cyan-500/10 transition"
          >
            Reschedule
          </button>
        </div>
      )}

      {/* Cancel modal */}
      <ConfirmActionModal
        open={cancelOpen}
        title="⚠ Cancel Booking"
        variant="danger"
        summary={[
          `${booking.game?.name} • ${booking.console?.name}`,
          `${formatDate(booking.slot_start)} • ${formatTimeRange(booking.slot_start, booking.slot_end)}`,
        ]}
        breakdown={[
          { label: 'Original Amount', value: booking.amount },
          { label: `Cancellation Fee (${Math.round(feePct * 100)}%)`, value: fee, highlight: 'red' },
          { label: 'Refund to Wallet', value: refund, highlight: 'green', bold: true },
        ]}
        balance={[
          { label: 'Current Balance', value: walletBalance },
          { label: 'After Refund', value: walletBalance + refund, bold: true },
        ]}
        notices={[
          `${Math.round(feePct * 100)}% cancellation fee (${formatINR(fee)}) is deducted.`,
          `${formatINR(refund)} will be refunded to your wallet.`,
        ]}
        reasonInput={{ enabled: true, label: 'Reason (optional)', placeholder: 'Not feeling well…' }}
        confirmLabel="Cancel & Refund"
        cancelLabel="Keep Booking"
        busy={busy}
        onConfirm={handleCancelConfirm}
        onCancel={() => setCancelOpen(false)}
      />

      {/* Reschedule modal */}
      {rescheduleOpen && (
        <RescheduleFlow
          booking={booking}
          settings={settings}
          walletBalance={walletBalance}
          feePct={settings.reschedule_fee_pct as number}
          onClose={() => setRescheduleOpen(false)}
          onComplete={() => {
            setRescheduleOpen(false)
            toast.success('Rescheduled', 'Awaiting admin confirmation')
          }}
        />
      )}

      {/* Blocked modal */}
      <BlockedActionModal
        open={!!blocked}
        title={blocked?.title ?? ''}
        message={blocked?.message ?? ''}
        onClose={() => setBlocked(null)}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    pending: { bg: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300', label: 'PENDING' },
    confirmed: { bg: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300', label: 'CONFIRMED' },
    active: { bg: 'bg-blue-500/10 border-blue-500/40 text-blue-300 animate-pulse', label: '🔴 LIVE' },
    completed: { bg: 'bg-green-500/10 border-green-500/40 text-green-300', label: 'COMPLETED' },
    cancelled: { bg: 'bg-red-500/10 border-red-500/40 text-red-300', label: 'CANCELLED' },
    no_show: { bg: 'bg-gray-500/10 border-gray-500/40 text-gray-300', label: 'NO-SHOW' },
    rescheduled: { bg: 'bg-purple-500/10 border-purple-500/40 text-purple-300', label: 'RESCHEDULED' },
  }
  const s = map[status] ?? map.pending
  return (
    <span className={`text-[9px] font-black tracking-wider px-2 py-1 rounded-full border shrink-0 ${s.bg}`}>
      {s.label}
    </span>
  )
}

function ActiveSessionTimer({ slotStart, slotEnd }: { slotStart: string; slotEnd: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const endMs = new Date(slotEnd).getTime()
  const remaining = endMs - now
  const isOverrun = remaining < 0
  const min = Math.floor(Math.abs(remaining) / 60000)
  const sec = Math.floor((Math.abs(remaining) % 60000) / 1000)

  return (
    <div className={`rounded-lg p-2 text-xs font-mono ${
      isOverrun ? 'bg-amber-500/10 text-amber-300' : 'bg-blue-500/10 text-blue-300'
    }`}>
      ⏱ {isOverrun ? '+' : ''}{min}:{String(sec).padStart(2, '0')} {isOverrun ? 'overrun' : 'remaining'}
    </div>
  )
}

// ---------- Reschedule Flow ----------

function RescheduleFlow({
  booking, settings, walletBalance, feePct, onClose, onComplete,
}: {
  booking: Booking
  settings: any
  walletBalance: number
  feePct: number
  onClose: () => void
  onComplete: () => void
}) {
  const [stage, setStage] = useState<'pick' | 'confirm'>('pick')
  const [date, setDate] = useState(todayIST())
  const [slotStart, setSlotStart] = useState<Date | null>(null)
  const [duration, setDuration] = useState(booking.duration_min)
  const [bookedRanges, setBookedRanges] = useState<BookedRange[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Load booked ranges for the chosen console/date
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      const supabase = createClient()
      const dayStart = startOfDayISO(date)
      const dayEnd = endOfDayISO(date)

      const { data: bookings } = await supabase
        .from('bookings')
        .select('console_id, slot_start, slot_end, status')
        .eq('console_id', booking.console_id)
        .in('status', ['pending', 'confirmed', 'active'])
        .lt('slot_start', dayEnd)
        .gt('slot_end', dayStart)

      const ranges: BookedRange[] = (bookings ?? [])
        .filter((b: any) => b.id !== booking.id)
        .map((b: any) => ({
          start: b.slot_start,
          end: b.slot_end,
          status: b.status === 'pending' ? 'pending' : 'confirmed',
        }))
      setBookedRanges(ranges)
      setLoading(false)
    })()
  }, [date, booking.console_id, booking.id])

  const slots = useMemo(
    () => generateSlots({
      date,
      openHour: settings.open_hour,
      closeHour: settings.close_hour,
      slotMinutes: settings.slot_minutes,
      bookedRanges,
    }),
    [date, bookedRanges, settings]
  )

  const availableDurations = useMemo(() => {
    if (!slotStart) return []
    return validDurations(
      slotStart,
      settings.close_hour,
      settings.slot_minutes,
      settings.min_duration_min,
      settings.max_duration_min,
      bookedRanges
    )
  }, [slotStart, bookedRanges, settings])

  const newAmount = calcAmount(booking.hourly_rate_snapshot, duration)
  const fee = Math.round(booking.amount * feePct * 100) / 100
  const refundFromOld = Math.round((booking.amount - fee) * 100) / 100
  const isConfirmed = booking.status === 'confirmed'

  const handleConfirm = async () => {
    if (!slotStart) return
    setBusy(true)
    try {
      await rescheduleBooking(booking.id, slotStart.toISOString(), duration)
      onComplete()
    } catch (e) {
      toast.error('Reschedule failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {stage === 'pick' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-cyan-500/40 bg-neutral-950 p-5 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">🔄 Reschedule</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="text-xs text-gray-500 mb-3">
              Currently: {booking.game?.name} • {booking.console?.name} •{' '}
              {formatDateShort(booking.slot_start)} {formatTimeRange(booking.slot_start, booking.slot_end)}
            </div>

            {/* Date */}
            <div className="mb-3">
              <div className="text-[10px] text-gray-500 tracking-wider mb-2">NEW DATE</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[0, 1, 2].map((d) => {
                  const dt = addDaysIST(todayIST(), d)
                  const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(dt)
                  return (
                    <button
                      key={d}
                      onClick={() => { setDate(dt); setSlotStart(null) }}
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
            <div className="mb-3">
              <div className="text-[10px] text-gray-500 tracking-wider mb-2">NEW TIME</div>
              {loading ? (
                <div className="text-center py-6">
                  <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <SlotGrid
                  slots={slots}
                  selectedStart={slotStart}
                  onSelect={(s) => {
                    setSlotStart(s)
                    if (duration > (availableDurations[availableDurations.length - 1] ?? 30)) {
                      setDuration(availableDurations[0] ?? 60)
                    }
                  }}
                />
              )}
            </div>

            {/* Duration */}
            {slotStart && (
              <div className="mb-3">
                <div className="text-[10px] text-gray-500 tracking-wider mb-2">DURATION</div>
                <div className="flex gap-2 flex-wrap">
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
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => setStage('confirm')}
                disabled={!slotStart}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {stage === 'confirm' && slotStart && (
        <ConfirmActionModal
          open
          title="Confirm Reschedule"
          variant="warning"
          summary={[
            `From: ${formatDateShort(booking.slot_start)} • ${formatTimeRange(booking.slot_start, booking.slot_end)}`,
            `To: ${formatDateShort(slotStart)} • ${formatTimeRange(
              slotStart,
              new Date(slotStart.getTime() + duration * 60000)
            )}`,
          ]}
          breakdown={[
            { label: 'Original Amount', value: booking.amount },
            { label: `Reschedule Fee (${Math.round(feePct * 100)}%)`, value: fee, highlight: 'red' },
            { label: 'New Booking Amount', value: newAmount, bold: true },
          ]}
          balance={[
            { label: 'Current Balance', value: walletBalance },
            ...(isConfirmed
              ? [
                  { label: 'Refund Now', value: walletBalance + refundFromOld },
                  { label: 'Deduct on Confirm', value: walletBalance + refundFromOld - newAmount, bold: true },
                ]
              : []),
          ]}
          notices={[
            `Each reschedule deducts ${Math.round(feePct * 100)}% (${formatINR(fee)}).`,
            isConfirmed
              ? `${formatINR(refundFromOld)} refunded now. New ${formatINR(newAmount)} deducted on confirm.`
              : `New booking amount: ${formatINR(newAmount)}. Deducted when admin confirms.`,
          ]}
          confirmLabel="Confirm Reschedule"
          cancelLabel="Go Back"
          busy={busy}
          onConfirm={handleConfirm}
          onCancel={() => setStage('pick')}
        />
      )}
    </>
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