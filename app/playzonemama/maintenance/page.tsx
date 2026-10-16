// app/playzonemama/maintenance/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateShort, formatDateTime } from '@/lib/utils/time'
import { formatINR } from '@/lib/utils/money'
import { ConfirmActionModal } from '@/components/ui/ConfirmActionModal'
import { toast } from '@/components/ui/Toast'
import { startMaintenance, resolveMaintenance } from '@/lib/actions/maintenance'

type Tab = 'active' | 'history' | 'stats'

type MaintenanceRow = {
  id: string
  console_id: string
  reason: string
  description: string | null
  status: 'active' | 'resolved'
  started_at: string
  expected_end_at: string | null
  ended_at: string | null
  cost: number
  vendor: string | null
  created_at: string
  console: { id: string; name: string; type: string } | null
}

type Console = {
  id: string
  name: string
  type: string
  is_active: boolean
}

type Reason = { id: string; name: string }

export default function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('active')
  const [rows, setRows] = useState<MaintenanceRow[]>([])
  const [consoles, setConsoles] = useState<Console[]>([])
  const [reasons, setReasons] = useState<Reason[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    console_id: '',
    reason: '',
    description: '',
    expected_end_at: '',
    cost: 0,
    vendor: '',
  })
  const [saving, setSaving] = useState(false)
  const [resolveModal, setResolveModal] = useState<null | {
    row: MaintenanceRow
    cost: number
    notes: string
  }>(null)

  const fetchAll = async () => {
    const supabase = createClient()
    const [maintRes, consolesRes, reasonsRes] = await Promise.all([
      supabase
        .from('console_maintenance')
        .select(`
          id, console_id, reason, description, status,
          started_at, expected_end_at, ended_at, cost, vendor, created_at,
          console:consoles(id, name, type)
        `)
        .order('started_at', { ascending: false }),
      supabase.from('consoles').select('id, name, type, is_active').order('display_order'),
      supabase.from('maintenance_reasons').select('id, name').eq('is_active', true).order('display_order'),
    ])
    setRows((maintRes.data as any) ?? [])
    setConsoles((consolesRes.data as any) ?? [])
    setReasons((reasonsRes.data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
    const supabase = createClient()
    const channel = supabase
      .channel(`maintenance-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'console_maintenance' }, () => fetchAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const active = useMemo(() => rows.filter((r) => r.status === 'active'), [rows])
  const resolved = useMemo(() => rows.filter((r) => r.status === 'resolved'), [rows])

  const stats = useMemo(() => {
    const thisMonth = resolved.filter((r) => {
      const d = new Date(r.ended_at ?? r.started_at)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    const totalCost = thisMonth.reduce((s, r) => s + Number(r.cost || 0), 0)
    const totalDays = thisMonth.reduce((s, r) => {
      if (!r.ended_at) return s
      return s + Math.max(1, Math.round(
        (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 86400000
      ))
    }, 0)

    const byConsole = new Map<string, { name: string; count: number; cost: number; days: number }>()
    for (const r of thisMonth) {
      const name = r.console?.name ?? '?'
      const cur = byConsole.get(r.console_id) ?? { name, count: 0, cost: 0, days: 0 }
      cur.count += 1
      cur.cost += Number(r.cost || 0)
      if (r.ended_at) {
        cur.days += Math.max(1, Math.round(
          (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 86400000
        ))
      }
      byConsole.set(r.console_id, cur)
    }

    const byReason = new Map<string, { name: string; count: number; cost: number }>()
    for (const r of thisMonth) {
      const cur = byReason.get(r.reason) ?? { name: r.reason, count: 0, cost: 0 }
      cur.count += 1
      cur.cost += Number(r.cost || 0)
      byReason.set(r.reason, cur)
    }

    return {
      totalCost, totalDays,
      count: thisMonth.length,
      byConsole: Array.from(byConsole.values()).sort((a, b) => b.count - a.count),
      byReason: Array.from(byReason.values()).sort((a, b) => b.count - a.count),
    }
  }, [resolved])

  const handleStart = async () => {
    if (!form.console_id) return toast.error('Select a console')
    if (!form.reason) return toast.error('Select a reason')

    setSaving(true)
    try {
      await startMaintenance({
        console_id: form.console_id,
        reason: form.reason,
        description: form.description || undefined,
        expected_end_at: form.expected_end_at
          ? new Date(form.expected_end_at).toISOString()
          : undefined,
        cost: form.cost || 0,
        vendor: form.vendor || undefined,
      })
      toast.success('Maintenance started', 'Future bookings auto-cancelled')
      setForm({ console_id: '', reason: '', description: '', expected_end_at: '', cost: 0, vendor: '' })
      setShowForm(false)
      fetchAll()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setSaving(false)
    }
  }

  const handleResolve = async () => {
    if (!resolveModal) return
    setSaving(true)
    try {
      await resolveMaintenance(resolveModal.row.id, resolveModal.cost, resolveModal.notes)
      toast.success('Resolved')
      setResolveModal(null)
      fetchAll()
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : '')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'active', label: 'Active', badge: active.length },
    { key: 'history', label: 'History' },
    { key: 'stats', label: 'Stats' },
  ]

  return (
    <div>
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            MAINTENANCE
          </h2>
          <p className="text-xs text-gray-500 mt-1 tracking-widest">
            {active.length} ACTIVE ISSUES
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl text-sm tracking-wider"
        >
          {showForm ? '✕ CANCEL' : '+ LOG MAINTENANCE'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-4 sm:p-6 mb-6 space-y-3">
          <h3 className="text-sm font-bold text-cyan-400 tracking-wider">NEW MAINTENANCE</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">CONSOLE *</label>
              <select
                value={form.console_id}
                onChange={(e) => setForm({ ...form, console_id: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">— Select —</option>
                {consoles.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">REASON *</label>
              <select
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="">— Select —</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.name}>{r.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">EXPECTED END</label>
              <input
                type="date"
                value={form.expected_end_at}
                onChange={(e) => setForm({ ...form, expected_end_at: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">ESTIMATED COST ₹</label>
              <input
                type="number"
                min={0}
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: Number(e.target.value) || 0 })}
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 tracking-wider">VENDOR (optional)</label>
            <input
              type="text"
              value={form.vendor}
              onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              placeholder="Local repair shop"
              className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 tracking-wider">DESCRIPTION</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Screen flickering, needs check"
              className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200">
            ⚠ Any future bookings on this console will be <strong>auto-cancelled with 100% refund</strong>.
          </div>

          <button
            onClick={handleStart}
            disabled={saving}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50"
          >
            {saving ? 'Starting...' : 'Start Maintenance'}
          </button>
        </div>
      )}

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-xl text-xs font-bold tracking-wider border transition ${
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
          {tab === 'active' && (
            <div className="space-y-3">
              {active.length === 0 ? (
                <Empty icon="✅" title="All clear" sub="No active maintenance" />
              ) : (
                active.map((r) => (
                  <MaintenanceCard key={r.id} row={r} onResolve={() =>
                    setResolveModal({ row: r, cost: r.cost, notes: '' })
                  } />
                ))
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              {resolved.length === 0 ? (
                <Empty icon="📋" title="No history" sub="Resolved maintenance will appear here" />
              ) : (
                resolved.map((r) => <MaintenanceCard key={r.id} row={r} />)
              )}
            </div>
          )}

          {tab === 'stats' && <StatsView stats={stats} />}
        </>
      )}

      {resolveModal && (
        <ConfirmActionModal
          open
          title="Resolve Maintenance"
          variant="info"
          summary={[
            `${resolveModal.row.console?.name} • ${resolveModal.row.reason}`,
            `Started: ${formatDateShort(resolveModal.row.started_at)}`,
          ]}
          notices={['Console becomes available for booking immediately.']}
          reasonInput={{ enabled: true, label: 'Resolution notes', placeholder: 'Cable replaced, cleaned' }}
          confirmLabel={`Mark Resolved${resolveModal.cost > 0 ? ` • ₹${resolveModal.cost}` : ''}`}
          cancelLabel="Cancel"
          onConfirm={async (notes) => {
            setResolveModal({ ...resolveModal, notes: notes ?? '' })
            // small delay so state updates; but call directly:
          }}
          onCancel={() => setResolveModal(null)}
        />
      )}

      {/* Simpler: use a dedicated small modal for cost input instead of reasonInput */}
      {resolveModal && (
        <div className="hidden">
          {/* placeholder — removed in favor of resolve input inline */}
        </div>
      )}

      {/* Actual resolve modal with cost input */}
      {resolveModal && (
        <ResolveModal
          row={resolveModal.row}
          initialCost={resolveModal.cost}
          busy={saving}
          onCancel={() => setResolveModal(null)}
          onConfirm={async (cost, notes) => {
            setResolveModal({ ...resolveModal, cost, notes })
            await handleResolve()
          }}
        />
      )}
    </div>
  )
}

function MaintenanceCard({
  row, onResolve,
}: {
  row: MaintenanceRow
  onResolve?: () => void
}) {
  const days = row.ended_at
    ? Math.max(1, Math.round((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 86400000))
    : null

  return (
    <div
      className={`bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border rounded-xl p-4 ${
        row.status === 'active' ? 'border-red-500/40' : 'border-cyan-500/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span
              className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full border ${
                row.status === 'active'
                  ? 'bg-red-500/10 border-red-500/40 text-red-300'
                  : 'bg-green-500/10 border-green-500/40 text-green-300'
              }`}
            >
              {row.status === 'active' ? '🔧 ACTIVE' : '✅ RESOLVED'}
            </span>
            <span className="font-bold text-white text-sm">
              {row.console?.name ?? '—'}
            </span>
            <span className="text-[10px] text-gray-500">{row.console?.type}</span>
          </div>

          <div className="text-sm text-white">{row.reason}</div>
          {row.description && (
            <div className="text-xs text-gray-400 mt-1">{row.description}</div>
          )}

          <div className="text-[11px] text-gray-500 mt-1.5">
            {row.status === 'active' ? (
              <>
                Started {formatDateShort(row.started_at)}
                {row.expected_end_at && ` • Expected ${formatDateShort(row.expected_end_at)}`}
              </>
            ) : (
              <>
                {formatDateShort(row.started_at)} → {formatDateShort(row.ended_at!)}
                {days !== null && ` • ${days}d`}
              </>
            )}
          </div>

          {row.cost > 0 && (
            <div className="text-xs text-amber-400 mt-1">
              💰 {formatINR(row.cost)} {row.vendor && `• ${row.vendor}`}
            </div>
          )}
        </div>

        {onResolve && (
          <button
            onClick={onResolve}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600/90 hover:bg-green-600 text-white"
          >
            ✓ Resolve
          </button>
        )}
      </div>
    </div>
  )
}

function ResolveModal({
  row, initialCost, busy, onCancel, onConfirm,
}: {
  row: MaintenanceRow
  initialCost: number
  busy: boolean
  onCancel: () => void
  onConfirm: (cost: number, notes: string) => void
}) {
  const [cost, setCost] = useState(initialCost)
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-cyan-500/40 bg-neutral-950 p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">Resolve Maintenance</h2>

        <div className="text-sm text-gray-400 mb-4">
          {row.console?.name} • {row.reason}
        </div>

        <label className="block text-xs text-gray-400 mb-1">Actual Cost ₹</label>
        <input
          type="number"
          min={0}
          value={cost}
          onChange={(e) => setCost(Number(e.target.value) || 0)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2.5 text-sm text-white mb-3 focus:outline-none focus:border-cyan-500"
        />

        <label className="block text-xs text-gray-400 mb-1">Resolution Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2.5 text-sm text-white mb-4 focus:outline-none focus:border-cyan-500"
        />

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-300"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(cost, notes)}
            disabled={busy}
            className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '...' : 'Mark Resolved'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatsView({
  stats,
}: {
  stats: {
    count: number; totalCost: number; totalDays: number
    byConsole: { name: string; count: number; cost: number; days: number }[]
    byReason: { name: string; count: number; cost: number }[]
  }
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Issues" value={String(stats.count)} />
        <Stat label="Downtime" value={`${stats.totalDays}d`} />
        <Stat label="Cost" value={formatINR(stats.totalCost)} />
      </div>

      <section>
        <h3 className="text-xs font-bold tracking-wider text-cyan-400 mb-3">BY CONSOLE</h3>
        <div className="space-y-2">
          {stats.byConsole.length === 0 ? (
            <p className="text-xs text-gray-500">No data</p>
          ) : stats.byConsole.map((c) => (
            <div key={c.name} className="rounded-xl border border-cyan-500/10 bg-[#12121a] p-3 flex justify-between items-center">
              <div>
                <div className="text-sm text-white font-bold">{c.name}</div>
                <div className="text-[11px] text-gray-500">{c.count} issues • {c.days}d downtime</div>
              </div>
              <div className="font-mono text-amber-400">{formatINR(c.cost)}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold tracking-wider text-cyan-400 mb-3">BY REASON</h3>
        <div className="space-y-2">
          {stats.byReason.length === 0 ? (
            <p className="text-xs text-gray-500">No data</p>
          ) : stats.byReason.map((r) => (
            <div key={r.name} className="rounded-xl border border-cyan-500/10 bg-[#12121a] p-3 flex justify-between items-center">
              <div>
                <div className="text-sm text-white font-bold">{r.name}</div>
                <div className="text-[11px] text-gray-500">{r.count} times</div>
              </div>
              <div className="font-mono text-amber-400">{formatINR(r.cost)}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
      <div className="text-[10px] text-cyan-300 tracking-wider font-bold">{label.toUpperCase()}</div>
      <div className="text-lg font-black text-white mt-1">{value}</div>
    </div>
  )
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="text-center py-20">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-gray-400 text-sm">{title}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}