// app/notifications/NotificationsClient.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils/time'
import { markNotificationRead, markAllRead } from '@/lib/actions/notifications'
import { toast } from '@/components/ui/Toast'

type Filter = 'all' | 'unread'

type Notification = {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  booking_id: string | null
  wallet_txn_id: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  channels: string[]
  is_read: boolean
  read_at: string | null
  created_at: string
}

export function NotificationsClient({
  initial,
  userId,
}: {
  initial: Notification[]
  userId: string
}) {
  const [items, setItems] = useState<Notification[]>(initial)
  const [filter, setFilter] = useState<Filter>('all')

  // Realtime
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notif-page-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems((prev) => [payload.new as Notification, ...prev].slice(0, 100))
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const updated = payload.new as Notification
          setItems((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const filtered = useMemo(() => {
    return filter === 'unread' ? items.filter((n) => !n.is_read) : items
  }, [items, filter])

  const unreadCount = items.filter((n) => !n.is_read).length

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      )
    } catch (e) {
      toast.error('Failed to mark read')
    }
  }

  const handleMarkAll = async () => {
    try {
      await markAllRead()
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })))
      toast.success('All marked as read')
    } catch (e) {
      toast.error('Failed')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent flex-1">
            NOTIFICATIONS
          </h1>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-[10px] font-bold tracking-wider px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-cyan-400"
            >
              MARK ALL READ
            </button>
          )}
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wider border transition ${
              filter === 'all'
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}
          >
            ALL ({items.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold tracking-wider border transition ${
              filter === 'unread'
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}
          >
            UNREAD ({unreadCount})
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔔</div>
            <p className="text-gray-400 text-sm">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((n) => (
              <NotificationCard
                key={n.id}
                n={n}
                onRead={() => handleRead(n.id)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function NotificationCard({ n, onRead }: { n: Notification; onRead: () => void }) {
  const priorityStyles = {
    low: 'border-white/5',
    normal: 'border-white/10',
    high: 'border-amber-500/40',
    urgent: 'border-red-500/50 animate-pulse',
  }

  const icon = iconForType(n.type)

  return (
    <button
      onClick={() => !n.is_read && onRead()}
      className={`w-full text-left rounded-xl border p-3 transition ${
        n.is_read
          ? 'bg-[#0e0e15] border-white/5'
          : `bg-[#12121a] ${priorityStyles[n.priority]}`
      }`}
    >
      <div className="flex gap-3">
        <div className="text-2xl shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className={`text-sm font-bold ${n.is_read ? 'text-gray-400' : 'text-white'}`}>
              {n.title}
            </div>
            {!n.is_read && (
              <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-1.5" />
            )}
          </div>
          {n.body && (
            <div className={`text-xs mt-1 whitespace-pre-line ${n.is_read ? 'text-gray-500' : 'text-gray-300'}`}>
              {n.body}
            </div>
          )}
          <div className="text-[10px] text-gray-500 mt-2">
            {formatDateTime(n.created_at)}
          </div>
        </div>
      </div>
    </button>
  )
}

function iconForType(type: string): string {
  const map: Record<string, string> = {
    session_ending: '⏱',
    booking_starting: '📅',
    booking_confirmed: '✅',
    booking_cancelled: '❌',
    booking_rescheduled: '🔄',
    wallet_credited: '💰',
    wallet_debited: '💸',
    recharge_approved: '💳',
    recharge_rejected: '🚫',
    time_credit_earned: '🎁',
    time_credit_used: '⏱',
    system: '📢',
  }
  return map[type] ?? '🔔'
}