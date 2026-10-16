// app/playzonemama/bookings/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatTime, formatDateShort, formatDuration, formatDateTime } from '@/lib/utils/time'
import { formatINR } from '@/lib/utils/money'
import { STATUS_LABELS, STATUS_COLORS } from '@/lib/utils/booking'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { toast } from '@/components/ui/Toast'
import {
  confirmBooking, cancelBooking, startSession, endSession, markNoShow,
} from '@/lib/actions/bookings'
import type { BookingStatus } from '@/lib/types/booking'

type Row = {
  id: string
  user_id: string
  game_id: string
  console_id: string
  slot_start: string
  slot_end: string
  duration_min: number
  players: number
  amount: number
  status: BookingStatus
  rate_type: 'single' | 'multiplayer'
  created_at: string
  game: { name: string } | null
  console: { name: string; type: string } | null
  profile: { full_name: string | null; email: string | null } | null
}

type Tab = 'all' | 'pending' | 'today' | 'active' | 'completed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'today', label: 'Today' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
]

export default function AdminBookingsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [modal, setModal] = useState<null | {
    type: 'confirm' | 'cancel' | 'start' | 'end' | 'noshow'
    booking: Row
  }>(null)
  const router = useRouter()

  const fetchData = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, user_id, game_id, console_id, slot_start, slot_end,
        duration_min, players, amount, status, rate_type, created_at,
        game:games(name),
        console:consoles(name, type),
        profile:profiles(full_name, email)
      `)
      .order('slot_start', { ascending: false })
      .limit(200)
    setRows((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const supabase = createClient()
    const channel = supabase
      .channel(`admin-bookings-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => fetchData()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtered = useMemo(() => {
    if (tab === 'all') return rows
    if (tab === 'pending') return rows.filter((r) => r.status === 'pending')
    if (tab === 'active') return rows.filter((r) => r.status === 'active')
    if (tab === 'completed') return rows.filter((r) => r.status === 'completed')
    if (tab === 'today') {
      const today = new Date().toISOString().slice(0, 10)
      return rows.filter((r) => r.slot_start.slice(0, 10) === today)
    }
    return rows
  }, [rows, tab])

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === 'pending').length,
    today: rows.filter((r) => r.slot_start.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    active: rows.filter((r) => r.status === 'active').length,
    completed: rows.filter((r) => r.status === 'completed').length,
  }), [rows])

  const runAction = async (type: string, id: string) => {
    setBusy(id)
    try {
      if (type === 'confirm') await confirmBooking(id)
      else if (type === 'cancel') await cancelBooking(id, 'Admin cancel')
      else if (type === 'start') await startSession(id)
      else if (type === 'end') await endSession(id)
      else if (type === 'noshow') await markNoShow(id)
      toast.success('Done')
      await fetchData()
      router.refresh()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setBusy(null)
      setModal(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          BOOKINGS
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          {rows.length} TOTAL
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap border transition ${
              tab === t.key
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {t.label.toUpperCase()}
            <span className="ml-2 opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📅</div>
          <p className="text-gray-400 text-sm">No bookings in this view</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              busy={busy === b.id}
              onAction={(type) => setModal({ type, booking: b })}
            />
          ))}
        </div>
      )}

      {modal && (
        <ActionModal
          modal={modal}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            const map = {
              confirm: 'confirm', cancel: 'cancel', start: 'start',
              end: 'end', noshow: 'noshow',
            } as const
            runAction(map[modal.type], modal.booking.id)
          }}
        />
      )}
    </div>
  )
}

function BookingCard({
  booking, busy, onAction,
}: {
  booking: Row
  busy: boolean
  onAction: (type: 'confirm' | 'cancel' | 'start' | 'end' | 'noshow') => void
}) {
  const statusColor = {
    yellow: 'bg-yellow-500/10 border-yellow-500/40 text-yellow-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300',
    blue: 'bg-blue-500/10 border-blue-500/40 text-blue-300',
    green: 'bg-green-500/10 border-green-500/40 text-green-300',
    red: 'bg-red-500/10 border-red-500/40 text-red-300',
    gray: 'bg-gray-500/10 border-gray-500/40 text-gray-300',
    purple: 'bg-purple-500/10 border-purple-500/40 text-purple-300',
  }[STATUS_COLORS[booking.status]]

  return (
    <div className={`bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border rounded-2xl p-4 ${busy ? 'opacity-50' : 'border-cyan-500/20'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
              {STATUS_LABELS[booking.status].toUpperCase()}
            </span>
            <span className="text-[10px] text-gray-500 font-mono">
              #{booking.id.slice(0, 8)}
            </span>
          </div>

          <div className="font-bold text-white text-sm sm:text-base">
            {booking.game?.name ?? '—'} • {booking.console?.name ?? '—'}
          </div>

          <div className="text-xs text-gray-400 mt-1">
            👤 {booking.profile?.full_name ?? booking.profile?.email ?? 'Unknown'}
          </div>

          <div className="text-xs text-gray-300 mt-1">
            📅 {formatDateShort(booking.slot_start)} • {formatTime(booking.slot_start)} – {formatTime(booking.slot_end)}
            <span className="text-gray-500 ml-2">({formatDuration(booking.duration_min)})</span>
          </div>

          <div className="flex gap-3 mt-2 text-xs">
            <span className="text-gray-400">
              👥 {booking.players} {booking.rate_type === 'single' ? '(single)' : '(multi)'}
            </span>
            <span className="text-cyan-400 font-bold">
              {formatINR(booking.amount)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5">
          {booking.status === 'pending' && (
            <>
              <button
                onClick={() => onAction('confirm')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600/90 hover:bg-green-600 text-white disabled:opacity-50"
              >
                ✓ Confirm
              </button>
              <button
                onClick={() => onAction('cancel')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600/70 hover:bg-red-600 text-white disabled:opacity-50"
              >
                ✕ Cancel
              </button>
            </>
          )}

          {booking.status === 'confirmed' && (
            <>
              <button
                onClick={() => onAction('start')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-cyan-600/90 hover:bg-cyan-600 text-white disabled:opacity-50"
              >
                ▶ Start
              </button>
              <button
                onClick={() => onAction('cancel')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600/70 hover:bg-red-600 text-white disabled:opacity-50"
              >
                ✕ Cancel
              </button>
            </>
          )}

          {booking.status === 'active' && (
            <>
              <button
                onClick={() => onAction('end')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white disabled:opacity-50"
              >
                ⏹ End
              </button>
              <button
                onClick={() => onAction('noshow')}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-gray-600/70 hover:bg-gray-600 text-white disabled:opacity-50"
              >
                🚫 No-show
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionModal({
  modal, onCancel, onConfirm,
}: {
  modal: { type: 'confirm' | 'cancel' | 'start' | 'end' | 'noshow'; booking: Row }
  onCancel: () => void
  onConfirm: () => void
}) {
  const b = modal.booking
  const config = {
    confirm: {
      title: 'Confirm Booking',
      variant: 'info' as const,
      summary: [
        `${b.game?.name} • ${b.console?.name}`,
        `${formatDateShort(b.slot_start)} • ${formatTime(b.slot_start)} – ${formatTime(b.slot_end)}`,
        `Customer: ${b.profile?.full_name ?? b.profile?.email ?? 'Unknown'}`,
      ],
      breakdown: [
        { label: 'Amount to charge', value: b.amount, bold: true },
      ],
      notices: ['Wallet will be debited immediately. Insufficient balance → booking fails.'],
      confirmLabel: 'Confirm & Charge',
    },
    cancel: {
      title: 'Cancel Booking',
      variant: 'danger' as const,
      summary: [
        `${b.game?.name} • ${b.console?.name}`,
        `${formatDateShort(b.slot_start)} • ${formatTime(b.slot_start)}`,
      ],
      breakdown: [
        { label: 'Refund (90%)', value: b.amount * 0.9, highlight: 'green' as const },
        { label: 'Fee (10%)', value: b.amount * 0.1, highlight: 'red' as const },
      ],
      notices: ['If pending, no refund. If confirmed, 90% refunded.'],
      confirmLabel: 'Cancel & Refund',
    },
    start: {
      title: 'Start Session',
      variant: 'info' as const,
      summary: [`${b.game?.name} • ${b.console?.name}`],
      notices: ['Session timer + reminders will begin now.'],
      confirmLabel: 'Start Session',
    },
    end: {
      title: 'End Session',
      variant: 'warning' as const,
      summary: [`${b.game?.name} • ${b.console?.name}`],
      notices: ['Overrun will be computed and charged if past scheduled end.'],
      confirmLabel: 'End Session',
    },
    noshow: {
      title: 'Mark No-Show',
      variant: 'danger' as const,
      summary: [`${b.game?.name} • ${b.console?.name}`],
      notices: ['Customer did not show up. No refund will be given.'],
      confirmLabel: 'Mark No-Show',
    },
  }[modal.type]

  return (
    <ConfirmActionModal
      open
      title={config.title}
      variant={config.variant}
      summary={config.summary}
      breakdown={config.breakdown}
      notices={config.notices}
      confirmLabel={config.confirmLabel}
      cancelLabel="Go Back"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}