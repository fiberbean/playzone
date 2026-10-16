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
import { HoverZoom } from '@/components/HoverZoom'

type Tab = 'recharge' | 'transactions' | 'ledger' | 'adjust'
type RechargeSubTab = 'pending' | 'history'

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

type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom' | 'all'

// ============ HELPER: Date range ============
function getDateRange(
  preset: DatePreset,
  customFrom: string,
  customTo: string
): { from: number; to: number } | null {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (preset === 'all') return null
  if (preset === 'today') return { from: startOfToday.getTime(), to: Date.now() }
  if (preset === 'yesterday') {
    const y = new Date(startOfToday)
    y.setDate(y.getDate() - 1)
    const yEnd = new Date(startOfToday.getTime() - 1)
    return { from: y.getTime(), to: yEnd.getTime() }
  }
  if (preset === '7d') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 7)
    return { from: from.getTime(), to: Date.now() }
  }
  if (preset === '30d') {
    const from = new Date(startOfToday)
    from.setDate(from.getDate() - 30)
    return { from: from.getTime(), to: Date.now() }
  }
  if (preset === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: from.getTime(), to: Date.now() }
  }
  if (preset === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom + 'T00:00:00').getTime()
    const to = new Date(customTo + 'T23:59:59').getTime()
    return { from, to }
  }
  return null
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
        .limit(200),
      supabase
        .from('wallet_transactions')
        .select(`
          id, user_id, type, amount, balance_after, source,
          reason_short, booking_id, created_at,
          profile:profiles!wallet_transactions_user_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false })
        .limit(500),
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

  const todayCredits = useMemo(() => {
    const today = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const ist = new Date(today.getTime() + istOffset + today.getTimezoneOffset() * 60 * 1000)
    const todayISO = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`

    return txns
      .filter((t) => {
        if (t.type !== 'credit') return false
        const d = new Date(t.created_at)
        const istD = new Date(d.getTime() + istOffset + d.getTimezoneOffset() * 60 * 1000)
        const iso = `${istD.getFullYear()}-${String(istD.getMonth() + 1).padStart(2, '0')}-${String(istD.getDate()).padStart(2, '0')}`
        return iso === todayISO
      })
      .reduce((s, t) => s + Number(t.amount), 0)
  }, [txns])

  const totalOutstanding = useMemo(
    () => balances.reduce((s, b) => s + Number(b.wallet_balance), 0),
    [balances]
  )

  const totalTimeCredit = useMemo(
    () => balances.reduce((s, b) => s + Number(b.time_credit_min), 0),
    [balances]
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
    if (!adjust.userId) return toast.error('Select a customer')
    if (!adjust.reason.trim()) return toast.error('Reason is required')
    if (adjust.amount <= 0) return toast.error('Amount must be positive')

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
    { key: 'transactions', label: 'Transactions' },
    { key: 'ledger', label: 'Ledger' },
    { key: 'adjust', label: 'Adjust' },
  ]

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          WALLET
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          RECHARGES • TRANSACTIONS • LEDGER • ADJUST
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <KpiCard label="PENDING" value={pendingRecharges.length.toString()} sub="Requests" accent="amber" icon="🟡" />
        <KpiCard label="TODAY CREDITS" value={formatINR(todayCredits)} sub="Wallet top-ups" accent="green" icon="📥" />
        <KpiCard label="OUTSTANDING" value={formatINR(totalOutstanding)} sub="All customers" accent="cyan" icon="💰" />
        <KpiCard label="TIME CREDIT" value={`${totalTimeCredit}m`} sub="Total unused" accent="pink" icon="⏱" />
      </div>

      {/* Tabs */}
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
          {tab === 'transactions' && <TransactionsTab rows={txns} balances={balances} />}
          {tab === 'ledger' && <LedgerTab rows={txns} balances={balances} />}
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

      {/* Reject modal */}
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

// ================= KPI CARD =================

function KpiCard({
  label, value, sub, accent, icon,
}: {
  label: string
  value: string
  sub: string
  accent: 'cyan' | 'green' | 'amber' | 'pink'
  icon: string
}) {
  const styles = {
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
    green: 'border-green-500/30 bg-green-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    pink: 'border-pink-500/30 bg-pink-500/5',
  }[accent]

  return (
    <div className={`rounded-xl border ${styles} p-3`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-black tracking-widest text-gray-400">{label}</span>
        <span className="text-sm">{icon}</span>
      </div>
      <div className="text-base sm:text-xl font-black text-white tabular-nums truncate">{value}</div>
      <div className="text-[10px] text-gray-500 truncate">{sub}</div>
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
  const [subTab, setSubTab] = useState<RechargeSubTab>('pending')
  const [search, setSearch] = useState('')

  const pending = rows.filter((r) => r.status === 'pending')
  const history = rows.filter((r) => r.status !== 'pending')

  const filtered = useMemo(() => {
    const base = subTab === 'pending' ? pending : history
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter((r) =>
      (r.profile?.full_name ?? '').toLowerCase().includes(q) ||
      (r.profile?.email ?? '').toLowerCase().includes(q) ||
      r.upi_ref.toLowerCase().includes(q) ||
      (r.rejection_reason ?? '').toLowerCase().includes(q)
    )
  }, [subTab, pending, history, search])

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setSubTab('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider border transition ${
            subTab === 'pending'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : 'bg-white/5 border-white/10 text-gray-400'
          }`}
        >
          🟡 PENDING ({pending.length})
        </button>
        <button
          onClick={() => setSubTab('history')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider border transition ${
            subTab === 'history'
              ? 'bg-gray-500/10 border-gray-500/40 text-gray-300'
              : 'bg-white/5 border-white/10 text-gray-400'
          }`}
        >
          📜 HISTORY ({history.length})
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, UTR…"
          className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">{subTab === 'pending' ? '🎮' : '📜'}</div>
          <p className="text-gray-400 text-sm font-bold">
            {subTab === 'pending' ? 'All caught up!' : 'No history yet'}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            {subTab === 'pending'
              ? 'No pending recharge requests'
              : 'Approved and rejected requests will appear here'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <PersonNote
              key={r.id}
              row={r}
              onApprove={onApprove}
              onReject={onReject}
              onDetail={onDetail}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ================= PERSON NOTE CARD =================

function PersonNote({
  row, onApprove, onReject, onDetail,
}: {
  row: RechargeRow
  onApprove: (row: RechargeRow) => void
  onReject: (row: RechargeRow) => void
  onDetail: (row: RechargeRow) => void
}) {
  const isPending = row.status === 'pending'
  const isApproved = row.status === 'approved'
  const isRejected = row.status === 'rejected'

  const cardClass = isPending
    ? 'border-amber-500/40 bg-gradient-to-b from-amber-500/[0.06] to-transparent'
    : isApproved
    ? 'border-green-500/30 bg-gradient-to-b from-green-500/[0.06] to-transparent'
    : 'border-red-500/40 bg-gradient-to-b from-red-500/[0.06] to-transparent'

  const badgeClass = isPending
    ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
    : isApproved
    ? 'bg-green-500/10 border-green-500/40 text-green-300'
    : 'bg-red-500/10 border-red-500/40 text-red-300'

  const displayName = row.profile?.full_name ?? row.profile?.email ?? '—'

  return (
    <div
      onClick={() => onDetail(row)}
      className={`group rounded-2xl border-2 overflow-hidden transition cursor-pointer hover:scale-[1.005] active:scale-[0.995] ${cardClass}`}
    >
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

      <div className="p-5">
        <div className="flex items-center gap-3 mb-5">
          {row.profile?.avatar_url ? (
            <img
              src={row.profile.avatar_url}
              alt=""
              className="w-11 h-11 rounded-full border border-cyan-500/30 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-sm font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition">
              {displayName}
            </div>
            <div className="text-[11px] text-gray-500 truncate italic">
              {isPending
                ? 'is requesting approval'
                : isApproved
                ? 'recharge approved'
                : 'recharge rejected'}
            </div>
          </div>
        </div>

        {isPending && (
          <div className="relative flex justify-center items-center my-6">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
              <div
                className="w-40 h-20 rounded-full blur-2xl opacity-60 buddy-amount-glow"
                style={{
                  background: 'radial-gradient(circle, rgba(251,191,36,0.7) 0%, rgba(251,191,36,0) 70%)',
                }}
              />
            </div>
            <span className="absolute -left-1 top-2 text-amber-300 text-lg buddy-sparkle-float" aria-hidden>✨</span>
            <span className="absolute right-0 bottom-2 text-amber-300 text-lg buddy-sparkle-float-delay" aria-hidden>✨</span>
            <div
              className="relative text-5xl font-black tabular-nums buddy-amount-pulse"
              style={{
                color: '#fbbf24',
                textShadow: '0 0 8px rgba(251,191,36,0.9), 0 0 20px rgba(251,191,36,0.6), 0 0 40px rgba(251,191,36,0.35)',
                letterSpacing: '-0.02em',
              }}
            >
              {formatINR(row.amount)}
            </div>
          </div>
        )}

        {isApproved && (
          <div className="relative flex justify-center items-center my-6">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden>
              <div
                className="w-40 h-20 rounded-full blur-2xl opacity-50"
                style={{
                  background: 'radial-gradient(circle, rgba(52,211,153,0.7) 0%, rgba(52,211,153,0) 70%)',
                }}
              />
            </div>
            <div
              className="relative text-5xl font-black tabular-nums"
              style={{
                color: '#34d399',
                textShadow: '0 0 8px rgba(52,211,153,0.9), 0 0 20px rgba(52,211,153,0.5)',
                letterSpacing: '-0.02em',
              }}
            >
              {formatINR(row.amount)}
            </div>
          </div>
        )}

        {isRejected && row.rejection_reason && (
          <div className="rounded-xl border-l-4 border-red-500 bg-red-500/10 px-4 py-3 mb-4">
            <div className="text-[10px] font-black tracking-widest text-red-400 mb-1">
              ❌ REASON
            </div>
            <div className="text-base font-black text-red-100 leading-snug">
              {row.rejection_reason}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-gray-500 mb-3">
          <span className="font-mono truncate">
            UTR: {row.upi_ref}
            {row.upi_app && <span className="ml-1.5 text-cyan-400">• {row.upi_app}</span>}
          </span>
          <span className="shrink-0 ml-2">{formatDateTime(row.created_at)}</span>
        </div>

        {isPending && (
          <div className="flex gap-2 pt-3 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
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

        {!isPending && (
          <div className="w-full py-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 text-[10px] font-bold tracking-wider text-center group-hover:text-white transition">
            VIEW DETAILS →
          </div>
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

        {/* Screenshot with HoverZoom magnifier */}
        {row.screenshot_url ? (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
            <div className="text-[10px] text-gray-500 tracking-wider font-bold mb-3 flex items-center justify-between">
              <span>SCREENSHOT</span>
              <span className="text-[9px] text-cyan-400 font-bold tracking-wider">
                🔍 HOVER TO MAGNIFY
              </span>
            </div>
            <div className="rounded-lg overflow-hidden border border-cyan-500/30 bg-black">
              <HoverZoom
                src={row.screenshot_url}
                alt="Payment screenshot"
                zoomLevel={4}
                previewSize={240}
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4 text-center">
            <div className="text-[10px] text-gray-500 tracking-wider font-bold mb-1">
              SCREENSHOT
            </div>
            <div className="text-xs text-gray-500 italic">Not uploaded</div>
          </div>
        )}

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

// ================= TRANSACTIONS TAB =================

function TransactionsTab({
  rows, balances,
}: {
  rows: TxnRow[]
  balances: BalanceRow[]
}) {
  const [userFilter, setUserFilter] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  const sourceOptions = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => set.add(r.source))
    return Array.from(set).sort()
  }, [rows])

  const filtered = useMemo(() => {
    let out = [...rows]

    if (userFilter) out = out.filter((r) => r.user_id === userFilter)
    if (sourceFilter) out = out.filter((r) => r.source === sourceFilter)
    if (typeFilter) out = out.filter((r) => r.type === typeFilter)

    const range = getDateRange(datePreset, customFrom, customTo)
    if (range) {
      out = out.filter((r) => {
        const t = new Date(r.created_at).getTime()
        return t >= range.from && t <= range.to
      })
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter((r) =>
        (r.profile?.full_name ?? '').toLowerCase().includes(q) ||
        (r.profile?.email ?? '').toLowerCase().includes(q) ||
        (r.reason_short ?? '').toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q)
      )
    }

    return out
  }, [rows, userFilter, sourceFilter, typeFilter, datePreset, customFrom, customTo, search])

  const totals = useMemo(() => {
    const credit = filtered.filter((r) => r.type === 'credit').reduce((s, r) => s + Number(r.amount), 0)
    const debit = filtered.filter((r) => r.type === 'debit').reduce((s, r) => s + Number(r.amount), 0)
    return { credit, debit, net: credit - debit }
  }, [filtered])

  const handleExport = () => {
    const csv = [
      ['Date', 'Customer', 'Email', 'Type', 'Amount', 'Balance After', 'Source', 'Reason'].join(','),
      ...filtered.map((r) => [
        new Date(r.created_at).toISOString(),
        `"${r.profile?.full_name ?? ''}"`,
        `"${r.profile?.email ?? ''}"`,
        r.type,
        r.amount,
        r.balance_after,
        r.source,
        `"${(r.reason_short ?? '').replace(/"/g, '""')}"`,
      ].join(',')),
    ].join('\n')
    downloadCSV(csv, `transactions-${Date.now()}.csv`)
  }

  return (
    <div>
      <FilterBar
        userFilter={userFilter} setUserFilter={setUserFilter}
        datePreset={datePreset} setDatePreset={setDatePreset}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        search={search} setSearch={setSearch}
        balances={balances}
        onExport={handleExport}
        extraFilters={
          <>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">🏷️ ALL SOURCES</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="">💠 ALL TYPES</option>
              <option value="credit">🟢 CREDIT</option>
              <option value="debit">🔴 DEBIT</option>
            </select>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2 text-center">
          <div className="text-[9px] tracking-widest text-green-300 font-bold">CREDITS</div>
          <div className="text-sm font-black text-green-100">{formatINR(totals.credit)}</div>
        </div>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-center">
          <div className="text-[9px] tracking-widest text-red-300 font-bold">DEBITS</div>
          <div className="text-sm font-black text-red-100">{formatINR(totals.debit)}</div>
        </div>
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2 text-center">
          <div className="text-[9px] tracking-widest text-cyan-300 font-bold">NET</div>
          <div className={`text-sm font-black ${totals.net >= 0 ? 'text-cyan-100' : 'text-amber-200'}`}>
            {formatSigned(Math.abs(totals.net), totals.net >= 0 ? 'credit' : 'debit')}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-gray-400 text-sm">No transactions match filters</p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_100px_100px_100px_120px] gap-2 px-3 py-2 bg-white/5 text-[10px] font-black tracking-wider text-gray-500">
            <div>CUSTOMER</div>
            <div className="text-right">AMOUNT</div>
            <div className="text-right">BALANCE</div>
            <div>SOURCE</div>
            <div>DATE</div>
          </div>

          <div className="divide-y divide-white/5">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_100px_100px_120px] gap-2 px-3 py-3 hover:bg-white/[0.02] transition"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {r.profile?.full_name ?? r.profile?.email ?? '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate">
                    {r.reason_short ?? r.source}
                  </div>
                </div>
                <div className={`text-xs font-mono font-bold text-right ${
                  r.type === 'credit' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatSigned(r.amount, r.type)}
                </div>
                <div className="text-xs font-mono text-gray-400 text-right">
                  {formatINR(r.balance_after)}
                </div>
                <div className="text-[10px] text-cyan-400 font-bold tracking-wide uppercase">
                  {r.source.replace(/_/g, ' ')}
                </div>
                <div className="text-[10px] text-gray-500 sm:text-right">
                  {formatDateTime(r.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ================= FILTER BAR =================

function FilterBar({
  userFilter, setUserFilter,
  datePreset, setDatePreset,
  customFrom, setCustomFrom,
  customTo, setCustomTo,
  search, setSearch,
  balances,
  extraFilters,
  onExport,
}: {
  userFilter: string
  setUserFilter: (v: string) => void
  datePreset: DatePreset
  setDatePreset: (v: DatePreset) => void
  customFrom: string
  setCustomFrom: (v: string) => void
  customTo: string
  setCustomTo: (v: string) => void
  search: string
  setSearch: (v: string) => void
  balances: BalanceRow[]
  extraFilters?: React.ReactNode
  onExport?: () => void
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="">👤 ALL USERS</option>
          {balances.map((b) => (
            <option key={b.id} value={b.id}>
              {b.full_name ?? b.email}
            </option>
          ))}
        </select>

        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none"
        >
          <option value="all">📅 ALL TIME</option>
          <option value="today">📅 TODAY</option>
          <option value="yesterday">📅 YESTERDAY</option>
          <option value="7d">📅 LAST 7 DAYS</option>
          <option value="30d">📅 LAST 30 DAYS</option>
          <option value="month">📅 THIS MONTH</option>
          <option value="custom">📅 CUSTOM</option>
        </select>

        {datePreset === 'custom' && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-gray-500 text-xs">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
            />
          </>
        )}

        {extraFilters}
        <div className="flex-1" />

        {onExport && (
          <button
            onClick={onExport}
            className="px-3 py-2 rounded-lg border border-green-500/40 bg-green-500/5 text-green-300 text-xs font-bold tracking-wider hover:bg-green-500/10 transition"
          >
            ⬇ CSV
          </button>
        )}
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">🔍</span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, UTR, reason…"
          className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
        />
      </div>
    </div>
  )
}

// ================= LEDGER TAB =================

function LedgerTab({
  rows, balances,
}: {
  rows: TxnRow[]
  balances: BalanceRow[]
}) {
  const [selectedUser, setSelectedUser] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const user = balances.find((b) => b.id === selectedUser)

  const filtered = useMemo(() => {
    if (!selectedUser) return []
    let out = rows.filter((r) => r.user_id === selectedUser)

    const range = getDateRange(datePreset, customFrom, customTo)
    if (range) {
      out = out.filter((r) => {
        const t = new Date(r.created_at).getTime()
        return t >= range.from && t <= range.to
      })
    }

    return out
  }, [rows, selectedUser, datePreset, customFrom, customTo])

  const totals = useMemo(() => {
    const credit = filtered.filter((r) => r.type === 'credit').reduce((s, r) => s + Number(r.amount), 0)
    const debit = filtered.filter((r) => r.type === 'debit').reduce((s, r) => s + Number(r.amount), 0)
    return { credit, debit, net: credit - debit }
  }, [filtered])

  const handleExport = () => {
    if (!user) return
    const csv = [
      ['Date', 'Type', 'Amount', 'Balance After', 'Source', 'Reason'].join(','),
      ...filtered.map((r) => [
        new Date(r.created_at).toISOString(),
        r.type,
        r.amount,
        r.balance_after,
        r.source,
        `"${(r.reason_short ?? '').replace(/"/g, '""')}"`,
      ].join(',')),
    ].join('\n')
    downloadCSV(csv, `statement-${user.full_name ?? user.email}-${Date.now()}.csv`)
  }

  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none min-w-[200px]"
          >
            <option value="">👤 SELECT CUSTOMER</option>
            {balances.map((b) => (
              <option key={b.id} value={b.id}>
                {b.full_name ?? b.email} (₹{b.wallet_balance})
              </option>
            ))}
          </select>

          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs font-bold tracking-wider text-gray-300 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">📅 ALL TIME</option>
            <option value="today">📅 TODAY</option>
            <option value="yesterday">📅 YESTERDAY</option>
            <option value="7d">📅 LAST 7 DAYS</option>
            <option value="30d">📅 LAST 30 DAYS</option>
            <option value="month">📅 THIS MONTH</option>
            <option value="custom">📅 CUSTOM</option>
          </select>

          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-gray-300"
              />
              <span className="text-gray-500 text-xs">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-xs text-gray-300"
              />
            </>
          )}

          <div className="flex-1" />

          {selectedUser && (
            <button
              onClick={handleExport}
              className="px-3 py-2 rounded-lg border border-green-500/40 bg-green-500/5 text-green-300 text-xs font-bold tracking-wider hover:bg-green-500/10 transition"
            >
              ⬇ CSV
            </button>
          )}
        </div>
      </div>

      {!selectedUser ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📒</div>
          <p className="text-gray-400 text-sm font-bold">Select a customer</p>
          <p className="text-gray-600 text-xs mt-1">Their full statement will appear here</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-12 h-12 rounded-full border border-cyan-500/30" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-base font-bold">
                  {(user?.full_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">
                  {user?.full_name ?? '—'}
                </div>
                <div className="text-xs text-gray-500 truncate">{user?.email ?? ''}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-black/30 border border-white/5 p-2">
                <div className="text-[9px] tracking-widest text-gray-500 font-bold">BALANCE</div>
                <div className="text-sm font-black text-cyan-300 tabular-nums">
                  {formatINR(Number(user?.wallet_balance ?? 0))}
                </div>
              </div>
              <div className="rounded-lg bg-black/30 border border-white/5 p-2">
                <div className="text-[9px] tracking-widest text-gray-500 font-bold">TIME CR.</div>
                <div className="text-sm font-black text-pink-300 tabular-nums">
                  {user?.time_credit_min ?? 0}m
                </div>
              </div>
              <div className="rounded-lg bg-black/30 border border-white/5 p-2">
                <div className="text-[9px] tracking-widest text-gray-500 font-bold">TXN COUNT</div>
                <div className="text-sm font-black text-white tabular-nums">
                  {filtered.length}
                </div>
              </div>
            </div>

            {filtered.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="text-center">
                  <div className="text-[9px] tracking-widest text-green-400 font-bold">CREDIT</div>
                  <div className="text-xs font-mono font-bold text-green-300">
                    +{formatINR(totals.credit)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] tracking-widest text-red-400 font-bold">DEBIT</div>
                  <div className="text-xs font-mono font-bold text-red-300">
                    −{formatINR(totals.debit)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] tracking-widest text-cyan-400 font-bold">NET</div>
                  <div className={`text-xs font-mono font-bold ${totals.net >= 0 ? 'text-cyan-300' : 'text-amber-300'}`}>
                    {totals.net >= 0 ? '+' : '−'}{formatINR(Math.abs(totals.net))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No transactions in this range</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="rounded-xl border border-white/10 bg-white/[0.02] p-3 hover:border-cyan-500/30 transition"
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-gray-500 font-mono">
                        {formatDateTime(r.created_at)}
                      </div>
                      <div className="text-xs text-white font-bold mt-0.5">
                        {r.reason_short ?? r.source.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] text-cyan-400 font-bold tracking-wide uppercase mt-0.5">
                        {r.source.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-base font-mono font-black ${
                        r.type === 'credit' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatSigned(r.amount, r.type)}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        bal: {formatINR(r.balance_after)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
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