// app/wallet/RechargeModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { submitRecharge } from '@/lib/actions/recharge'
import { uploadImageToR2 } from '@/lib/actions/upload'
import { toast } from '@/components/ui/Toast'
import { formatINR } from '@/lib/utils/money'
import { ScreenshotOCR } from '@/components/ScreenshotOCR'
import { createClient } from '@/lib/supabase/client'
import { QRCodeSVG } from 'qrcode.react'

interface Props {
  open: boolean
  onClose: () => void
  upiId: string
  payeeName?: string
  zonePhone?: string
}

type DateReason = 'not_found' | 'not_today' | 'future' | null
type MatchedBy = 'upi' | 'name' | null
type EditField = 'amount' | 'utr' | 'upiApp' | null

function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, mo, d] = iso.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${parseInt(d)} ${months[parseInt(mo) - 1]} ${y}`
}

export function RechargeModal({ open, onClose, upiId, payeeName, zonePhone }: Props) {
  const [amount, setAmount] = useState<number>(0)
  const [upiRef, setUpiRef] = useState('')
  const [upiApp, setUpiApp] = useState<string>('')
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  const [hasUpload, setHasUpload] = useState(false)
  const [ocrDone, setOcrDone] = useState(false)
  const [dateValid, setDateValid] = useState(false)
  const [dateReason, setDateReason] = useState<DateReason>(null)
  const [detectedDate, setDetectedDate] = useState<string | null>(null)
  const [paymentMatched, setPaymentMatched] = useState(true)
  const [matchedBy, setMatchedBy] = useState<MatchedBy>(null)

  const [editField, setEditField] = useState<EditField>(null)
  const [errorPopup, setErrorPopup] = useState<null | 'payment' | 'date' | 'date_future' | 'date_not_found'>(null)

  useEffect(() => {
    if (!open) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !screenshotBlob && !upiRef) {
        toast.info('Welcome back')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [open, screenshotBlob, upiRef])

  useEffect(() => {
    if (!ocrDone) return
    if (!paymentMatched) {
      setErrorPopup('payment')
    } else if (!dateValid) {
      if (dateReason === 'future') setErrorPopup('date_future')
      else if (dateReason === 'not_found') setErrorPopup('date_not_found')
      else if (dateReason === 'not_today') setErrorPopup('date')
    }
  }, [ocrDone, paymentMatched, dateValid, dateReason])

  if (!open) return null

  const canSubmit =
    amount > 0 && upiRef.length >= 6 && !!screenshotBlob && dateValid && paymentMatched

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName || 'Play Zone')}&cu=INR`

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(upiId)
      toast.success('UPI ID copied')
    } catch {
      const el = document.createElement('textarea')
      el.value = upiId
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      toast.success('UPI ID copied')
    }
  }

  const handleReset = () => {
    setAmount(0)
    setUpiRef('')
    setUpiApp('')
    setScreenshotBlob(null)
    setHasUpload(false)
    setOcrDone(false)
    setDateValid(false)
    setDateReason(null)
    setDetectedDate(null)
    setPaymentMatched(true)
    setMatchedBy(null)
    setEditField(null)
    setErrorPopup(null)
  }

  const handleSubmit = async () => {
    if (!amount || amount <= 0) return toast.error('Enter the amount')
    if (upiRef.length < 6) return toast.error('UTR should be at least 6 characters')
    if (!screenshotBlob) return toast.error('Upload payment details first')
    if (!dateValid) return toast.error("Screenshot isn't from today")
    if (!paymentMatched) return toast.error('Payment was made to a different UPI')

    setBusy(true)
    try {
      const supabase = createClient()
      const { data: existing } = await supabase
        .from('recharge_requests')
        .select('id, status')
        .eq('upi_ref', upiRef.trim())
        .maybeSingle()

      if (existing) {
        const msg =
          existing.status === 'pending' ? 'Already pending'
          : existing.status === 'approved' ? 'Already banked'
          : 'Already rejected'
        throw new Error(`This UTR was already submitted (${msg})`)
      }

      let screenshot_url: string
      let screenshot_key: string

      setUploading(true)
      const fd = new FormData()
      const ext = (screenshotBlob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      fd.append('file', screenshotBlob, `recharge-${Date.now()}.${ext}`)

      const result = await uploadImageToR2(fd)
      if ('error' in result && result.error) throw new Error(result.error)
      if ('success' in result && result.success) {
        screenshot_url = result.url
        screenshot_key = result.key
      } else {
        throw new Error('Upload failed — try again')
      }
      setUploading(false)

      await submitRecharge({
        amount,
        upi_ref: upiRef.trim(),
        upi_app: upiApp || undefined,
        screenshot_url,
        screenshot_key,
      })

      toast.success('Submitted!', 'Admin will verify shortly')
      onClose()
      handleReset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
      setUploading(false)
    }
  }

  const waNumber = (zonePhone ?? '').replace(/\D/g, '')
  const waMessage = encodeURIComponent(
    `Hi Play Zone! Recharge issue.\n\nAmount: ₹${amount || '___'}\nUTR: ${upiRef || '___'}\n\nScreenshot attached below:`
  )
  const waLink = waNumber ? `https://wa.me/${waNumber}?text=${waMessage}` : '#'

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
        onClick={onClose}
      >
        <div
          className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-cyan-500/40 bg-neutral-950 p-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">💳 Add Money</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-xl leading-none"
            >
              ✕
            </button>
          </div>

          {/* ============ PAY VIA UPI ============ */}
          <div className="mb-4">
            <div className="text-[10px] text-gray-500 tracking-wider mb-2">
              PAY VIA UPI
            </div>

            {/* 👈 MOBILE: Open UPI App button (visible only on mobile) */}
            <div className="md:hidden">
              <a
                href={upiDeepLink}
                className="relative block w-full rounded-xl overflow-hidden active:scale-[0.98] transition"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(34,211,238,0.5) 0%, rgba(236,72,153,0.5) 100%)',
                    filter: 'blur(8px)',
                  }}
                  aria-hidden
                />
                <div className="relative rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 py-3.5 flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30">
                  <span className="text-lg">📱</span>
                  <span className="text-white font-bold tracking-wider text-sm">
                    Open UPI App
                  </span>
                </div>
              </a>
              <div className="mt-2 text-center text-[10px] text-gray-500 leading-snug">
                Opens GPay · PhonePe · Paytm
                <br />
                or any installed UPI app
              </div>
            </div>

            {/* 👈 DESKTOP: QR + UPI ID (visible only on desktop) */}
            <div className="hidden md:flex gap-3 items-stretch">
              {/* QR code — left */}
              <div className="shrink-0 rounded-xl bg-white p-2.5 shadow-lg shadow-cyan-500/10 flex items-center justify-center">
                <QRCodeSVG
                  value={upiDeepLink}
                  size={132}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#0a0a0f"
                />
              </div>

              {/* UPI ID + Payee Name — right */}
              <div className="flex-1 min-w-0 flex flex-col justify-between rounded-xl border border-cyan-500/40 bg-gradient-to-br from-[#0a0a0f] to-[#111827] p-3.5">
                <div className="min-w-0">
                  <div className="text-[9px] text-cyan-400 tracking-widest font-bold mb-1">
                    UPI ID
                  </div>
                  <div className="font-mono text-base font-black text-white truncate">
                    {upiId}
                  </div>
                  {payeeName && (
                    <div className="text-[11px] text-gray-400 mt-1 truncate">
                      {payeeName}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="w-full mt-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 flex items-center justify-center gap-1.5 text-white text-[11px] font-bold tracking-wider active:scale-95 transition"
                >
                  <span>📋</span>
                  <span>COPY UPI ID</span>
                </button>
              </div>
            </div>

            <div className="hidden md:block mt-2 text-center text-[10px] text-gray-500">
              Scan QR with any UPI app · GPay · PhonePe · Paytm
            </div>
          </div>

          {/* Screenshot OCR */}
          <div className="mb-4">
            <div className="text-[10px] text-gray-500 tracking-wider mb-2">
              PAYMENT DETAILS <span className="text-red-400">*</span>
            </div>

            <ScreenshotOCR
              expectedUpiId={upiId}
              expectedPayeeName={payeeName}
              onExtracted={({
                utr,
                amount: extAmount,
                upiApp: extApp,
                detectedDate: extDate,
                dateValid: dValid,
                dateReason: dReason,
                paymentMatched: dMatched,
                matchedBy: dMatchedBy,
                screenshotBlob: blob,
              }) => {
                if (!blob || blob.size === 0) {
                  setHasUpload(false)
                  setOcrDone(false)
                  setScreenshotBlob(null)
                  setAmount(0)
                  setUpiRef('')
                  setUpiApp('')
                  setDateValid(false)
                  setDateReason(null)
                  setDetectedDate(null)
                  setPaymentMatched(true)
                  setMatchedBy(null)
                  return
                }

                setScreenshotBlob(blob)
                setHasUpload(true)
                setOcrDone(true)
                setDateValid(!!dValid)
                setDateReason(dReason ?? null)
                setDetectedDate(extDate ?? null)
                setPaymentMatched(dMatched !== false)
                setMatchedBy(dMatchedBy ?? null)

                if (extAmount && extAmount > 0) setAmount(extAmount)
                else setAmount(0)

                if (utr) setUpiRef(utr)
                else setUpiRef('')

                if (extApp) setUpiApp(extApp)
                else setUpiApp('')
              }}
            />
          </div>

          {/* ============ CHIPS PANEL ============ */}
          {hasUpload && ocrDone && (
            <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2.5">
              <div className="text-[10px] font-bold tracking-wider text-cyan-300 mb-1">
                PAYMENT DETAILS
              </div>

              {/* AMOUNT */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 shrink-0">Amount</span>
                {editField === 'amount' ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={amount || ''}
                      onChange={(e) => setAmount(Number(e.target.value) || 0)}
                      onBlur={() => amount > 0 && setEditField(null)}
                      onKeyDown={(e) => e.key === 'Enter' && amount > 0 && setEditField(null)}
                      autoFocus
                      placeholder="Enter amount"
                      className="flex-1 bg-[#0a0a0f] border border-cyan-500/40 rounded-lg px-2 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none text-right"
                    />
                    <button
                      onClick={() => setEditField(null)}
                      className="shrink-0 text-[10px] text-cyan-300 font-bold hover:text-cyan-200"
                    >
                      ✓
                    </button>
                  </div>
                ) : amount > 0 ? (
                  <button
                    onClick={() => setEditField('amount')}
                    className="text-xs font-mono text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30 hover:bg-green-500/20 transition"
                  >
                    ₹{amount} <span className="text-[9px] opacity-60 ml-1">✏</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setEditField('amount')}
                    className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/20 transition italic"
                  >
                    Tap to enter
                  </button>
                )}
              </div>

              {/* UTR */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 shrink-0">UTR</span>
                {editField === 'utr' ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={upiRef}
                      onChange={(e) => setUpiRef(e.target.value)}
                      onBlur={() => upiRef.length >= 6 && setEditField(null)}
                      onKeyDown={(e) => e.key === 'Enter' && upiRef.length >= 6 && setEditField(null)}
                      autoFocus
                      placeholder="Enter UTR"
                      className="flex-1 bg-[#0a0a0f] border border-cyan-500/40 rounded-lg px-2 py-1.5 text-sm font-mono text-white focus:border-cyan-500 focus:outline-none text-right"
                    />
                    <button
                      onClick={() => setEditField(null)}
                      className="shrink-0 text-[10px] text-cyan-300 font-bold hover:text-cyan-200"
                    >
                      ✓
                    </button>
                  </div>
                ) : upiRef ? (
                  <button
                    onClick={() => setEditField('utr')}
                    className="text-xs font-mono text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30 hover:bg-green-500/20 transition truncate max-w-[60%]"
                  >
                    {upiRef} <span className="text-[9px] opacity-60 ml-1">✏</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setEditField('utr')}
                    className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/20 transition italic"
                  >
                    Tap to enter
                  </button>
                )}
              </div>

              {/* UPI APP */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 shrink-0">UPI App</span>
                {editField === 'upiApp' ? (
                  <div className="flex-1 grid grid-cols-4 gap-1.5">
                    {['GPay', 'PhonePe', 'Paytm', 'Other'].map((app) => (
                      <button
                        key={app}
                        onClick={() => {
                          setUpiApp(upiApp === app ? '' : app)
                          setEditField(null)
                        }}
                        className={`py-1 rounded text-[10px] font-bold border transition ${
                          upiApp === app
                            ? 'border-cyan-500 bg-cyan-500/15 text-cyan-300'
                            : 'border-white/10 bg-white/5 text-gray-400'
                        }`}
                      >
                        {app}
                      </button>
                    ))}
                  </div>
                ) : upiApp ? (
                  <button
                    onClick={() => setEditField('upiApp')}
                    className="text-xs text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30 hover:bg-green-500/20 transition"
                  >
                    {upiApp} <span className="text-[9px] opacity-60 ml-1">✏</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setEditField('upiApp')}
                    className="text-[11px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/40 hover:bg-amber-500/20 transition italic"
                  >
                    Tap to select
                  </button>
                )}
              </div>

              {/* DATE */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-gray-400 shrink-0">Date</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {detectedDate ? (
                    <>
                      <span
                        className={`text-xs font-mono px-2 py-1 rounded border ${
                          dateValid
                            ? 'text-green-300 bg-green-500/10 border-green-500/30'
                            : 'text-red-300 bg-red-500/10 border-red-500/30'
                        }`}
                      >
                        {formatIsoDate(detectedDate)}
                      </span>
                      {dateValid ? (
                        <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-green-500/15 border border-green-500/40 text-green-300">
                          ✓ VALID
                        </span>
                      ) : dateReason === 'future' ? (
                        <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-red-300">
                          FUTURE
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/40 text-red-300">
                          REJECTED
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] font-bold tracking-wider px-2 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">
                      NOT FOUND
                    </span>
                  )}
                </div>
              </div>

              {/* PAID TO — UPI ID OR Payee Name */}
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-cyan-500/20">
                <span className="text-[11px] text-gray-400 shrink-0">Paid to</span>
                {paymentMatched ? (
                  <span className="text-xs text-green-300 bg-green-500/10 px-2 py-1 rounded border border-green-500/30 font-mono truncate max-w-[60%]">
                    {matchedBy === 'name' ? `✓ ${payeeName}` : `✓ ${upiId}`}
                  </span>
                ) : (
                  <span className="text-xs text-red-300 bg-red-500/10 px-2 py-1 rounded border border-red-500/30">
                    ✗ Wrong Payee
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={busy || uploading || !canSubmit}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {uploading
              ? 'Uploading...'
              : busy
              ? 'Submitting...'
              : !screenshotBlob
              ? 'Upload Payment Details First'
              : !paymentMatched
              ? 'Wrong Payee — Not Accepted'
              : !dateValid
              ? "Screenshot Date Must Be Today"
              : amount === 0
              ? 'Amount Not Detected'
              : upiRef.length < 6
              ? 'UTR Not Detected'
              : `Submit ${formatINR(amount)} for Review`}
          </button>
        </div>
      </div>

      {/* ============ ERROR POPUP ============ */}
      {errorPopup && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setErrorPopup(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border-2 border-red-500/50 bg-neutral-950 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center text-3xl">
                ⚠️
              </div>
            </div>

            <h3 className="text-base font-black text-red-200 text-center mb-2">
              {errorPopup === 'payment'
                ? 'PAYMENT TO WRONG UPI'
                : errorPopup === 'date'
                ? "SCREENSHOT ISN'T FROM TODAY"
                : errorPopup === 'date_future'
                ? 'DATE IS IN THE FUTURE'
                : "COULDN'T READ THE DATE"}
            </h3>

            <p className="text-xs text-red-100/85 text-center leading-relaxed mb-4">
              {errorPopup === 'payment' ? (
                <>
                  This payment wasn't made to{' '}
                  <span className="font-mono font-bold text-white">{upiId}</span>
                  {payeeName && <> or <span className="font-bold text-white">{payeeName}</span></>}.
                  Please pay to our UPI.
                </>
              ) : errorPopup === 'date' ? (
                <>
                  This screenshot isn't from today.{' '}
                  {detectedDate && (
                    <>
                      Detected: <span className="font-mono">{formatIsoDate(detectedDate)}</span>
                    </>
                  )}
                  {' '}Please upload today's payment.
                </>
              ) : errorPopup === 'date_future' ? (
                'The date in the screenshot is in the future. Please check.'
              ) : (
                "Couldn't find the date in this screenshot. Try a clearer one."
              )}
            </p>

            <div className="rounded-lg bg-green-500/5 border border-green-500/30 p-2.5 mb-3">
              <div className="text-[10px] text-green-200/80 text-center mb-1.5">
                Paid earlier and missed to add it?
              </div>
              <a
                href={waLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-md bg-green-500/20 border border-green-500/50 text-green-200 text-[11px] font-bold tracking-wider hover:bg-green-500/30 transition"
              >
                <span>💬</span>
                <span>Chat on WhatsApp</span>
                <span>→</span>
              </a>
            </div>

            <button
              onClick={() => setErrorPopup(null)}
              className="w-full py-2.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 font-bold text-xs tracking-wider hover:bg-white/10 transition"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  )
}