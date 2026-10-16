// app/playzonemama/wallet/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, formatDateShort } from '@/lib/utils/time'
import { formatINR, formatSigned } from '@/lib/utils/money'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { toast } from '@/components/ui/Toast'
import { approveRecharge } from '@/lib/actions/recharge'
import { manualAdjustment } from '@/lib/actions/wallet'
import { RejectModal } from './RejectModal'

type Tab = 'recharge' | 'ledger' | 'balances' | 'adjust'

type RechargeRow = {
  id: string
  user_id: string
  amount: number
  upi_ref: string
  upi_app: string | null
  screenshot_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  rejection_reason: string | null
  created_at: string
  profile: {
    full_name: string | null
    email: string | null
    avatar_url: string | null
  } | null
}

type TxnRow = {
  id: string
  user_id: string
  type: 'credit' | 'debit'
  amount: number
  balance_after: number
  source: string
  reason_short: string | null
  booking_id: string | null
  created_at: string
  profile: { full_name: string | null; email: string | null } | null
}

type BalanceRow = {
  id: string
  full_name: string | null
  email: string | null
  avatar_url: string | null
  wallet_balance: number
  time_credit_min: number
}

export default function WalletPage() {
  const [tab, setTab] = useState<Tab>('recharge')
  const [recharges, setRecharges] = useState<RechargeRow[]>([])
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [balances, setBalances] = useState<BalanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [modal, setModal] = useState<null | { type: 'approve'; row: RechargeRow }>(null)
  const [rejectRow, setRejectRow] = useState<RechargeRow | null>(null)
  const [detailRow, setDetailRow] = useState<RechargeRow | null>(null)
  const [adjust, setAdjust] = useState({
    userId: '',
    amount: 100,
    type: 'credit' as 'credit' | 'debit',
    reason: '',
  })
  const [adjustBusy, setAdjustBusy] = useState(false)

  const fetchAll = async () => {
    const supabase = createClient()

    const [rechargesRes, txnsRes, balancesRes] = await Promise.all([
      supabase
        .from('recharge_requests')
        .select(`
          id, user_id, amount, upi_ref, upi_app, screenshot_url,
          status, reviewed_at, rejection_reason, created_at,
          profile:profiles!recharge_requests_user_id_fkey(full_name, email, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('wallet_transactions')
        .select(`
          id, user_id, type, amount, balance_after, source,
          reason_short, booking_id, created_at,
          profile:profiles!wallet_transactions_user_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, wallet_balance, time_credit_min')
        .eq('role', 'customer')
        .order('wallet_balance', { ascending: false }),
    ])
    setRecharges((rechargesRes.data as any) ?? [])
    setTxns((txnsRes.data as any) ?? [])
    setBalances((balancesRes.data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const supabase = createClient()
    const channelName = `admin-wallet-${Math.random().toString(36).slice(2)}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recharge_requests' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wallet_transactions' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const pendingRecharges = useMemo(
    () => recharges.filter((r) => r.status === 'pending'),
    [recharges]
  )

  const handleApprove = async () => {
    if (!modal) return
    setBusy(modal.row.id)
    try {
      await approveRecharge(modal.row.id)
      toast.success('Approved', `₹${modal.row.amount} credited`)
      setModal(null)
      fetchAll()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setBusy(null)
    }
  }

  const handleManualAdjust = async () => {
    if (!adjust.userId) {
      toast.error('Select a customer')
      return
    }
    if (!adjust.reason.trim()) {
      toast.error('Reason is required')
      return
    }
    if (adjust.amount <= 0) {
      toast.error('Amount must be positive')
      return
    }
    setAdjustBusy(true)
    try {
      await manualAdjustment(adjust.userId, adjust.amount, adjust.type, adjust.reason)
      toast.success('Adjustment saved')
      setAdjust({ userId: '', amount: 100, type: 'credit', reason: '' })
      fetchAll()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setAdjustBusy(false)
    }
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'recharge', label: 'Recharges', badge: pendingRecharges.length },
    { key: 'ledger', label: 'Ledger' },
    { key: 'balances', label: 'Balances' },
    { key: 'adjust', label: 'Adjust' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          WALLET
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          RECHARGES • LEDGER • BALANCES
        </p>
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap border transition ${
              tab === t.key
                ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {t.label.toUpperCase()}
            {t.badge ? (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[9px]">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : (
        <>
          {tab === 'recharge' && (
            <RechargeTab
              rows={recharges}
              onApprove={(row) => setModal({ type: 'approve', row })}
              onReject={(row) => setRejectRow(row)}
              onDetail={(row) => setDetailRow(row)}
            />
          )}
          {tab === 'ledger' && <LedgerTab rows={txns} />}
          {tab === 'balances' && <BalancesTab rows={balances} />}
          {tab === 'adjust' && (
            <AdjustTab
              balances={balances}
              adjust={adjust}
              setAdjust={setAdjust}
              busy={adjustBusy}
              onSubmit={handleManualAdjust}
            />
          )}
        </>
      )}

      {/* Approve modal */}
      {modal?.type === 'approve' && (
        <ConfirmActionModal
          open
          title="Approve Recharge"
          variant="info"
          summary={[
            `Customer: ${modal.row.profile?.full_name ?? modal.row.profile?.email ?? '—'}`,
            `Amount: ${formatINR(modal.row.amount)}`,
            `UTR: ${modal.row.upi_ref}`,
          ]}
          breakdown={[
            { label: 'Wallet credit', value: modal.row.amount, highlight: 'green', bold: true },
          ]}
          notices={['Wallet will be credited immediately.']}
          confirmLabel="Approve & Credit"
          cancelLabel="Cancel"
          busy={busy === modal.row.id}
          onConfirm={handleApprove}
          onCancel={() => setModal(null)}
        />
      )}

      {/* Reject modal — dropdown reasons */}
      <RejectModal
        open={!!rejectRow}
        onClose={() => setRejectRow(null)}
        request={
          rejectRow
            ? {
                id: rejectRow.id,
                amount: rejectRow.amount,
                upi_ref: rejectRow.upi_ref,
                user: rejectRow.profile,
              }
            : null
        }
        onSuccess={() => {
          setRejectRow(null)
          fetchAll()
        }}
      />

      {/* Detail modal */}
      {detailRow && (
        <RechargeDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onApprove={() => {
            setDetailRow(null)
            setModal({ type: 'approve', row: detailRow })
          }}
          onReject={() => {
            setDetailRow(null)
            setRejectRow(detailRow)
          }}
        />
      )}
    </div>
  )
}

// ================= RECHARGE TAB =================

function RechargeTab({
  rows, onApprove, onReject, onDetail,
}: {
  rows: RechargeRow[]
  onApprove: (row: RechargeRow) => void
  onReject: (row: RechargeRow) => void
  onDetail: (row: RechargeRow) => void
}) {
  const pending = rows.filter((r) => r.status === 'pending')
  const recent = rows.filter((r) => r.status !== 'pending').slice(0, 20)

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h3 className="text-xs font-bold tracking-wider text-amber-400 mb-3">
            🟡 PENDING ({pending.length})
          </h3>
          <div className="space-y-3">
            {pending.map((r) => (
              <PersonNote
                key={r.id}
                row={r}
                variant="pending"
                onApprove={onApprove}
                onReject={onReject}
                onDetail={onDetail}
              />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section>
          <h3 className="text-xs font-bold tracking-wider text-gray-500 mb-3">
            REVIEWED
          </h3>
          <div className="space-y-3">
            {recent.map((r) => (
              <PersonNote
                key={r.id}
                row={r}
                variant="reviewed"
                onApprove={onApprove}
                onReject={onReject}
                onDetail={onDetail}
              />
            ))}
          </div>
        </section>
      )}

      {rows.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">💳</div>
          <p className="text-gray-400 text-sm">No recharge requests</p>
        </div>
      )}
    </div>
  )
}

// ================= PERSON NOTE CARD =================

function PersonNote({
  row, variant, onApprove, onReject, onDetail,
}: {
  row: RechargeRow
  variant: 'pending' | 'reviewed'
  onApprove: (row: RechargeRow) => void
  onReject: (row: RechargeRow) => void
  onDetail: (row: RechargeRow) => void
}) {
  const isPending = variant === 'pending'
  const isApproved = row.status === 'approved'
  const isRejected = row.status === 'rejected'

  // Card border/bg by status
  const cardClass = isPending
    ? 'border-amber-500/40 bg-amber-500/[0.03]'
    : isApproved
    ? 'border-green-500/30 bg-green-500/[0.03]'
    : 'border-red-500/40 bg-red-500/[0.03]'

  const badgeClass = isPending
    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
    : isApproved
    ? 'bg-green-500/10 border-green-500/40 text-green-300'
    : 'bg-red-500/10 border-red-500/40 text-red-300'

  const displayName = row.profile?.full_name ?? row.profile?.email ?? '—'
  const firstName = (row.profile?.full_name ?? '').split(' ')[0] || displayName

  return (
    <div className={`rounded-2xl border-2 overflow-hidden ${cardClass}`}>
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-base">📝</span>
          <span className="text-[10px] font-black tracking-widest text-gray-400">
            RECHARGE NOTE
          </span>
        </div>
        <span className={`text-[10px] font-black tracking-wider px-2.5 py-1 rounded-full border ${badgeClass}`}>
          {isPending ? '🟡 PENDING' : isApproved ? '🟢 APPROVED' : '🔴 REJECTED'}
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Person asking */}
        <button
          onClick={() => onDetail(row)}
          className="w-full text-left flex items-center gap-3 mb-3 group"
        >
          {row.profile?.avatar_url ? (
            <img
              src={row.profile.avatar_url}
              alt=""
              className="w-10 h-10 rounded-full border border-cyan-500/30 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-sm font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition">
              {displayName}
            </div>
            <div className="text-[11px] text-gray-500 truncate">
              {isPending
                ? 'is requesting approval'
                : isApproved
                ? 'recharge approved'
                : 'recharge rejected'}
            </div>
          </div>
        </button>

        {/* Big amount box — pending shows amount, rejected shows reason bold */}
        {isPending && (
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.02] py-4 mb-3">
            <div className="text-center">
              <div className="text-[10px] font-black tracking-widest text-amber-400/80 mb-1">
                REQUESTED AMOUNT
              </div>
              <div className="text-4xl font-black text-white tabular-nums">
                {formatINR(row.amount)}
              </div>
            </div>
          </div>
        )}

        {isRejected && row.rejection_reason && (
          <div className="rounded-xl border-l-4 border-red-500 bg-red-500/10 px-4 py-3 mb-3">
            <div className="text-[10px] font-black tracking-widest text-red-400 mb-1">
              ❌ REASON
            </div>
            <div className="text-base font-black text-red-100 leading-snug">
              {row.rejection_reason}
            </div>
          </div>
        )}

        {isApproved && (
          <div className="rounded-xl border-l-4 border-green-500 bg-green-500/10 px-4 py-3 mb-3">
            <div className="text-[10px] font-black tracking-widest text-green-400 mb-1">
              ✓ CREDITED
            </div>
            <div className="text-2xl font-black text-green-100 tabular-nums">
              {formatINR(row.amount)}
            </div>
          </div>
        )}

        {/* Meta row */}
        <button
          onClick={() => onDetail(row)}
          className="w-full text-left flex items-center justify-between text-[11px] text-gray-500 mb-3"
        >
          <span className="font-mono truncate">
            UTR: {row.upi_ref}
            {row.upi_app && <span className="ml-1.5 text-cyan-400">• {row.upi_app}</span>}
          </span>
          <span className="shrink-0 ml-2">{formatDateTime(row.created_at)}</span>
        </button>

        {/* Inline actions — pending only */}
        {isPending && (
          <div className="flex gap-2 pt-3 border-t border-white/5">
            <button
              onClick={() => onReject(row)}
              className="flex-1 py-2.5 rounded-xl border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/10 active:scale-[0.98] transition"
            >
              ✕ Reject
            </button>
            <button
              onClick={() => onApprove(row)}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold active:scale-[0.98] transition"
            >
              ✓ Approve {formatINR(row.amount)}
            </button>
          </div>
        )}

        {/* View details link for reviewed */}
        {!isPending && (
          <button
            onClick={() => onDetail(row)}
            className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-[10px] font-bold tracking-wider hover:text-white transition"
          >
            VIEW DETAILS →
          </button>
        )}
      </div>
    </div>
  )
}

// ================= DETAIL MODAL =================

function RechargeDetailModal({
  row, onClose, onApprove, onReject,
}: {
  row: RechargeRow
  onClose: () => void
  onApprove: () => void
  onReject: () => void
}) {
  const isPending = row.status === 'pending'
  const isApproved = row.status === 'approved'
  const isRejected = row.status === 'rejected'

  const borderClass = isPending
    ? 'border-amber-500/40'
    : isApproved
    ? 'border-green-500/40'
    : 'border-red-500/40'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border-2 bg-neutral-950 p-5 ${borderClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-base">📝</span>
            <span className="text-[10px] font-black tracking-widest text-gray-400">
              RECHARGE NOTE
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400 text-lg"
          >
            ✕
          </button>
        </div>

        {/* Status badge */}
        <div className="text-center mb-4">
          <span
            className={`inline-block text-[10px] font-black tracking-widest px-3 py-1 rounded-full border ${
              isPending
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                : isApproved
                ? 'bg-green-500/10 border-green-500/40 text-green-300'
                : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}
          >
            {isPending ? '🟡 PENDING' : isApproved ? '🟢 APPROVED' : '🔴 REJECTED'}
          </span>
        </div>

        {/* Person — big */}
        <div className="flex flex-col items-center mb-5">
          {row.profile?.avatar_url ? (
            <img
              src={row.profile.avatar_url}
              alt=""
              className="w-16 h-16 rounded-full border-2 border-cyan-500/30 mb-2"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-xl font-bold mb-2">
              {(row.profile?.full_name ?? row.profile?.email ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-base font-bold text-white text-center">
            {row.profile?.full_name ?? '—'}
          </div>
          <div className="text-xs text-gray-500 text-center">
            {row.profile?.email ?? ''}
          </div>
          {isPending && (
            <div className="text-[11px] text-amber-400 mt-1 italic">
              is requesting approval
            </div>
          )}
        </div>

        {/* Amount OR reason */}
        {isPending && (
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-transparent py-6 mb-4">
            <div className="text-center">
              <div className="text-[10px] font-black tracking-widest text-amber-400/80 mb-1">
                REQUESTED AMOUNT
              </div>
              <div className="text-5xl font-black text-white tabular-nums">
                {formatINR(row.amount)}
              </div>
            </div>
          </div>
        )}

        {isRejected && row.rejection_reason && (
          <div className="rounded-xl border-l-4 border-red-500 bg-red-500/10 px-4 py-4 mb-4">
            <div className="text-[10px] font-black tracking-widest text-red-400 mb-2">
              ❌ REJECTION REASON
            </div>
            <div className="text-lg font-black text-red-100 leading-snug">
              {row.rejection_reason}
            </div>
            {row.reviewed_at && (
              <div className="text-[10px] text-red-300/70 mt-2">
                Reviewed {formatDateTime(row.reviewed_at)}
              </div>
            )}
          </div>
        )}

        {isApproved && (
          <div className="rounded-xl border-l-4 border-green-500 bg-green-500/10 px-4 py-4 mb-4">
            <div className="text-[10px] font-black tracking-widest text-green-400 mb-2">
              ✓ CREDITED TO WALLET
            </div>
            <div className="text-3xl font-black text-green-100 tabular-nums">
              {formatINR(row.amount)}
            </div>
            {row.reviewed_at && (
              <div className="text-[10px] text-green-300/70 mt-2">
                Approved {formatDateTime(row.reviewed_at)}
              </div>
            )}
          </div>
        )}

        {/* Payment details */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4 space-y-3">
          <div className="text-[10px] text-gray-500 tracking-wider font-bold">
            PAYMENT DETAILS
          </div>
          <DetailRow label="UTR / Reference" value={row.upi_ref} mono />
          {row.upi_app && <DetailRow label="UPI App" value={row.upi_app} />}
          <DetailRow label="Submitted" value={formatDateTime(row.created_at)} />
          {row.reviewed_at && (
            <DetailRow label="Reviewed" value={formatDateTime(row.reviewed_at)} />
          )}
        </div>

        {/* Screenshot */}
        {row.screenshot_url ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
            <div className="text-[10px] text-gray-500 tracking-wider font-bold mb-3">
              SCREENSHOT
            </div>
            <a href={row.screenshot_url} target="_blank" rel="noreferrer" className="block">
              <img
                src={row.screenshot_url}
                alt="Payment screenshot"
                className="w-full rounded-lg border border-cyan-500/30 max-h-80 object-contain bg-black"
              />
            </a>
            <a
              href={row.screenshot_url}
              target="_blank"
              rel="noreferrer"
              className="block mt-2 text-center text-xs text-cyan-400 font-bold tracking-wider"
            >
              Open Full Size →
            </a>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4 text-center">
            <div className="text-[10px] text-gray-500 tracking-wider font-bold mb-1">
              SCREENSHOT
            </div>
            <div className="text-xs text-gray-500 italic">Not uploaded</div>
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div className="flex gap-2 mt-4">
            <button
              onClick={onReject}
              className="flex-1 py-3 rounded-xl border border-red-500/40 text-red-300 text-sm font-bold hover:bg-red-500/10 transition"
            >
              ✕ Reject
            </button>
            <button
              onClick={onApprove}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 text-white text-sm font-bold"
            >
              ✓ Approve {formatINR(row.amount)}
            </button>
          </div>
        )}

        {!isPending && (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-bold text-sm"
          >
            Close
          </button>
        )}
      </div>
    </div>
  )
}

// ================= DETAIL ROW =================

function DetailRow({
  label, value, mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-white text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ================= LEDGER TAB =================

function LedgerTab({ rows }: { rows: TxnRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((t) => (
        <div
          key={t.id}
          className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/10 rounded-xl p-3"
        >
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-bold truncate">
                {t.profile?.full_name ?? t.profile?.email ?? '—'}
              </div>
              <div className="text-xs text-gray-400 truncate">
                {t.reason_short ?? t.source}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {formatDateTime(t.created_at)} • {t.source}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={`font-mono font-bold ${
                  t.type === 'credit' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {formatSigned(t.amount, t.type)}
              </div>
              <div className="text-[10px] text-gray-500 font-mono">
                bal: {formatINR(t.balance_after)}
              </div>
            </div>
          </div>
        </div>
      ))}

      {rows.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📒</div>
          <p className="text-gray-400 text-sm">No transactions yet</p>
        </div>
      )}
    </div>
  )
}

// ================= BALANCES TAB =================

function BalancesTab({ rows }: { rows: BalanceRow[] }) {
  const total = rows.reduce((s, r) => s + Number(r.wallet_balance), 0)
  const totalCredit = rows.reduce((s, r) => s + Number(r.time_credit_min), 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
          <div className="text-[10px] text-cyan-300 tracking-wider font-bold">
            TOTAL OUTSTANDING
          </div>
          <div className="text-xl font-black text-white mt-1">{formatINR(total)}</div>
        </div>
        <div className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-3">
          <div className="text-[10px] text-pink-300 tracking-wider font-bold">
            TIME CREDIT (min)
          </div>
          <div className="text-xl font-black text-white mt-1">{totalCredit}</div>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/10 rounded-xl p-3 flex items-center gap-3"
          >
            {r.avatar_url ? (
              <img src={r.avatar_url} alt="" className="w-9 h-9 rounded-full" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-xs font-bold">
                {(r.full_name ?? r.email ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-bold truncate">
                {r.full_name ?? r.email ?? '—'}
              </div>
              {r.time_credit_min > 0 && (
                <div className="text-[10px] text-pink-400">
                  ⏱ {r.time_credit_min} min credit
                </div>
              )}
            </div>
            <div className="font-mono font-bold text-cyan-400">
              {formatINR(Number(r.wallet_balance))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ================= ADJUST TAB =================

function AdjustTab({
  balances, adjust, setAdjust, busy, onSubmit,
}: {
  balances: BalanceRow[]
  adjust: { userId: string; amount: number; type: 'credit' | 'debit'; reason: string }
  setAdjust: (v: typeof adjust) => void
  busy: boolean
  onSubmit: () => void
}) {
  return (
    <div className="max-w-lg space-y-4">
      <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200">
        ⓘ Manual adjustments are logged permanently. Always include a reason.
      </div>

      <div>
        <label className="text-[10px] text-gray-500 tracking-wider">CUSTOMER</label>
        <select
          value={adjust.userId}
          onChange={(e) => setAdjust({ ...adjust, userId: e.target.value })}
          className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
        >
          <option value="">— Select —</option>
          {balances.map((b) => (
            <option key={b.id} value={b.id}>
              {b.full_name ?? b.email} ({formatINR(Number(b.wallet_balance))})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 tracking-wider">TYPE</label>
          <select
            value={adjust.type}
            onChange={(e) => setAdjust({ ...adjust, type: e.target.value as any })}
            className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
          >
            <option value="credit">Credit (+)</option>
            <option value="debit">Debit (−)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-500 tracking-wider">AMOUNT ₹</label>
          <input
            type="number"
            min={1}
            value={adjust.amount}
            onChange={(e) => setAdjust({ ...adjust, amount: Number(e.target.value) || 0 })}
            className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-gray-500 tracking-wider">REASON *</label>
        <textarea
          value={adjust.reason}
          onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
          rows={3}
          placeholder="Compensation for 17 Oct session issue"
          className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={busy || !adjust.userId || !adjust.reason.trim()}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold disabled:opacity-50"
      >
        {busy ? 'Saving...' : `Apply ${adjust.type === 'credit' ? '+' : '−'}${formatINR(adjust.amount)}`}
      </button>
    </div>
  )
}