// app/playzonemama/reports/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatINR } from '@/lib/utils/money'
import { formatDateShort, formatDateTime, formatTime } from '@/lib/utils/time'
import { todayIST, addDaysIST } from '@/lib/utils/time'

type ReportKey =
  | 'daily' | 'weekly' | 'monthly'
  | 'by_console' | 'by_game'
  | 'bookings' | 'cancels'
  | 'wallet' | 'recharges'
  | 'maintenance' | 'customers'

const REPORTS: { key: ReportKey; label: string; icon: string }[] = [
  { key: 'daily', label: 'Daily Closing', icon: '📅' },
  { key: 'weekly', label: 'Weekly Summary', icon: '📆' },
  { key: 'monthly', label: 'Monthly Summary', icon: '🗓️' },
  { key: 'by_console', label: 'By Console', icon: '🎮' },
  { key: 'by_game', label: 'By Game', icon: '🎯' },
  { key: 'bookings', label: 'Bookings', icon: '📋' },
  { key: 'cancels', label: 'Cancellations', icon: '❌' },
  { key: 'wallet', label: 'Wallet Activity', icon: '💰' },
  { key: 'recharges', label: 'Recharges', icon: '💳' },
  { key: 'maintenance', label: 'Maintenance', icon: '🔧' },
  { key: 'customers', label: 'Customers', icon: '👥' },
]

export default function ReportsPage() {
  const [active, setActive] = useState<ReportKey>('daily')
  const [date, setDate] = useState(todayIST())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReport()
  }, [active, date])

  const loadReport = async () => {
    setLoading(true)
    const supabase = createClient()
    const { start, end } = rangeFor(active, date)
    const startIso = start.toISOString()
    const endIso = end.toISOString()

    try {
      switch (active) {
        case 'daily':
        case 'weekly':
        case 'monthly':
          await loadCashReport(supabase, startIso, endIso)
          break
        case 'by_console':
          await loadByConsole(supabase, startIso, endIso)
          break
        case 'by_game':
          await loadByGame(supabase, startIso, endIso)
          break
        case 'bookings':
          await loadBookings(supabase, startIso, endIso)
          break
        case 'cancels':
          await loadCancels(supabase, startIso, endIso)
          break
        case 'wallet':
          await loadWalletActivity(supabase, startIso, endIso)
          break
        case 'recharges':
          await loadRecharges(supabase, startIso, endIso)
          break
        case 'maintenance':
          await loadMaintenance(supabase, startIso, endIso)
          break
        case 'customers':
          await loadCustomers(supabase)
          break
      }
    } catch (e) {
      console.error(e)
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const loadCashReport = async (supabase: any, startIso: string, endIso: string) => {
    // Recharges approved (cash in)
    const { data: rchs } = await supabase
      .from('recharge_requests')
      .select('amount, reviewed_at')
      .eq('status', 'approved')
      .gte('reviewed_at', startIso)
      .lt('reviewed_at', endIso)

    // Refunds paid (cash out: booking_cancel, booking_reschedule_out, refund)
    const { data: outs } = await supabase
      .from('wallet_transactions')
      .select('amount, source, created_at, reason_short')
      .in('source', ['booking_cancel', 'booking_reschedule_out', 'refund'])
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    // Wallet-only: booking_confirm, extra_time, overrun, booking_reschedule_in
    const { data: internal } = await supabase
      .from('wallet_transactions')
      .select('amount, source, created_at')
      .in('source', ['booking_confirm', 'extra_time', 'overrun', 'booking_reschedule_in'])
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    // Fees retained
    const { data: bookingFees } = await supabase
      .from('bookings')
      .select('cancellation_fee, reschedule_fee, updated_at')
      .gte('updated_at', startIso)
      .lt('updated_at', endIso)

    // UPI breakdown
    const { data: rchsWithApp } = await supabase
      .from('recharge_requests')
      .select('amount, upi_app')
      .eq('status', 'approved')
      .gte('reviewed_at', startIso)
      .lt('reviewed_at', endIso)

    const cashIn = sum(rchs, 'amount')
    const cashOut = sum(outs, 'amount')

    const upiBreakdown: Record<string, { total: number; count: number }> = {}
    for (const r of rchsWithApp ?? []) {
      const app = r.upi_app || 'Other'
      const cur = upiBreakdown[app] ?? { total: 0, count: 0 }
      cur.total += Number(r.amount)
      cur.count += 1
      upiBreakdown[app] = cur
    }

    const cancellationsFees = sum((bookingFees ?? []).map((b: any) => ({ cancellation_fee: b.cancellation_fee })), 'cancellation_fee')
    const rescheduleFees = sum((bookingFees ?? []).map((b: any) => ({ reschedule_fee: b.reschedule_fee })), 'reschedule_fee')

    const bookingCount = (internal ?? []).filter((x: any) => x.source === 'booking_confirm').length
    const extraTimeCount = (internal ?? []).filter((x: any) => x.source === 'extra_time').length

    setData({
      cashIn, cashOut, net: cashIn - cashOut,
      recharges: { total: cashIn, count: (rchs ?? []).length },
      refunds: { total: cashOut, count: (outs ?? []).length },
      internal: {
        bookings: sum((internal ?? []).filter((x: any) => x.source === 'booking_confirm'), 'amount'),
        bookingCount,
        extraTime: sum((internal ?? []).filter((x: any) => x.source === 'extra_time'), 'amount'),
        extraTimeCount,
      },
      fees: {
        cancellation: cancellationsFees,
        reschedule: rescheduleFees,
        total: cancellationsFees + rescheduleFees,
      },
      upiBreakdown,
    })
  }

  const loadByConsole = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('bookings')
      .select('amount, console:consoles(name, type)')
      .in('status', ['confirmed', 'active', 'completed'])
      .gte('slot_start', startIso)
      .lt('slot_start', endIso)

    const byConsole: Record<string, { name: string; type: string; total: number; count: number }> = {}
    for (const b of data ?? []) {
      const c = (b as any).console
      if (!c) continue
      const key = c.name
      const cur = byConsole[key] ?? { name: c.name, type: c.type, total: 0, count: 0 }
      cur.total += Number(b.amount)
      cur.count += 1
      byConsole[key] = cur
    }
    setData({ rows: Object.values(byConsole).sort((a, b) => b.total - a.total) })
  }

  const loadByGame = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('bookings')
      .select('amount, game:games(name, category)')
      .in('status', ['confirmed', 'active', 'completed'])
      .gte('slot_start', startIso)
      .lt('slot_start', endIso)

    const byGame: Record<string, { name: string; category: string; total: number; count: number }> = {}
    for (const b of data ?? []) {
      const g = (b as any).game
      if (!g) continue
      const key = g.name
      const cur = byGame[key] ?? { name: g.name, category: g.category, total: 0, count: 0 }
      cur.total += Number(b.amount)
      cur.count += 1
      byGame[key] = cur
    }
    setData({ rows: Object.values(byGame).sort((a, b) => b.total - a.total) })
  }

  const loadBookings = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, slot_start, slot_end, amount, status, players, rate_type,
        game:games(name),
        console:consoles(name),
        profile:profiles(full_name, email)
      `)
      .gte('slot_start', startIso)
      .lt('slot_start', endIso)
      .order('slot_start', { ascending: false })

    const counts = { total: data?.length ?? 0, completed: 0, cancelled: 0, no_show: 0, rescheduled: 0 }
    for (const b of data ?? []) {
      if (b.status === 'completed') counts.completed++
      else if (b.status === 'cancelled') counts.cancelled++
      else if (b.status === 'no_show') counts.no_show++
      else if (b.status === 'rescheduled') counts.rescheduled++
    }
    setData({ rows: data ?? [], counts })
  }

  const loadCancels = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, cancelled_at, amount, cancellation_fee, refund_amount, cancel_reason, status,
        game:games(name),
        console:consoles(name),
        profile:profiles(full_name, email)
      `)
      .in('status', ['cancelled', 'rescheduled'])
      .gte('cancelled_at', startIso)
      .lt('cancelled_at', endIso)
      .order('cancelled_at', { ascending: false })

    const cancels = (data ?? []).filter((b: any) => b.status === 'cancelled')
    const resches = (data ?? []).filter((b: any) => b.status === 'rescheduled')

    setData({
      rows: data ?? [],
      cancels: {
        count: cancels.length,
        fees: sum(cancels, 'cancellation_fee'),
        refunds: sum(cancels, 'refund_amount'),
      },
      resches: {
        count: resches.length,
        fees: sum(resches, 'reschedule_fee'),
        refunds: sum(resches, 'refund_amount'),
      },
    })
  }

  const loadWalletActivity = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('wallet_transactions')
      .select(`
        id, type, amount, source, reason_short, created_at,
        profile:profiles(full_name, email)
      `)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })

    const credits = (data ?? []).filter((t: any) => t.type === 'credit')
    const debits = (data ?? []).filter((t: any) => t.type === 'debit')

    setData({
      rows: data ?? [],
      totals: {
        credit: sum(credits, 'amount'),
        debit: sum(debits, 'amount'),
        creditCount: credits.length,
        debitCount: debits.length,
      },
    })
  }

  const loadRecharges = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('recharge_requests')
      .select('id, amount, upi_app, status, created_at, reviewed_at')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false })

    const approved = (data ?? []).filter((r: any) => r.status === 'approved')
    const pending = (data ?? []).filter((r: any) => r.status === 'pending')
    const rejected = (data ?? []).filter((r: any) => r.status === 'rejected')

    const byApp: Record<string, { total: number; count: number }> = {}
    for (const r of approved) {
      const app = r.upi_app || 'Other'
      const cur = byApp[app] ?? { total: 0, count: 0 }
      cur.total += Number(r.amount)
      cur.count++
      byApp[app] = cur
    }

    setData({
      approved: { count: approved.length, total: sum(approved, 'amount') },
      pending: { count: pending.length, total: sum(pending, 'amount') },
      rejected: { count: rejected.length },
      byApp,
      rows: data ?? [],
    })
  }

  const loadMaintenance = async (supabase: any, startIso: string, endIso: string) => {
    const { data } = await supabase
      .from('console_maintenance')
      .select(`
        id, reason, status, started_at, ended_at, cost, vendor,
        console:consoles(name, type)
      `)
      .gte('started_at', startIso)
      .lt('started_at', endIso)
      .order('started_at', { ascending: false })

    const byConsole: Record<string, { name: string; count: number; cost: number; days: number }> = {}
    const byReason: Record<string, { name: string; count: number; cost: number }> = {}

    for (const m of data ?? []) {
      const cname = (m as any).console?.name ?? '?'
      const cc = byConsole[cname] ?? { name: cname, count: 0, cost: 0, days: 0 }
      cc.count++
      cc.cost += Number(m.cost)
      if (m.ended_at) {
        const days = Math.max(1, Math.round((new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 86400000))
        cc.days += days
      }
      byConsole[cname] = cc

      const rc = byReason[m.reason] ?? { name: m.reason, count: 0, cost: 0 }
      rc.count++
      rc.cost += Number(m.cost)
      byReason[m.reason] = rc
    }

    setData({
      rows: data ?? [],
      totalCost: sum(data ?? [], 'cost'),
      totalCount: (data ?? []).length,
      byConsole: Object.values(byConsole).sort((a, b) => b.count - a.count),
      byReason: Object.values(byReason).sort((a, b) => b.count - a.count),
    })
  }

  const loadCustomers = async (supabase: any) => {
    const { data: customers } = await supabase
      .from('profiles')
      .select('id, full_name, email, avatar_url, wallet_balance, time_credit_min, created_at')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })

    const { data: bookings } = await supabase
      .from('bookings')
      .select('user_id, amount, status, slot_start')
      .in('status', ['confirmed', 'active', 'completed'])

    const bookingStats: Record<string, { count: number; spend: number; last: string | null }> = {}
    for (const b of bookings ?? []) {
      const cur = bookingStats[b.user_id] ?? { count: 0, spend: 0, last: null }
      cur.count++
      cur.spend += Number(b.amount)
      if (!cur.last || new Date(b.slot_start) > new Date(cur.last)) cur.last = b.slot_start
      bookingStats[b.user_id] = cur
    }

    const rows = (customers ?? []).map((c: any) => ({
      ...c,
      bookings: bookingStats[c.id]?.count ?? 0,
      spend: bookingStats[c.id]?.spend ?? 0,
      last: bookingStats[c.id]?.last ?? null,
    }))

    const now = Date.now()
    const activeWeek = rows.filter((r) => r.last && (now - new Date(r.last).getTime()) < 7 * 86400000).length

    setData({
      rows: rows.sort((a, b) => b.spend - a.spend),
      total: rows.length,
      activeWeek,
      topSpenders: rows.slice(0, 5),
    })
  }

  const exportCSV = () => {
    if (!data) return
    const rows = data.rows ?? []
    if (!rows.length) {
      alert('No rows to export')
      return
    }
    const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object')
    const csv = [
      keys.join(','),
      ...rows.map((r: any) => keys.map((k) => JSON.stringify(r[k] ?? '')).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${active}-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          REPORTS
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          {REPORTS.find((r) => r.key === active)?.label.toUpperCase()}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Sidebar */}
        <aside className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-1 md:pb-0">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setActive(r.key)}
              className={`shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold tracking-wider whitespace-nowrap border transition text-left ${
                active === r.key
                  ? 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white border-transparent'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <span>{r.icon}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="space-y-4">
          {active !== 'customers' && (
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm"
              />
              <button
                onClick={() => setDate(addDaysIST(date, -1))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs"
              >← Prev</button>
              <button
                onClick={() => setDate(addDaysIST(date, 1))}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs"
              >Next →</button>
              <button
                onClick={() => setDate(todayIST())}
                className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs"
              >Today</button>
            </div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
            </div>
          ) : !data ? (
            <Empty title="No data" />
          ) : (
            <>
              {active === 'daily' && <DailyView data={data} date={date} />}
              {active === 'weekly' && <SummaryView data={data} label="Weekly" />}
              {active === 'monthly' && <SummaryView data={data} label="Monthly" />}
              {active === 'by_console' && <SimpleList rows={data.rows} labelKey="name" subKey="type" />}
              {active === 'by_game' && <SimpleList rows={data.rows} labelKey="name" subKey="category" />}
              {active === 'bookings' && <BookingsView data={data} />}
              {active === 'cancels' && <CancelsView data={data} />}
              {active === 'wallet' && <WalletActivityView data={data} />}
              {active === 'recharges' && <RechargesView data={data} />}
              {active === 'maintenance' && <MaintenanceView data={data} />}
              {active === 'customers' && <CustomersView data={data} />}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={exportCSV}
              disabled={!data?.rows?.length}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold disabled:opacity-40"
            >⬇ Export CSV</button>
            <button
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold"
            >🖨 Print</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- Views ----------

function DailyView({ data, date }: { data: any; date: string }) {
  return (
    <div className="space-y-3">
      <Section title="💰 Cash In (UPI Received)" color="green">
        <KV label="Recharges approved" value={formatINR(data.recharges.total)} count={data.recharges.count} />
        <KVDivider />
        <KV label="Total In" value={formatINR(data.cashIn)} bold />
      </Section>

      <Section title="💸 Cash Out (Refunds Paid)" color="red">
        <KV label="Refunds" value={formatINR(data.refunds.total)} count={data.refunds.count} />
        <KVDivider />
        <KV label="Total Out" value={formatINR(data.cashOut)} bold />
      </Section>

      <Section title="📊 Net" color="cyan">
        <KV label="Net for the day" value={formatINR(data.net)} bold />
      </Section>

      <Section title="🎮 Wallet Moves (info)">
        <KV label="Bookings charged" value={formatINR(data.internal.bookings)} count={data.internal.bookingCount} />
        <KV label="Extra time" value={formatINR(data.internal.extraTime)} count={data.internal.extraTimeCount} />
      </Section>

      <Section title="❌ Fees Collected">
        <KV label="Cancellation fees" value={formatINR(data.fees.cancellation)} />
        <KV label="Reschedule fees" value={formatINR(data.fees.reschedule)} />
        <KVDivider />
        <KV label="Total fees kept" value={formatINR(data.fees.total)} bold />
      </Section>

      {Object.keys(data.upiBreakdown).length > 0 && (
        <Section title="🏦 UPI Breakdown">
          {Object.entries(data.upiBreakdown).map(([app, v]: any) => (
            <KV key={app} label={app} value={formatINR(v.total)} count={v.count} />
          ))}
        </Section>
      )}
    </div>
  )
}

function SummaryView({ data, label }: { data: any; label: string }) {
  return (
    <div className="space-y-3">
      <Section title={`${label} Summary`} color="cyan">
        <KV label="Total In" value={formatINR(data.cashIn)} />
        <KV label="Total Out" value={formatINR(data.cashOut)} />
        <KVDivider />
        <KV label="Net" value={formatINR(data.net)} bold />
        <KV label="Fees kept" value={formatINR(data.fees.total)} />
      </Section>
    </div>
  )
}

function SimpleList({ rows, labelKey, subKey }: { rows: any[]; labelKey: string; subKey: string }) {
  if (!rows?.length) return <Empty title="No data in this range" />
  const total = rows.reduce((s, r) => s + r.total, 0)
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r[labelKey]} className="rounded-xl border border-cyan-500/10 bg-[#12121a] p-3 flex justify-between items-center">
          <div>
            <div className="text-sm text-white font-bold">{r[labelKey]}</div>
            <div className="text-[11px] text-gray-500">
              {r[subKey] && `${r[subKey]} • `}{r.count} bookings
            </div>
          </div>
          <div className="font-mono text-cyan-400 font-bold">{formatINR(r.total)}</div>
        </div>
      ))}
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 flex justify-between">
        <span className="text-xs text-cyan-300 tracking-wider font-bold">TOTAL</span>
        <span className="font-mono font-bold text-white">{formatINR(total)}</span>
      </div>
    </div>
  )
}

function BookingsView({ data }: { data: any }) {
  const { rows, counts } = data
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Stat label="Total" value={counts.total} />
        <Stat label="Completed" value={counts.completed} color="green" />
        <Stat label="Cancelled" value={counts.cancelled} color="red" />
        <Stat label="No-show" value={counts.no_show} color="gray" />
        <Stat label="Resched" value={counts.rescheduled} color="purple" />
      </div>

      <div className="space-y-1.5">
        {rows.slice(0, 40).map((b: any) => (
          <div key={b.id} className="rounded-lg border border-cyan-500/10 bg-[#12121a] p-2.5 text-xs flex justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">
                {b.game?.name} • {b.console?.name}
              </div>
              <div className="text-gray-500 truncate">
                {b.profile?.full_name ?? b.profile?.email} • {formatDateShort(b.slot_start)}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-cyan-400 font-bold">{formatINR(b.amount)}</div>
              <div className="text-gray-500">{b.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CancelsView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Section title="Cancellations" color="red">
          <KV label="Count" value={String(data.cancels.count)} />
          <KV label="Fees collected" value={formatINR(data.cancels.fees)} />
          <KV label="Refunds paid" value={formatINR(data.cancels.refunds)} />
        </Section>
        <Section title="Reschedules" color="amber">
          <KV label="Count" value={String(data.resches.count)} />
          <KV label="Fees collected" value={formatINR(data.resches.fees)} />
          <KV label="Refunds paid" value={formatINR(data.resches.refunds)} />
        </Section>
      </div>

      <div className="space-y-1.5">
        {data.rows.slice(0, 30).map((b: any) => (
          <div key={b.id} className="rounded-lg border border-cyan-500/10 bg-[#12121a] p-2.5 text-xs flex justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">
                {b.game?.name} • {b.console?.name}
              </div>
              <div className="text-gray-500 truncate">
                {b.cancel_reason || '—'} • {b.profile?.full_name ?? b.profile?.email}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-red-400 font-bold">−{formatINR(b.cancellation_fee)}</div>
              <div className="text-gray-500">{b.status}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WalletActivityView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Section title="Credits" color="green">
          <KV label="Total" value={formatINR(data.totals.credit)} count={data.totals.creditCount} />
        </Section>
        <Section title="Debits" color="red">
          <KV label="Total" value={formatINR(data.totals.debit)} count={data.totals.debitCount} />
        </Section>
      </div>

      <div className="space-y-1.5">
        {data.rows.slice(0, 40).map((t: any) => (
          <div key={t.id} className="rounded-lg border border-cyan-500/10 bg-[#12121a] p-2.5 text-xs flex justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">
                {t.profile?.full_name ?? t.profile?.email}
              </div>
              <div className="text-gray-500 truncate">{t.reason_short ?? t.source}</div>
            </div>
            <div className={`text-right font-bold shrink-0 ${t.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
              {t.type === 'credit' ? '+' : '−'}{formatINR(t.amount)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function RechargesView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Section title="Approved" color="green">
          <KV label="Amount" value={formatINR(data.approved.total)} count={data.approved.count} />
        </Section>
        <Section title="Pending" color="amber">
          <KV label="Amount" value={formatINR(data.pending.total)} count={data.pending.count} />
        </Section>
        <Section title="Rejected" color="red">
          <KV label="Count" value={String(data.rejected.count)} />
        </Section>
      </div>

      {Object.keys(data.byApp).length > 0 && (
        <Section title="By UPI App">
          {Object.entries(data.byApp).map(([app, v]: any) => (
            <KV key={app} label={app} value={formatINR(v.total)} count={v.count} />
          ))}
        </Section>
      )}
    </div>
  )
}

function MaintenanceView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total Issues" value={data.totalCount} />
        <Stat label="Total Cost" value={formatINR(data.totalCost)} color="amber" />
      </div>

      {data.byConsole.length > 0 && (
        <Section title="By Console">
          {data.byConsole.map((c: any) => (
            <KV key={c.name} label={`${c.name} (${c.days}d)`} value={formatINR(c.cost)} count={c.count} />
          ))}
        </Section>
      )}

      {data.byReason.length > 0 && (
        <Section title="By Reason">
          {data.byReason.map((r: any) => (
            <KV key={r.name} label={r.name} value={formatINR(r.cost)} count={r.count} />
          ))}
        </Section>
      )}
    </div>
  )
}

function CustomersView({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total Customers" value={data.total} />
        <Stat label="Active (7d)" value={data.activeWeek} color="green" />
      </div>

      <Section title="Top Spenders">
        {data.topSpenders.map((c: any) => (
          <KV key={c.id} label={c.full_name ?? c.email} value={formatINR(c.spend)} count={c.bookings} />
        ))}
      </Section>

      <div className="space-y-1.5">
        {data.rows.slice(0, 30).map((c: any) => (
          <div key={c.id} className="rounded-lg border border-cyan-500/10 bg-[#12121a] p-2.5 text-xs flex justify-between gap-3">
            <div className="min-w-0">
              <div className="text-white font-bold truncate">{c.full_name ?? c.email}</div>
              <div className="text-gray-500 truncate">
                {c.bookings} bookings • wallet {formatINR(Number(c.wallet_balance))}
              </div>
            </div>
            <div className="text-right font-bold text-cyan-400 shrink-0">
              {formatINR(c.spend)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- Small components ----------

function Section({ title, color = 'cyan', children }: { title: string; color?: string; children: React.ReactNode }) {
  const colorMap: Record<string, string> = {
    green: 'border-green-500/30 bg-green-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
  }
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <div className="text-xs font-bold tracking-wider text-white mb-3">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function KV({ label, value, count, bold }: { label: string; value: string; count?: number; bold?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 text-sm">
      <span className="text-gray-400">
        {label}
        {typeof count === 'number' && <span className="text-gray-600 text-xs ml-2">({count})</span>}
      </span>
      <span className={`font-mono text-white ${bold ? 'font-black text-base' : ''}`}>{value}</span>
    </div>
  )
}

function KVDivider() {
  return <div className="h-px bg-white/10 my-1" />
}

function Stat({ label, value, color = 'cyan' }: { label: string; value: any; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'border-green-500/30 bg-green-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    gray: 'border-gray-500/30 bg-gray-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
  }
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="text-[10px] text-gray-400 tracking-wider font-bold">{label.toUpperCase()}</div>
      <div className="text-lg font-black text-white mt-1">{value}</div>
    </div>
  )
}

function Empty({ title }: { title: string }) {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">📊</div>
      <p className="text-gray-400 text-sm">{title}</p>
    </div>
  )
}

// ---------- Helpers ----------

function rangeFor(report: ReportKey, date: string): { start: Date; end: Date } {
  const [y, m, d] = date.split('-').map(Number)
  const startIST = new Date(Date.UTC(y, m - 1, d) - 5.5 * 3600000) // start of day IST

  let days = 1
  if (report === 'weekly') days = 7
  else if (report === 'monthly') days = 30

  const endIST = new Date(startIST.getTime() + days * 86400000)
  return { start: startIST, end: endIST }
}

function sum(rows: any[] = [], key: string): number {
  return rows.reduce((s, r) => s + Number(r[key] || 0), 0)
}