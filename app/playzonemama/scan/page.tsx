// app/playzonemama/scan/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [manualId, setManualId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [lastScan, setLastScan] = useState<{
    name: string
    action: string
    time: string
  } | null>(null)
  
  const scannerRef = useRef<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { settings } = useSettings()

  // Init QR Scanner
  useEffect(() => {
    if (stage.kind !== 'idle') {
      if (scannerRef.current) {
        try { 
          scannerRef.current.stop().then(() => scannerRef.current.clear()) 
        } catch (e) {}
        scannerRef.current = null
      }
      return
    }

    let mounted = true
    let scanner: any = null

    const initScanner = async () => {
      // 1. Element check (React Strict mode valla double render avvakunda)
      const el = document.getElementById('qr-reader')
      if (!el || el.innerHTML !== '') return;

      // 2. Wait a bit for DOM to fully render
      setTimeout(async () => {
        if (!mounted) return

        const el = document.getElementById('qr-reader')
        if (!el) return

        try {
          const { Html5Qrcode } = await import('html5-qrcode')
          
          if (!mounted) return

          // Clear element before init
          el.innerHTML = ''

          scanner = new Html5Qrcode('qr-reader')
          scannerRef.current = scanner

          await scanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 250 } },
            (decodedText: string) => {
              // Stop scanner immediately on scan
              scanner.stop().then(() => {
                scanner.clear()
              }).catch(() => {})
              handleQR(decodedText)
            },
            () => {} // Ignore frequent scan errors
          )
          
          setCameraError(null)
        } catch (err: any) {
          console.error('Scanner init error:', err)
          if (mounted) {
            setCameraError('Camera access failed. Please allow camera permissions.')
          }
        }
      }, 300)
    }

    initScanner()

    return () => {
      mounted = false
      if (scanner) {
        try { 
          scanner.stop().then(() => {
            scanner.clear()
          }).catch(() => {}) 
        } catch (e) {}
      }
      if (scannerRef.current) {
        try { scannerRef.current.clear() } catch (e) {}
        scannerRef.current = null
      }
    }
  }, [stage.kind])

  // Native Camera Fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      let tempDiv = document.getElementById('file-scan-temp')
      if (!tempDiv) {
        tempDiv = document.createElement('div')
        tempDiv.id = 'file-scan-temp'
        tempDiv.style.display = 'none'
        document.body.appendChild(tempDiv)
      }
      const html5QrCode = new Html5Qrcode("file-scan-temp")
      const decodedText = await html5QrCode.scanFile(file, true)
      html5QrCode.clear()
      await handleQR(decodedText)
    } catch (err: any) {
      toast.error('Scan failed', 'Could not detect a valid QR code in this image.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleQR = async (qrText: string) => {
    if (busy && stage.kind !== 'idle') return
    setBusy(true)
    try {
      if (scannerRef.current) {
        try { scannerRef.current.clear() } catch (e) {}
        scannerRef.current = null
      }
      const res = await scanQR(qrText)
      playChime(false)
      setStage({
        kind: 'scanned',
        booking: res.booking as ScannedBooking,
        scanType: res.scanType as 'in' | 'out',
        requireCode: res.requireCode,
      })
      if (!res.requireCode) {
        setStage({
          kind: 'success',
          booking: res.booking as ScannedBooking,
          scanType: res.scanType as 'in' | 'out',
        })
        setLastScan({
          name: res.booking.profile?.full_name ?? res.booking.profile?.email ?? '—',
          action: res.scanType === 'in' ? 'Session started' : 'Session ended',
          time: new Date().toISOString(),
        })
      }
    } catch (e) {
      playChime(true)
      setStage({ kind: 'error', message: e instanceof Error ? e.message : 'Scan failed' })
    } finally {
      setBusy(false)
    }
  }

  const handleManual = () => {
    if (!manualId.trim()) return
    const payload = manualId.startsWith('playzone://booking/')
      ? manualId
      : `playzone://booking/${manualId.trim()}`
    handleQR(payload)
  }

  const handleVerify = async () => {
    if (stage.kind !== 'scanned') return
    if (code.length < 4) {
      toast.error('Enter 4 digits')
      return
    }
    setBusy(true)
    try {
      await verifyScanCode(stage.booking.id, code)
      playChime(false)
      setStage({ kind: 'success', booking: stage.booking, scanType: stage.scanType })
      setLastScan({
        name: stage.booking.profile?.full_name ?? stage.booking.profile?.email ?? '—',
        action: stage.scanType === 'in' ? 'Session started' : 'Session ended',
        time: new Date().toISOString(),
      })
    } catch (e) {
      playChime(true)
      toast.error('Wrong code', e instanceof Error ? e.message : '')
      setCode('')
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
    setCode('')
    setManualId('')
    setCameraError(null)
  }

  return (
    <div>
      {/* Hidden div for file scanning */}
      <div id="file-scan-temp" className="hidden"></div>

      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          SCAN ID
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          QR CHECK-IN / CHECK-OUT
        </p>
      </div>

      {/* IDLE — camera view */}
      {stage.kind === 'idle' && (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-4">
            
            {/* Scanner Container */}
            <div className="relative w-full max-w-md mx-auto min-h-[300px] bg-black/50 rounded-xl overflow-hidden mb-4">
              <div 
                id="qr-reader" 
                className="w-full h-full [&>div]:!border-none [&_button]:!bg-gradient-to-r [&_button]:!from-cyan-500 [&_button]:!to-pink-500 [&_button]:!text-white [&_button]:!rounded-lg [&_button]:!font-bold [&_button]:!px-4 [&_button]:!py-2 [&_button]:!my-2 [&_select]:!bg-[#12121a] [&_select]:!text-white [&_select]:!p-2 [&_select]:!rounded-lg"
              />
              
              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/90 z-10">
                  <div className="text-amber-400 text-4xl mb-2">⚠️</div>
                  <div className="text-red-400 text-sm font-bold mb-2">
                    {cameraError}
                  </div>
                </div>
              )}
            </div>

            {/* Fallback Native Camera Button */}
            <div className="text-center mt-2">
              <span className="text-xs text-gray-400 block mb-2">Camera not working?</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-cyan-500/30 text-cyan-300 text-xs font-bold rounded-lg transition"
              >
                📸 Take Photo of QR
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-2xl p-4">
            <label className="text-[10px] text-gray-500 tracking-wider">
              OR ENTER BOOKING ID MANUALLY
            </label>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="BK-1024 or UUID"
                className="flex-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
              />
              <button
                onClick={handleManual}
                disabled={busy || !manualId.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>

          {lastScan && (
            <div className="bg-green-500/5 border border-green-500/30 rounded-2xl p-4">
              <div className="text-[10px] text-green-400 tracking-wider font-bold">
                ✓ LAST SCAN
              </div>
              <div className="mt-1 text-sm text-white font-bold">{lastScan.name}</div>
              <div className="text-xs text-gray-400">
                {lastScan.action} • {formatTime(lastScan.time)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ... (Mee purathana SCANNED, SUCCESS, ERROR UI code alane undandi) ... */}
      
      {/* SCANNED — need code */}
      {stage.kind === 'scanned' && (
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/40 rounded-2xl p-5 space-y-5">
          <div className="text-center">
            <div className="text-3xl mb-1">✅</div>
            <div className="text-xs text-cyan-400 tracking-wider font-bold">
              QR DETECTED
            </div>
          </div>

          <BookingSummary booking={stage.booking} scanType={stage.scanType} />

          {stage.requireCode && (
            <>
              <div className="border-t border-cyan-500/20 pt-4">
                <label className="text-[10px] text-gray-500 tracking-wider block text-center mb-3">
                  ENTER 4-DIGIT CODE FROM CUSTOMER'S SCREEN
                </label>
                <div className="flex justify-center gap-2 mb-3">
                  {[0, 1, 2, 3].map((i) => (
                    <input
                      key={i}
                      type="tel"
                      maxLength={1}
                      value={code[i] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '')
                        const arr = code.split('')
                        arr[i] = v
                        const next = arr.join('').slice(0, 4)
                        setCode(next)
                        if (v && i < 3) {
                          const nextEl = document.querySelectorAll<HTMLInputElement>('[data-code-input]')[i + 1]
                          nextEl?.focus()
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !code[i] && i > 0) {
                          const prevEl = document.querySelectorAll<HTMLInputElement>('[data-code-input]')[i - 1]
                          prevEl?.focus()
                        }
                      }}
                      data-code-input
                      className="w-14 h-16 text-center text-2xl font-black bg-[#0a0a0f] border border-cyan-500/30 rounded-xl focus:outline-none focus:border-cyan-500"
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={reset}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerify}
                  disabled={busy || code.length < 4}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm disabled:opacity-50"
                >
                  {busy ? 'Verifying...' : 'Verify'}
                </button>
              </div>

              {(settings.scan_override_enabled as boolean) && (
                <button
                  onClick={handleOverride}
                  disabled={busy}
                  className="w-full text-[11px] text-amber-400 hover:text-amber-300 py-1 tracking-wider"
                >
                  Admin override (reason required)
                </button>
              )}
            </>
          )}

          {!stage.requireCode && (
            <button
              onClick={reset}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm"
            >
              Done
            </button>
          )}
        </div>
      )}

      {/* SUCCESS */}
      {stage.kind === 'success' && (
        <div className="bg-gradient-to-br from-green-500/10 to-[#0a0a0f] border border-green-500/40 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <div className="text-lg font-black text-green-400 tracking-wider mb-1">
            {stage.scanType === 'in' ? 'SESSION STARTED' : 'SESSION ENDED'}
          </div>

          <div className="mt-4">
            <BookingSummary booking={stage.booking} scanType={stage.scanType} compact />
          </div>

          <button
            onClick={reset}
            className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm"
          >
            Scan Next
          </button>
        </div>
      )}

      {/* ERROR */}
      {stage.kind === 'error' && (
        <div className="bg-gradient-to-br from-red-500/10 to-[#0a0a0f] border border-red-500/40 rounded-2xl p-6 text-center">
          <div className="text-5xl mb-3">❌</div>
          <div className="text-base font-black text-red-400 tracking-wider mb-2">
            SCAN FAILED
          </div>
          <p className="text-sm text-gray-300 mb-5">{stage.message}</p>

          <button
            onClick={reset}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm"
          >
            Try Again
          </button>
        </div>
      )}
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
    <div className="bg-[#0a0a0f]/60 rounded-xl p-3 space-y-1 text-sm">
      <div className="flex items-center gap-2">
        {booking.profile?.avatar_url && (
          <img
            src={booking.profile.avatar_url}
            alt=""
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="font-bold text-white">
          {booking.profile?.full_name ?? booking.profile?.email ?? 'Unknown'}
        </div>
      </div>

      <div className="text-gray-300">
        {booking.game?.name ?? '—'} • {booking.console?.name ?? '—'}
      </div>

      <div className="text-xs text-gray-400">
        {formatDateShort(booking.slot_start)} • {formatTime(booking.slot_start)} – {formatTime(booking.slot_end)}
      </div>

      {!compact && (
        <div className="flex justify-between text-xs pt-2 border-t border-neutral-800">
          <span className="text-gray-400">👥 {booking.players} players</span>
          <span className="text-cyan-400 font-bold">{formatINR(booking.amount)}</span>
        </div>
      )}

      <div className="text-[10px] text-cyan-400 tracking-wider font-bold uppercase pt-1">
        {scanType === 'in' ? '▶ Check-in' : '⏹ Check-out'}
      </div>
    </div>
  )
}