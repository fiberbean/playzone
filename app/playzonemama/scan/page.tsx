// app/playzonemama/scan/page.tsx
'use client'

import { useState } from 'react'
import { scanQR, verifyScanCode, overrideScan } from '@/lib/actions/scan'
import { toast, playChime } from '@/components/ui/Toast'
import { formatTime, formatDateShort } from '@/lib/utils/time'
import { formatINR } from '@/lib/utils/money'
import { useSettings } from '@/lib/hooks/useSettings'

type ScannedBooking = {
  id: string
  status: string
  slot_start: string
  slot_end: string
  amount: number
  players: number
  game: { name: string } | null
  console: { name: string } | null
  profile: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'scanned'; booking: ScannedBooking; scanType: 'in' | 'out'; requireCode: boolean }
  | { kind: 'success'; booking: ScannedBooking; scanType: 'in' | 'out' }
  | { kind: 'error'; message: string }

export default function ScanPage() {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [bookingCode, setBookingCode] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastScan, setLastScan] = useState<{
    name: string
    action: string
    time: string
  } | null>(null)
  
  const { settings } = useSettings()

  const handleSearch = async () => {
    if (!bookingCode.trim()) return
    setBusy(true)
    try {
      const res = await scanQR(bookingCode.trim())
      playChime(false)
      
      setStage({
        kind: 'scanned',
        booking: res.booking as ScannedBooking,
        scanType: res.scanType as 'in' | 'out',
        requireCode: res.requireCode,
      })
    } catch (e) {
      playChime(true)
      // 👈 Extract actual error message
      const msg = e instanceof Error ? e.message : 'Unknown error'
      
      // 👈 Show the actual error message as title
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('passed')) {
        toast.error('Booking Expired', msg)
      } else {
        toast.error('Search Failed', msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleVerify = async () => {
    if (stage.kind !== 'scanned') return
    if (otp.length < 4) {
      toast.error('Enter 4 digits')
      return
    }
    setBusy(true)
    try {
      await verifyScanCode(stage.booking.id, bookingCode, otp)
      playChime(false)
      setStage({ kind: 'success', booking: stage.booking, scanType: stage.scanType })
      setLastScan({
        name: stage.booking.profile?.full_name ?? stage.booking.profile?.email ?? '—',
        action: stage.scanType === 'in' ? 'Session started' : 'Session ended',
        time: new Date().toISOString(),
      })
    } catch (e) {
      playChime(true)
      const msg = e instanceof Error ? e.message : ''
      toast.error('Verification failed', msg)
      setOtp('')
    } finally {
      setBusy(false)
    }
  }

  const handleOverride = async () => {
    if (stage.kind !== 'scanned') return
    const reason = prompt('Override reason (logged):')
    if (!reason) return
    setBusy(true)
    try {
      await overrideScan(stage.booking.id, stage.scanType, reason)
      setStage({ kind: 'success', booking: stage.booking, scanType: stage.scanType })
      setLastScan({
        name: stage.booking.profile?.full_name ?? stage.booking.profile?.email ?? '—',
        action: `${stage.scanType === 'in' ? 'Started' : 'Ended'} (override)`,
        time: new Date().toISOString(),
      })
    } catch (e) {
      toast.error('Override failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setStage({ kind: 'idle' })
    setOtp('')
    setBookingCode('')
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        
        {/* HEADER */}
        <div className="text-center mb-8 relative z-10">
          <h2 className="text-3xl sm:text-4xl font-black tracking-widest bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
            SCAN ID
          </h2>
          <p className="text-[10px] text-cyan-300/60 mt-1 tracking-[0.3em] uppercase">
            Manual Check-in
          </p>
        </div>

        {/* IDLE — Search View */}
        {stage.kind === 'idle' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
              
              <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-8 overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                      <span className="text-3xl">⌨️</span>
                    </div>
                  </div>
                  
                  <h3 className="text-center text-white font-bold text-lg mb-2">Enter Booking ID</h3>
                  <p className="text-center text-xs text-gray-400 mb-6">Type the 8-digit ID or Entry ID.</p>

                  <div className="space-y-3">
                    <input
                      type="text"
                      value={bookingCode}
                      onChange={(e) => setBookingCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="e.g. 12345678 or PZBKID0001"
                      className="w-full bg-[#0a0a0f] border-2 border-cyan-500/20 rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-[0.3em] text-cyan-300 placeholder-cyan-900 focus:outline-none focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all"
                      autoFocus
                    />
                    
                    <button
                      onClick={handleSearch}
                      disabled={busy || !bookingCode.trim()}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-black tracking-wider disabled:opacity-50 transition-all active:scale-95 hover:shadow-[0_0_20px_rgba(236,72,153,0.4)]"
                    >
                      {busy ? 'SEARCHING...' : 'SEARCH'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {lastScan && (
              <div className="bg-[#12121a] border border-green-500/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-green-400 tracking-wider font-bold uppercase">Last Action</div>
                  <div className="text-sm text-white font-bold">{lastScan.name}</div>
                  <div className="text-[10px] text-gray-500">{lastScan.action} • {formatTime(lastScan.time)}</div>
                </div>
                <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">✓</div>
              </div>
            )}
          </div>
        )}

        {/* SCANNED — Show Details & Enter OTP */}
        {stage.kind === 'scanned' && (
          <div className="relative group animate-in zoom-in-95 duration-300">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-2xl blur opacity-40 group-hover:opacity-60 transition duration-500"></div>
            
            <div className="relative bg-[#12121a] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden">
              
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mb-3 ring-4 ring-green-500/20">
                  <span className="text-2xl">✅</span>
                </div>
                <div className="text-lg font-black text-white tracking-wide">BOOKING FOUND</div>
                <p className="text-xs text-gray-400">Verify customer details and enter code.</p>
              </div>

              <BookingSummary booking={stage.booking} scanType={stage.scanType} />

              {stage.requireCode && (
                <div className="mt-6">
                  <div className="text-center text-[10px] text-gray-500 font-bold tracking-wider mb-3">
                    ENTER 4-DIGIT CODE FROM CUSTOMER
                  </div>
                  
                  <div className="flex justify-center gap-2 mb-6">
                    {[0, 1, 2, 3].map((i) => (
                      <input
                        key={i}
                        type="tel"
                        maxLength={1}
                        value={otp[i] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '')
                          const arr = otp.split('')
                          arr[i] = v
                          const next = arr.join('').slice(0, 4)
                          setOtp(next)
                          if (v && i < 3) {
                            const nextEl = document.querySelectorAll<HTMLInputElement>('[data-code-input]')[i + 1]
                            nextEl?.focus()
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otp[i] && i > 0) {
                            const prevEl = document.querySelectorAll<HTMLInputElement>('[data-code-input]')[i - 1]
                            prevEl?.focus()
                          }
                        }}
                        data-code-input
                        className={`w-14 h-16 text-center text-3xl font-black rounded-xl border-2 transition-all duration-300 ${
                          otp[i] 
                            ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-[0_0_15px_rgba(34,211,238,0.3)]' 
                            : 'bg-[#0a0a0f] border-white/10 text-cyan-500/50 focus:border-cyan-500'
                        }`}
                      />
                    ))}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={reset}
                      className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleVerify}
                      disabled={busy || otp.length < 4}
                      className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-black tracking-wider text-sm disabled:opacity-50 transition-all active:scale-95 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
                    >
                      {busy ? 'VERIFYING...' : 'VERIFY & START'}
                    </button>
                  </div>

                  {(settings?.scan_override_enabled as boolean) && (
                    <button
                      onClick={handleOverride}
                      disabled={busy}
                      className="w-full mt-4 text-[10px] text-amber-500/70 hover:text-amber-400 tracking-wider font-bold transition-colors"
                    >
                      [ ADMIN OVERRIDE ]
                    </button>
                  )}
                </div>
              )}

              {!stage.requireCode && (
                <button
                  onClick={reset}
                  className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black tracking-wider text-sm"
                >
                  DONE
                </button>
              )}
            </div>
          </div>
        )}

        {/* SUCCESS */}
        {stage.kind === 'success' && (
          <div className="relative group animate-in zoom-in-95 duration-500">
             <div className="absolute -inset-1 bg-green-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse"></div>
             
            <div className="relative bg-[#0a0a0f] border border-green-500/30 rounded-2xl p-8 text-center overflow-hidden">
              <div className="relative z-10">
                <div className="text-7xl mb-4 animate-bounce drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">🏆</div>
                <div className="text-2xl font-black text-green-400 tracking-widest mb-1">
                  {stage.scanType === 'in' ? 'SESSION STARTED' : 'SESSION ENDED'}
                </div>
                <p className="text-xs text-green-300/70 mb-6">Gameplay has begun.</p>

                <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4 mb-8">
                  <BookingSummary booking={stage.booking} scanType={stage.scanType} compact />
                </div>

                <button
                  onClick={reset}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black tracking-wider text-sm shadow-[0_0_30px_rgba(74,222,128,0.3)] transition-all active:scale-95"
                >
                  SCAN NEXT
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

function BookingSummary({
  booking, scanType, compact,
}: {
  booking: ScannedBooking
  scanType: 'in' | 'out'
  compact?: boolean
}) {
  return (
    <div className="bg-[#0a0a0f] rounded-xl p-4 space-y-3 border border-white/5 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${scanType === 'in' ? 'bg-cyan-500' : 'bg-pink-500'}`} />
      
      <div className="flex items-center gap-3 pl-2">
        {booking.profile?.avatar_url && (
          <img
            src={booking.profile.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full border-2 border-cyan-500/30"
          />
        )}
        <div>
          <div className="font-bold text-white text-sm">
            {booking.profile?.full_name ?? booking.profile?.email ?? 'Unknown'}
          </div>
          <div className="text-[10px] text-cyan-400/80 font-mono tracking-wider">
            #{booking.id.slice(0, 8).toUpperCase()}
          </div>
        </div>
      </div>

      <div className="pl-2">
        <div className="text-gray-300 font-bold text-sm">
          {booking.game?.name ?? '—'} <span className="text-gray-500 text-xs mx-1">•</span> {booking.console?.name ?? '—'}
        </div>

        <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <span>📅</span> {formatDateShort(booking.slot_start)}
          <span className="mx-1">•</span>
          <span>⏱</span> {formatTime(booking.slot_start)} – {formatTime(booking.slot_end)}
        </div>
      </div>

      {!compact && (
        <div className="flex justify-between items-center text-xs pt-3 border-t border-white/5 pl-2">
          <span className="text-gray-400">Players: <b className="text-white">{booking.players}</b></span>
          <span className="text-cyan-400 font-bold text-sm">{formatINR(booking.amount)}</span>
        </div>
      )}

      <div className="pl-2 pt-1">
        <div className={`inline-block text-[9px] tracking-wider font-bold uppercase px-2 py-1 rounded-md ${
          scanType === 'in' 
            ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' 
            : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'
        }`}>
          {scanType === 'in' ? '▶ Action: Check-in' : '⏹ Action: Check-out'}
        </div>
      </div>
    </div>
  )
}