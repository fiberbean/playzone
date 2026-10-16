// app/playzonemama/wallet/RejectModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { rejectRecharge } from '@/lib/actions/recharge'
import { toast } from '@/components/ui/Toast'
import { formatINR } from '@/lib/utils/money'

interface Reason {
  id: string
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  request: {
    id: string
    amount: number
    upi_ref: string
    user: { full_name: string | null; email: string | null; avatar_url: string | null } | null
  } | null
  onSuccess?: () => void
}

// Fallback list if DB table not yet created
const FALLBACK_REASONS: Reason[] = [
  { id: 'fb-1', name: 'UTR mismatch' },
  { id: 'fb-2', name: 'Screenshot unclear' },
  { id: 'fb-3', name: 'Amount mismatch' },
  { id: 'fb-4', name: 'Duplicate submission' },
  { id: 'fb-5', name: 'Payment not received' },
  { id: 'fb-6', name: 'UTR already used' },
  { id: 'fb-7', name: 'Invalid UTR format' },
  { id: 'fb-99', name: 'Other' },
]

export function RejectModal({ open, onClose, request, onSuccess }: Props) {
  const [reasons, setReasons] = useState<Reason[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [customReason, setCustomReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load reasons when modal opens
  useEffect(() => {
    if (!open) return
    setLoading(true)
    ;(async () => {
      try {
        const { createClient } = await import('@/lib/supabase/client')
        const supabase = createClient()
        const { data, error } = await supabase
          .from('reject_reasons')
          .select('id, name')
          .eq('is_active', true)
          .order('display_order', { ascending: true })

        if (error || !data || data.length === 0) {
          console.warn('[RejectModal] Using fallback reasons', error?.message)
          setReasons(FALLBACK_REASONS)
          setSelectedId(FALLBACK_REASONS[0].id)
        } else {
          setReasons(data as Reason[])
          setSelectedId(data[0].id)
        }
      } catch (e) {
        console.warn('[RejectModal] Reason load failed, using fallback', e)
        setReasons(FALLBACK_REASONS)
        setSelectedId(FALLBACK_REASONS[0].id)
      } finally {
        setLoading(false)
      }
    })()
  }, [open])

  // Reset when close
  useEffect(() => {
    if (!open) {
      setSelectedId('')
      setCustomReason('')
    }
  }, [open])

  if (!open || !request) return null

  const selectedReason = reasons.find((r) => r.id === selectedId)
  const isOther = selectedReason?.name === 'Other'
  const finalReason = isOther ? customReason.trim() : selectedReason?.name ?? ''
  const canSubmit = finalReason.length >= 3 && !busy

  const handleReject = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await rejectRecharge(request.id, finalReason)
      toast.success('Rejected', 'Customer notified')
      onSuccess?.()
      onClose()
    } catch (e) {
      toast.error('Reject failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border-2 border-red-500/40 bg-neutral-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            ⚠ Reject Recharge
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Request summary */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-4 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Customer</span>
            <span className="text-white font-bold">
              {request.user?.full_name ?? request.user?.email ?? '—'}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Amount</span>
            <span className="text-red-300 font-bold">
              {formatINR(request.amount)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">UTR</span>
            <span className="text-white font-mono text-[11px]">
              {request.upi_ref}
            </span>
          </div>
        </div>

        {/* Reason dropdown */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-500 tracking-wider font-bold">
            REJECTION REASON *
          </label>
          {loading ? (
            <div className="mt-1 py-3 text-xs text-gray-500 text-center">
              Loading reasons…
            </div>
          ) : (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none"
            >
              <option value="" disabled>
                Select a reason…
              </option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Custom reason textarea (only if Other selected) */}
        {isOther && (
          <div className="mb-3">
            <label className="text-[10px] text-gray-500 tracking-wider font-bold">
              CUSTOM REASON *
            </label>
            <textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. UTR not matching with bank statement"
              rows={3}
              maxLength={300}
              className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none resize-none"
            />
            <div className="text-[10px] text-gray-500 text-right mt-1">
              {customReason.length}/300
            </div>
          </div>
        )}

        {/* Info */}
        <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-2.5 text-[11px] text-red-300 mb-4">
          ⓘ Customer will be notified with this reason. No wallet deduction.
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-200 font-bold text-sm disabled:opacity-40"
          >
            {busy ? 'Rejecting…' : '✕ Reject Request'}
          </button>
        </div>
      </div>
    </div>
  )
}