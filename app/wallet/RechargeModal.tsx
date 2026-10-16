// app/wallet/RechargeModal.tsx
'use client'

import { useState } from 'react'
import { submitRecharge } from '@/lib/actions/recharge'
import { toast } from '@/components/ui/Toast'
import { formatINR } from '@/lib/utils/money'

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
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const finalAmount = customAmount ? Number(customAmount) : amount

  const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=Play%20Zone&am=${finalAmount}&cu=INR`

  const handleSubmit = async () => {
    if (!finalAmount || finalAmount <= 0) return toast.error('Enter valid amount')
    if (upiRef.length < 6) return toast.error('Enter valid UTR (min 6 chars)')

    setBusy(true)
    try {
      await submitRecharge({
        amount: finalAmount,
        upi_ref: upiRef,
        upi_app: upiApp || undefined,
      })
      toast.success('Submitted', 'Admin will verify shortly')
      onClose()
      setAmount(100)
      setCustomAmount('')
      setUpiRef('')
      setUpiApp('')
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
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
        <div className="mb-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3">
          <div className="text-[10px] text-cyan-300 tracking-wider font-bold mb-1">PAY VIA UPI</div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-sm text-white truncate">{upiId}</div>
            <button
              onClick={() => { navigator.clipboard.writeText(upiId); toast.success('Copied') }}
              className="text-xs text-cyan-400 hover:text-cyan-300 shrink-0"
            >
              Copy
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <a
              href={upiDeepLink}
              className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 text-white text-xs font-bold text-center"
            >
              Open UPI App
            </a>
          </div>
        </div>

        {/* UTR */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-500 tracking-wider">
            UTR / REFERENCE NUMBER *
          </label>
          <input
            type="text"
            value={upiRef}
            onChange={(e) => setUpiRef(e.target.value)}
            placeholder="4023XXXXXXXX1234"
            className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm font-mono"
          />
        </div>

        {/* UPI app */}
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
          ⓘ Wallet credited after admin verifies the UTR. Usually within 5–10 minutes.
        </div>

        <button
          onClick={handleSubmit}
          disabled={busy}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold disabled:opacity-50"
        >
          {busy ? 'Submitting...' : `Submit ₹${finalAmount || 0} for Review`}
        </button>
      </div>
    </div>
  )
}