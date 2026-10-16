// app/wallet/RechargeModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { submitRecharge } from '@/lib/actions/recharge'
import { uploadImageToR2 } from '@/lib/actions/upload'
import { toast } from '@/components/ui/Toast'
import { formatINR } from '@/lib/utils/money'
import { ScreenshotOCR } from '@/components/ScreenshotOCR'

interface Props {
  open: boolean
  onClose: () => void
  upiId: string
}

export function RechargeModal({ open, onClose, upiId }: Props) {
  const [amount, setAmount] = useState(100)
  const [customAmount, setCustomAmount] = useState('')
  const [upiRef, setUpiRef] = useState('')
  const [upiApp, setUpiApp] = useState<string>('')
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (amount > 0 && !screenshotBlob && !upiRef) {
          toast.info('Welcome back', 'Paid? Paste UTR & upload screenshot')
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open, amount, screenshotBlob, upiRef])

  if (!open) return null

  const finalAmount = customAmount ? Number(customAmount) : amount

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=Play%20Zone&am=${finalAmount}&cu=INR&tn=${encodeURIComponent('PlayZone Recharge')}`

  const handleSubmit = async () => {
    if (!finalAmount || finalAmount <= 0) return toast.error('Enter valid amount')
    if (upiRef.length < 6) return toast.error('Enter valid UTR (min 6 chars)')

    setBusy(true)
    try {
      let screenshot_url: string | undefined
      let screenshot_key: string | undefined

      if (screenshotBlob) {
        setUploading(true)
        try {
          // ✅ Use R2 upload (server action) — NOT Supabase Storage
          const fd = new FormData()
          const ext = (screenshotBlob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
          fd.append('file', screenshotBlob, `recharge-${Date.now()}.${ext}`)

          const result = await uploadImageToR2(fd)
          if ('error' in result && result.error) {
            console.warn('R2 upload failed:', result.error)
            toast.warning('Screenshot upload failed', 'You can still submit without it')
          } else if ('success' in result && result.success) {
            screenshot_url = result.url
            screenshot_key = result.key
          }
        } catch (uploadErr) {
          console.error('Upload exception:', uploadErr)
          toast.warning('Screenshot upload failed', 'You can still submit without it')
        } finally {
          setUploading(false)
        }
      }

      await submitRecharge({
        amount: finalAmount,
        upi_ref: upiRef,
        upi_app: upiApp || undefined,
        screenshot_url,
        screenshot_key,
      })

      toast.success('Submitted', 'Admin will verify shortly')
      onClose()
      setAmount(100)
      setCustomAmount('')
      setUpiRef('')
      setUpiApp('')
      setScreenshotBlob(null)
      setScreenshotPreview(null)
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-cyan-500/40 bg-neutral-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-white">💳 Add Money</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        {/* Amount presets */}
        <div className="mb-3">
          <div className="text-[10px] text-gray-500 tracking-wider mb-2">AMOUNT</div>
          <div className="grid grid-cols-4 gap-2">
            {[100, 200, 500, 1000].map((a) => (
              <button
                key={a}
                onClick={() => { setAmount(a); setCustomAmount('') }}
                className={`py-2.5 rounded-xl text-sm font-bold border transition ${
                  !customAmount && amount === a
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-white/10 bg-white/5 text-gray-300'
                }`}
              >
                ₹{a}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Or custom amount"
            className="w-full mt-2 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm"
          />
        </div>

        {/* UPI Info */}
        <div className="mb-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-4">
          <div className="text-[10px] text-cyan-300 tracking-widest font-bold mb-3">
            PAY VIA UPI
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 min-w-0 rounded-lg bg-[#0a0a0f] border border-cyan-500/30 px-3 py-3">
              <div className="text-[9px] text-gray-500 tracking-wider font-bold mb-1">
                UPI ID
              </div>
              <div className="font-mono text-base text-white truncate">
                {upiId}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(upiId)
                  toast.success('UPI ID copied', upiId)
                } catch {
                  const el = document.createElement('textarea')
                  el.value = upiId
                  document.body.appendChild(el)
                  el.select()
                  document.execCommand('copy')
                  document.body.removeChild(el)
                  toast.success('UPI ID copied', upiId)
                }
              }}
              className="shrink-0 w-14 h-14 rounded-lg bg-gradient-to-br from-cyan-500 to-pink-500 flex flex-col items-center justify-center gap-0.5 text-white active:scale-95 transition"
              aria-label="Copy UPI ID"
            >
              <span className="text-base">📋</span>
              <span className="text-[8px] font-bold tracking-wider">COPY</span>
            </button>
          </div>

          <a
            href={upiDeepLink}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm tracking-wider"
          >
            <span>Open UPI App to Pay</span>
            <span>→</span>
          </a>

          <div className="text-[10px] text-gray-500 text-center mt-3 leading-relaxed">
            Or open GPay / PhonePe / Paytm manually<br />
            and pay to the UPI ID above
          </div>
        </div>

        {/* Screenshot + OCR */}
        <div className="mb-3">
          <div className="text-[10px] text-gray-500 tracking-wider mb-2 flex items-center justify-between">
            <span>PAYMENT SCREENSHOT</span>
            <span className="text-cyan-400">AUTO-READS UTR</span>
          </div>
          <ScreenshotOCR
            onExtracted={({ utr, amount: extAmount, screenshotBlob: blob, previewUrl }) => {
              setScreenshotBlob(blob)
              setScreenshotPreview(previewUrl)
              if (utr) setUpiRef(utr)
              if (extAmount && !customAmount) {
                if (extAmount !== amount) {
                  setCustomAmount(String(extAmount))
                }
              }
            }}
          />
        </div>

        {/* UTR input */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-500 tracking-wider">
            UTR / REFERENCE NUMBER *
          </label>
          <input
            type="text"
            value={upiRef}
            onChange={(e) => setUpiRef(e.target.value)}
            placeholder="Auto-filled from screenshot, or type manually"
            className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono"
          />
        </div>

        {/* UPI app picker */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-500 tracking-wider">UPI APP (optional)</label>
          <div className="grid grid-cols-4 gap-2 mt-1">
            {['GPay', 'PhonePe', 'Paytm', 'Other'].map((app) => (
              <button
                key={app}
                onClick={() => setUpiApp(upiApp === app ? '' : app)}
                className={`py-2 rounded-lg text-xs font-bold border transition ${
                  upiApp === app
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                    : 'border-white/10 bg-white/5 text-gray-400'
                }`}
              >
                {app}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-amber-500/5 border border-amber-500/30 p-3 text-xs text-amber-200 mb-4">
          ⓘ Screenshot auto-extracts UTR. Wallet credited after admin verifies.
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy || uploading}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold disabled:opacity-50"
        >
          {uploading ? 'Uploading screenshot...'
           : busy ? 'Submitting...'
           : `Submit ₹${finalAmount || 0} for Review`}
        </button>
      </div>
    </div>
  )
}