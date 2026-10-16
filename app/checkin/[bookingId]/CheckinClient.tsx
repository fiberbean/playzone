// app/checkin/[bookingId]/CheckinClient.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils/money'
import { formatDate, formatTimeRange } from '@/lib/utils/time'
import { playChime } from '@/components/ui/Toast'

type Booking = {
  id: string
  user_id: string
  slot_start: string
  slot_end: string
  status: string
  amount: number
  players: number
  game: { name: string; image_url: string | null } | null
  console: { name: string; type: string } | null
}

interface Props {
  booking: Booking
  settings: any
}

type Challenge = {
  id: string
  booking_id: string
  scan_type: 'in' | 'out'
  code: string
  expires_at: string
  verified_at: string | null
  attempts: number
  max_attempts: number
  created_at: string
}

export function CheckinClient({ booking, settings }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [bookingStatus, setBookingStatus] = useState(booking.status)
  const [codeExpiresIn, setCodeExpiresIn] = useState(0)
  const [justArrived, setJustArrived] = useState(false)

  const qrPayload = `playzone://booking/${booking.id}`

  // Generate QR once
  useEffect(() => {
    QRCode.toDataURL(qrPayload, {
      width: 400,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then(setQrDataUrl)
      .catch(console.error)
  }, [qrPayload])

  // Subscribe to scan_challenges for this booking
  useEffect(() => {
    const supabase = createClient()

    // Fetch current active challenge if any
    ;(async () => {
      const { data } = await supabase
        .from('scan_challenges')
        .select('*')
        .eq('booking_id', booking.id)
        .is('verified_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (data) {
        setChallenge(data as Challenge)
        setJustArrived(true)
        playChime(true)
      }
    })()

    const channel = supabase
      .channel(`checkin-${booking.id}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scan_challenges',
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          const row = payload.new as Challenge
          setChallenge(row)
          setJustArrived(true)
          playChime(true)
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'scan_challenges',
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          const row = payload.new as Challenge
          if (row.verified_at) {
            // Code verified → clear
            setChallenge(null)
            setJustArrived(false)
          } else {
            setChallenge(row)
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `id=eq.${booking.id}`,
        },
        (payload) => {
          const row = payload.new as any
          setBookingStatus(row.status)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [booking.id])

  // Countdown timer for code expiry
  useEffect(() => {
    if (!challenge) {
      setCodeExpiresIn(0)
      return
    }
    const tick = () => {
      const remaining = Math.max(0, Math.floor(
        (new Date(challenge.expires_at).getTime() - Date.now()) / 1000
      ))
      setCodeExpiresIn(remaining)
      if (remaining === 0) {
        setChallenge(null)
        setJustArrived(false)
      }
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [challenge])

  const fadeJustArrived = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (justArrived) {
      if (fadeJustArrived.current) clearTimeout(fadeJustArrived.current)
      fadeJustArrived.current = setTimeout(() => setJustArrived(false), 6000)
    }
    return () => {
      if (fadeJustArrived.current) clearTimeout(fadeJustArrived.current)
    }
  }, [justArrived])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/bookings" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            CHECK-IN
          </h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 pb-24">
        {/* Booking summary card */}
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-cyan-500/30 to-pink-500/30 flex items-center justify-center shrink-0">
              {booking.game?.image_url ? (
                <img src={booking.game.image_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🎮</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-white truncate">
                {booking.game?.name} • {booking.console?.name}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {formatDate(booking.slot_start)}
              </div>
              <div className="text-xs text-gray-400">
                {formatTimeRange(booking.slot_start, booking.slot_end)} • {booking.players} player{booking.players > 1 ? 's' : ''}
              </div>
              <div className="text-xs text-cyan-400 font-bold mt-1">
                {formatINR(booking.amount)}
              </div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 flex justify-between text-[10px] text-gray-500 tracking-wider font-bold">
            <span>STATUS: {bookingStatus.toUpperCase()}</span>
            <span>#{booking.id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Alerts */}
        {justArrived && challenge && (
          <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/50 p-3 mb-4 animate-pulse">
            <div className="text-xs font-bold text-cyan-300 tracking-wider text-center">
              📷 ADMIN SCANNED YOUR QR
            </div>
          </div>
        )}

        {bookingStatus === 'active' && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/40 p-4 mb-4 text-center">
            <div className="text-3xl mb-2">🎮</div>
            <div className="text-sm font-bold text-green-400 tracking-wider">
              SESSION ACTIVE
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Enjoy your game!
            </div>
          </div>
        )}

        {bookingStatus === 'completed' && (
          <div className="rounded-xl bg-gray-500/10 border border-gray-500/30 p-4 mb-4 text-center">
            <div className="text-3xl mb-2">✅</div>
            <div className="text-sm font-bold text-gray-300 tracking-wider">
              SESSION COMPLETED
            </div>
          </div>
        )}

        {/* QR code (hidden while challenge is active) */}
        {!challenge && ['pending', 'confirmed'].includes(bookingStatus) && (
          <div className="bg-white rounded-2xl p-4 mb-4">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR code"
                className="w-full aspect-square"
              />
            ) : (
              <div className="aspect-square flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-cyan-500 rounded-full animate-spin"></div>
              </div>
            )}
          </div>
        )}

        {!challenge && ['pending', 'confirmed'].includes(bookingStatus) && (
          <div className="text-center text-xs text-gray-500 mb-6">
            Show this QR to the zone admin when you arrive
          </div>
        )}

        {/* 4-digit code (only when challenge is active) */}
        {challenge && (
          <div className="bg-gradient-to-br from-cyan-500/10 to-pink-500/10 border-2 border-cyan-500/50 rounded-2xl p-6 mb-4">
            <div className="text-center text-xs font-bold tracking-widest text-cyan-300 mb-4">
              SHOW THIS CODE TO ADMIN
            </div>

            <div className="flex justify-center gap-3 mb-6">
              {challenge.code.split('').map((digit, i) => (
                <div
                  key={i}
                  className="w-16 h-20 rounded-2xl bg-white text-black font-black text-5xl flex items-center justify-center shadow-2xl"
                >
                  {digit}
                </div>
              ))}
            </div>

            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">
                {challenge.scan_type === 'in' ? 'CHECK-IN CODE' : 'CHECK-OUT CODE'}
              </div>
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                <div className="font-mono text-sm text-cyan-300">
                  Expires in {formatCountdown(codeExpiresIn)}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 text-[11px] text-gray-400 text-center">
              Read this code to the admin to start your session.
            </div>
          </div>
        )}

        {/* Instructions */}
        {!challenge && ['pending', 'confirmed'].includes(bookingStatus) && (
          <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-4 space-y-2 text-xs text-amber-200">
            <div className="font-bold tracking-wider text-amber-300 mb-2">
              HOW IT WORKS
            </div>
            <div>1. Show QR to admin at the counter</div>
            <div>2. A 4-digit code appears here</div>
            <div>3. Read the code to the admin</div>
            <div>4. Session starts!</div>
          </div>
        )}
      </main>
    </div>
  )
}

function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}