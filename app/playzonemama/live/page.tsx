// app/playzonemama/live/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime } from '@/lib/utils/time'
import { formatINR } from '@/lib/utils/money'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { toast, playChime } from '@/components/ui/Toast'
import { endSession } from '@/lib/actions/bookings'
import { computeOverrun } from '@/lib/actions/live'
import { useSettings } from '@/lib/hooks/useSettings'

type ActiveRow = {
  id: string
  user_id: string
  slot_start: string
  slot_end: string
  players: number
  amount: number
  status: string
  game: { name: string } | null
  console: { name: string } | null
  profile: { full_name: string | null; email: string | null } | null
}

export default function LivePage() {
  const [rows, setRows] = useState<ActiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<null | {
    booking: ActiveRow
    overrunMin: number
    charge: number
  }>(null)
  const { settings } = useSettings()

  const fetchLive = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, user_id, slot_start, slot_end, players, amount, status,
        game:games(name),
        console:consoles(name),
        profile:profiles(full_name, email)
      `)
      .eq('status', 'active')
      .order('slot_end', { ascending: true })
    setRows((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchLive()
    const supabase = createClient()
    const channel = supabase
      .channel(`live-sessions-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => fetchLive()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Wake Lock — keep screen on
  useEffect(() => {
    let wakeLock: any = null
    ;(async () => {
      try {
        // @ts-ignore
        if ('wakeLock' in navigator) wakeLock = await (navigator as any).wakeLock.request('screen')
      } catch {}
    })()
    return () => {
      try { wakeLock?.release?.() } catch {}
    }
  }, [])

  const handleEnd = async (booking: ActiveRow) => {
    try {
      const preview = await computeOverrun(booking.id)
      setModal({
        booking,
        overrunMin: preview.overrunMin,
        charge: preview.charge,
      })
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : 'Unknown')
    }
  }

  const confirmEnd = async () => {
    if (!modal) return
    try {
      await endSession(modal.booking.id, {
        overrunMin: modal.overrunMin,
        overrunCharge: modal.charge,
      })
      toast.success('Session ended')
      setModal(null)
      fetchLive()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : 'Unknown')
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            LIVE SESSIONS
          </h2>
          <p className="text-xs text-gray-500 mt-1 tracking-widest">
            {rows.length} ACTIVE
          </p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎮</div>
          <p className="text-gray-400 text-sm">No active sessions</p>
          <p className="text-gray-500 text-xs mt-1">
            Start a session from Bookings to see it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <LiveCard
              key={r.id}
              row={r}
              graceMin={(settings.scan_overrun_grace_min as number) ?? 5}
              onEnd={() => handleEnd(r)}
            />
          ))}
        </div>
      )}

      {modal && (
        <ConfirmActionModal
          open
          title="End Session"
          variant={modal.charge > 0 ? 'warning' : 'info'}
          summary={[
            `${modal.booking.game?.name} • ${modal.booking.console?.name}`,
            `Customer: ${modal.booking.profile?.full_name ?? modal.booking.profile?.email ?? 'Unknown'}`,
            `Scheduled end: ${formatTime(modal.booking.slot_end)}`,
          ]}
          breakdown={
            modal.charge > 0
              ? [
                  { label: 'Overrun (min)', value: modal.overrunMin },
                  { label: 'Extra charge', value: modal.charge, highlight: 'red', bold: true },
                ]
              : [{ label: 'Extra charge', value: 0 }]
          }
          notices={
            modal.charge > 0
              ? ['Overrun will be charged to wallet immediately.']
              : ['Within grace period — no extra charge.']
          }
          confirmLabel={modal.charge > 0 ? `End & Charge ${formatINR(modal.charge)}` : 'End Session'}
          cancelLabel="Keep Running"
          onConfirm={confirmEnd}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}

function LiveCard({
  row, graceMin, onEnd,
}: {
  row: ActiveRow
  graceMin: number
  onEnd: () => void
}) {
  const [now, setNow] = useState(0)

  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const startMs = new Date(row.slot_start).getTime()
  const endMs = new Date(row.slot_end).getTime()
  const remainingMs = endMs - now
  const remainingMin = Math.floor(remainingMs / 60000)
  const remainingSec = Math.floor((remainingMs % 60000) / 1000)

  const isOverrun = remainingMs < 0
  const isCritical = remainingMin <= 2 && !isOverrun

  // Play chime when a threshold is crossed (10/5/2)
  useEffect(() => {
    const rem = Math.floor(remainingMs / 60000)
    if ([10, 5, 2].includes(rem) && remainingSec === 0) {
      playChime(rem <= 2)
      toast.urgent(
        rem <= 2 ? `${rem} min left` : `${rem} min left`,
        `${row.console?.name} • ${row.game?.name}`,
        rem <= 2
      )
    }
  }, [remainingMin, remainingSec])

  const totalMs = endMs - startMs
  const elapsedMs = Math.min(totalMs, now - startMs)
  const progress = Math.max(0, Math.min(100, (elapsedMs / totalMs) * 100))

  const timeDisplay = isOverrun
    ? `+${Math.abs(remainingMin)}:${String(Math.abs(remainingSec)).padStart(2, '0')} overrun`
    : `${remainingMin}:${String(remainingSec).padStart(2, '0')} remaining`

  return (
    <div
      className={`rounded-2xl border p-4 bg-gradient-to-br from-[#12121a] to-[#0a0a0f] transition ${
        isCritical ? 'border-red-500/60 animate-pulse'
        : isOverrun ? 'border-amber-500/60'
        : 'border-cyan-500/30'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-bold text-white text-base">
            {row.console?.name} • {row.game?.name}
          </div>
          <div className="text-xs text-gray-400">
            {row.profile?.full_name ?? row.profile?.email ?? 'Unknown'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formatTime(row.slot_start)} – {formatTime(row.slot_end)}
          </div>
        </div>
        <div className="text-right">
          <div
            className={`font-mono font-bold text-lg ${
              isOverrun ? 'text-amber-400' : isCritical ? 'text-red-400' : 'text-cyan-400'
            }`}
          >
            {timeDisplay}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden my-3">
        <div
          className={`h-full transition-all ${
            isOverrun ? 'bg-amber-500' : isCritical ? 'bg-red-500' : 'bg-cyan-500'
          }`}
          style={{ width: `${isOverrun ? 100 : progress}%` }}
        />
      </div>

      <button
        onClick={onEnd}
        className="w-full py-2 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white text-sm font-bold"
      >
        End Session
      </button>
    </div>
  )
}