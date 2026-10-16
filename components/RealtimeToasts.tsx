// components/RealtimeToasts.tsx
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useToastStore, playChime } from '@/components/ui/Toast'
import type { Notification } from '@/lib/types/notification'

export function RealtimeToasts({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`global-toasts-${userId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as Notification
          const variant =
            n.priority === 'urgent' ? 'urgent'
            : n.priority === 'high' ? 'warning'
            : 'info'

          useToastStore.getState().push({
            title: n.title,
            body: n.body ?? undefined,
            variant,
            sound: n.channels?.includes('sound'),
            duration: n.priority === 'urgent' ? 15000 : 6000,
          })

          if (n.channels?.includes('sound')) {
            playChime(n.priority === 'urgent')
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return null
}