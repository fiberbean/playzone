// app/wallet/WalletClient.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatINR, formatSigned } from '@/lib/utils/money'
import { formatDateShort, formatDateTime, formatTime } from '@/lib/utils/time'
import { RechargeModal } from './RechargeModal'
import { toast } from '@/components/ui/Toast'

type Tab = 'transactions' | 'time_credit' | 'recharges'

type Txn = {
  id: string
  type: 'credit' | 'debit'
  amount: number
  balance_after: number
  source: string
  reason_short: string | null
  reason_long: string | null
  booking_id: string | null
  linked_txn_id: string | null
  metadata: any
  note: string | null
  created_at: string
}

type TCRow = {
  id: string
  type: 'earned' | 'used' | 'expired' | 'manual'
  minutes: number
  balance_after: number
  source: string | null
  note: string | null
  expires_at: string | null
  created_at: string
}

type RechargeRow = {
  id: string
  amount: number
  upi_ref: string
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  created_at: string
}

interface Props {
  walletBalance: number
  timeCredit: number
  txns: Txn[]
  timeCreditLog: TCRow[]
  rechargeHistory: RechargeRow[]
  settings: any
}

export function WalletClient({
  walletBalance: initialBalance,
  timeCredit: initialCredit,
  txns: initialTxns,
  timeCreditLog: initialTC,
  rechargeHistory: initialRecharges,
  settings,
}: Props) {
  const [tab, setTab] = useState<Tab>('transactions')
  const [balance, setBalance] = useState(initialBalance)
  const [credit, setCredit] = useState(initialCredit)
  const [txns, setTxns] = useState(initialTxns)
  const [tc, setTc] = useState(initialTC)
  const [recharges, setRecharges] = useState(initialRecharges)
  const [rechargeOpen, setRechargeOpen] = useState(false)
  const [selectedTxn, setSelectedTxn] = useState<Txn | null>(null)

  // Realtime updates
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`wallet-live-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions' },
        (payload) => {
          const row = payload.new as any
          if (row?.type) {
            if (row.type === 'credit') setBalance((b) => b + 0) // refresh below
            // Reload lightweight
            ;(async () => {
              const { data: profile } = await supabase
                .from('profiles').select('wallet_balance, time_credit_min')
                .single()
              if (profile) {
                setBalance(Number(profile.wallet_balance))
                setCredit(Number(profile.time_credit_min))
              }
              const { data } = await supabase
                .from('wallet_transactions')
                .select('id, type, amount, balance_after, source, reason_short, reason_long, booking_id, linked_txn_id, metadata, note, created_at')
                .order('created_at', { ascending: false })
                .limit(100)
              if (data) setTxns(data as any)
            })()
          }
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'time_credit_ledger' },
        () => {
          ;(async () => {
            const { data: profile } = await supabase
              .from('profiles').select('time_credit_min').single()
            if (profile) setCredit(Number(profile.time_credit_min))
            const { data } = await supabase
              .from('time_credit_ledger')
              .select('id, type, minutes, balance_after, source, note, expires_at, created_at')
              .order('created_at', { ascending: false })
              .limit(50)
            if (data) setTc(data as any)
          })()
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'recharge_requests' },
        () => {
          ;(async () => {
            const { data } = await supabase
              .from('recharge_requests')
              .select('id, amount, upi_ref, status, rejection_reason, created_at')
              .order('created_at', { ascending: false })
              .limit(20)
            if (data) setRecharges(data as any)
          })()
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            WALLET
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24">
        {/* Balance card */}
        <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-pink-500/5 p-5 mb-4">
          <div className="text-[10px] text-cyan-300 tracking-widest font-bold mb-1">
            WALLET BALANCE
          </div>
          <div className="text-4xl font-black text-white mb-3">
            {formatINR(balance)}
          </div>

          {credit > 0 && (
            <div className="rounded-xl bg-pink-500/10 border border-pink-500/30 p-3 mb-3">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-pink-300 tracking-widest font-bold">
                    ⏱ TIME CREDIT
                  </div>
                  <div className="text-xl font-bold text-white mt-0.5">
                    {credit} min
                  </div>
                </div>
                <div className="text-[10px] text-pink-200/70 text-right">
                  Auto-applied at
                  <br />
                  next booking
                </div>
              </div>
            </div>
          )}

          <button
            onClick={() => setRechargeOpen(true)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold tracking-wider"
          >
            + ADD MONEY
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <TabButton active={tab === 'transactions'} onClick={() => setTab('transactions')}>
            TRANSACTIONS
          </TabButton>
          <TabButton active={tab === 'time_credit'} onClick={() => setTab('time_credit')}>
            TIME CREDIT
          </TabButton>
          <TabButton active={tab === 'recharges'} onClick={() => setTab('recharges')}>
            RECHARGES
          </TabButton>
        </div>

        {/* Content */}
        {tab === 'transactions' && (
          <div className="space-y-2">
            {txns.length === 0 ? (
              <Empty title="No transactions yet" icon="📒" />
            ) : (
              txns.map((t) => (
                <TxnRow key={t.id} txn={t} onSelect={() => setSelectedTxn(t)} />
              ))
            )}
          </div>
        )}

        {tab === 'time_credit' && (
          <div className="space-y-2">
            {tc.length === 0 ? (
              <Empty title="No time credit activity" icon="⏱" />
            ) : (
              tc.map((r) => <TCRowView key={r.id} row={r} />)
            )}
          </div>
        )}

        {tab === 'recharges' && (
          <div className="space-y-2">
            {recharges.length === 0 ? (
              <Empty title="No recharges yet" icon="💳" />
            ) : (
              recharges.map((r) => <RechargeRowView key={r.id} row={r} />)
            )}
          </div>
        )}
      </main>

      <RechargeModal
  open={rechargeOpen}
  onClose={() => setRechargeOpen(false)}
  upiId={settings.zone_upi_id}
  payeeName={settings.zone_payee_name}
  zonePhone={settings.zone_phone}
/>

      {selectedTxn && (
        <TxnDrawer txn={selectedTxn} onClose={() => setSelectedTxn(null)} />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-[10px] font-bold tracking-wider border transition ${
        active
          ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
          : 'bg-white/5 border-white/10 text-gray-400'
      }`}
    >
      {children}
    </button>
  )
}

function TxnRow({ txn, onSelect }: { txn: Txn; onSelect: () => void }) {
  const isCredit = txn.type === 'credit'
  const isPending = txn.source === 'booking_reschedule_in' && false // placeholder
  return (
    <button
      onClick={onSelect}
      className="w-full text-left bg-[#12121a] border border-white/5 hover:border-cyan-500/40 rounded-xl p-3 flex items-center gap-3 transition"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        isCredit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
      }`}>
        {isCredit ? '↓' : '↑'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-bold truncate">
          {txn.reason_short ?? txn.source}
        </div>
        <div className="text-[10px] text-gray-500">
          {formatDateTime(txn.created_at)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
          {formatSigned(txn.amount, txn.type)}
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          bal {formatINR(txn.balance_after)}
        </div>
      </div>
      <span className="text-gray-600 text-lg shrink-0">›</span>
    </button>
  )
}

function TCRowView({ row }: { row: TCRow }) {
  const positive = row.type === 'earned' || row.type === 'manual'
  return (
    <div className="bg-[#12121a] border border-white/5 rounded-xl p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
        positive ? 'bg-pink-500/10 text-pink-400' : 'bg-gray-500/10 text-gray-400'
      }`}>
        ⏱
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white font-bold truncate">
          {row.note ?? row.source ?? row.type}
        </div>
        <div className="text-[10px] text-gray-500">
          {formatDateTime(row.created_at)}
          {row.expires_at && ` • expires ${formatDateShort(row.expires_at)}`}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-mono font-bold ${positive ? 'text-pink-400' : 'text-gray-400'}`}>
          {positive ? '+' : '−'}{Math.abs(row.minutes)}m
        </div>
        <div className="text-[10px] text-gray-500">
          bal {row.balance_after}m
        </div>
      </div>
    </div>
  )
}

function RechargeRowView({ row }: { row: RechargeRow }) {
  const color =
    row.status === 'pending' ? 'border-amber-500/30'
    : row.status === 'approved' ? 'border-green-500/30'
    : 'border-red-500/30'

  return (
    <div className={`bg-[#12121a] border rounded-xl p-3 ${color}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${
              row.status === 'pending' ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : row.status === 'approved' ? 'bg-green-500/10 border-green-500/40 text-green-300'
              : 'bg-red-500/10 border-red-500/40 text-red-300'
            }`}>
              {row.status.toUpperCase()}
            </span>
            <span className="text-white font-bold">{formatINR(row.amount)}</span>
          </div>
          <div className="text-[10px] text-gray-500 font-mono">
            UTR: {row.upi_ref}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {formatDateTime(row.created_at)}
          </div>
          {row.rejection_reason && (
            <div className="text-[11px] text-red-400 mt-1">
              Reason: {row.rejection_reason}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Empty({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-3">{icon}</div>
      <p className="text-gray-400 text-sm">{title}</p>
    </div>
  )
}

// ---------- Transaction detail drawer ----------

function TxnDrawer({ txn, onClose }: { txn: Txn; onClose: () => void }) {
  const isCredit = txn.type === 'credit'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-neutral-950 border border-cyan-500/30 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">←</button>
          <h2 className="text-sm font-bold tracking-wider text-gray-300">TRANSACTION</h2>
          <div className="w-6" />
        </div>

        {/* Big amount */}
        <div className="text-center mb-5">
          <div className={`text-4xl font-black mb-1 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
            {isCredit ? '+' : '−'}{formatINR(txn.amount)}
          </div>
          <div className="text-sm text-gray-300 font-bold">
            {txn.reason_short ?? txn.source}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          {txn.metadata?.rate && (
            <DetailRow
              label="Rate"
              value={`${formatINR(txn.metadata.rate)} / hr (${txn.metadata.rate_type ?? '—'})`}
            />
          )}

          {txn.metadata?.duration_min && (
            <DetailRow label="Duration" value={`${txn.metadata.duration_min} min`} />
          )}

          {txn.metadata?.original_amount && (
            <DetailRow label="Original Amount" value={formatINR(txn.metadata.original_amount)} />
          )}

          {txn.metadata?.fee_amount > 0 && (
            <DetailRow
              label={`Fee (${Math.round((txn.metadata.fee_pct ?? 0) * 100)}%)`}
              value={`−${formatINR(txn.metadata.fee_amount)}`}
              variant="fee"
            />
          )}

          {txn.metadata?.refund_amount && (
            <DetailRow label="Refunded" value={formatINR(txn.metadata.refund_amount)} variant="refund" />
          )}

          {txn.metadata?.upi_ref && (
            <DetailRow label="UTR" value={txn.metadata.upi_ref} mono />
          )}

          {txn.metadata?.upi_app && (
            <DetailRow label="UPI App" value={txn.metadata.upi_app} />
          )}

          {txn.metadata?.overrun_min > 0 && (
            <DetailRow label="Overrun" value={`+${txn.metadata.overrun_min} min`} variant="fee" />
          )}

          <div className="border-t border-neutral-800 pt-3">
            <DetailRow label="Balance Before" value={formatINR(txn.balance_after - (isCredit ? txn.amount : -txn.amount))} />
            <DetailRow
              label="Change"
              value={`${isCredit ? '+' : '−'}${formatINR(txn.amount)}`}
              variant={isCredit ? 'refund' : 'fee'}
            />
            <DetailRow label="Balance After" value={formatINR(txn.balance_after)} bold />
          </div>

          {txn.reason_long && (
            <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3 text-xs text-cyan-200">
              {txn.reason_long}
            </div>
          )}

          {txn.note && (
            <div className="rounded-lg bg-neutral-900 p-3 text-xs text-gray-300">
              Note: {txn.note}
            </div>
          )}

          <div className="border-t border-neutral-800 pt-3 space-y-1">
            <DetailRow label="Date" value={formatDateTime(txn.created_at)} />
            <DetailRow label="Txn ID" value={`#${txn.id.slice(0, 8)}`} mono />
            <DetailRow label="Source" value={txn.source} />
          </div>

          {txn.metadata?.screenshot_url && (
            <a
              href={txn.metadata.screenshot_url}
              target="_blank"
              rel="noreferrer"
              className="block text-center py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold"
            >
              📷 View Screenshot
            </a>
          )}

          {txn.booking_id && (
            <Link
              href="/bookings"
              className="block text-center py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-xs"
            >
              VIEW BOOKING
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({
  label, value, variant = 'default', bold, mono,
}: {
  label: string
  value: string
  variant?: 'default' | 'fee' | 'refund'
  bold?: boolean
  mono?: boolean
}) {
  const color =
    variant === 'fee' ? 'text-red-400'
    : variant === 'refund' ? 'text-green-400'
    : 'text-white'
  return (
    <div className="flex justify-between items-baseline gap-3 py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm text-right ${color} ${bold ? 'font-black' : ''} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}