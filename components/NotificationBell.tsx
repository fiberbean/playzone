// components/NotificationBell.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Notification } from '@/lib/types/notification'
import { formatDateTime } from '@/lib/utils/time'
import { markNotificationRead } from '@/lib/actions/notifications'

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    let mounted = true

    ;(async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (mounted && data) setItems(data as Notification[])
    })()

    const channel = supabase
      .channel(`notif-bell-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          setItems((prev) => [payload.new as Notification, ...prev].slice(0, 20))
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

    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [userId])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const unread = items.filter((n) => !n.is_read).length

  const handleRead = async (id: string) => {
    try {
      await markNotificationRead(id)
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch {}
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-[#12121a] border border-cyan-500/30 hover:border-cyan-500/60 transition"
        aria-label="Notifications"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-cyan-500/30 bg-[#12121a] shadow-2xl z-50">
          <div className="p-3 border-b border-cyan-500/20 flex justify-between items-center sticky top-0 bg-[#12121a]">
            <span className="text-sm font-bold text-white">Notifications</span>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-[10px] text-cyan-400 hover:underline tracking-wider"
            >
              VIEW ALL
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-500">
              No notifications yet
            </div>
          ) : (
            items.slice(0, 8).map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.is_read) handleRead(n.id)
                }}
                className={`w-full text-left p-3 border-b border-cyan-500/10 last:border-0 hover:bg-white/5 transition ${
                  !n.is_read ? 'bg-cyan-500/5' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${n.is_read ? 'text-gray-400' : 'text-white font-bold'}`}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line line-clamp-2">
                        {n.body}
                      </div>
                    )}
                    <div className="text-[10px] text-gray-600 mt-1">
                      {formatDateTime(n.created_at)}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 mt-1" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}