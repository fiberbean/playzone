'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Console = {
  id: string
  name: string
  type: string
  display_order: number
  is_active: boolean
  status: string | null
  joysticks: number
}

type ConsoleType = { id: string; name: string }

export default function ConsolesPage() {
  const [consoles, setConsoles] = useState<Console[]>([])
  const [consoleTypes, setConsoleTypes] = useState<ConsoleType[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    type: 'PS4',
    joysticks: 2,
    display_order: 0,
  })
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const fallbackTypes = ['PS4', 'PS5', 'Xbox', 'PC', 'VR']

  const fetchAll = async () => {
    const supabase = createClient()
    const [consolesRes, typesRes] = await Promise.all([
      supabase.from('consoles').select('*').order('display_order', { ascending: true }),
      supabase.from('console_types').select('id, name').eq('is_active', true).order('display_order'),
    ])
    setConsoles((consolesRes.data as any) ?? [])
    setConsoleTypes((typesRes.data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Name kavali')
      return
    }
    if (form.joysticks < 1 || form.joysticks > 8) {
      alert('Joysticks 1 to 8 madhya undali')
      return
    }

    setSaving(true)
    const supabase = createClient()

    if (editingId) {
      const { error } = await supabase
        .from('consoles')
        .update(form)
        .eq('id', editingId)
      if (error) {
        alert('Update failed: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('consoles').insert(form)
      if (error) {
        alert('Create failed: ' + error.message)
        setSaving(false)
        return
      }
    }

    setForm({ name: '', type: consoleTypes[0]?.name ?? 'PS4', joysticks: 2, display_order: 0 })
    setShowForm(false)
    setEditingId(null)
    setSaving(false)
    fetchAll()
    router.refresh()
  }

  const handleEdit = (c: Console) => {
    setForm({
      name: c.name,
      type: c.type,
      joysticks: c.joysticks ?? 2,
      display_order: c.display_order,
    })
    setEditingId(c.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ee console ni delete cheyyala?')) return
    const supabase = createClient()
    await supabase.from('consoles').delete().eq('id', id)
    fetchAll()
    router.refresh()
  }

  const toggleActive = async (c: Console) => {
    const supabase = createClient()
    await supabase.from('consoles').update({ is_active: !c.is_active }).eq('id', c.id)
    fetchAll()
  }

  const typeColors: Record<string, string> = {
    PS4: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    PS5: 'bg-purple-500/20 text-purple-300 border-purple-500/50',
    Xbox: 'bg-green-500/20 text-green-300 border-green-500/50',
    PC: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
    VR: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
  }

  const typeList = consoleTypes.length > 0
    ? consoleTypes.map((t) => t.name)
    : fallbackTypes

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            CONSOLES
          </h2>
          <p className="text-xs text-gray-500 mt-1 tracking-widest">
            {consoles.length} TOTAL
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm)
            setEditingId(null)
            setForm({ name: '', type: typeList[0] ?? 'PS4', joysticks: 2, display_order: 0 })
          }}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl text-sm tracking-wider"
        >
          {showForm ? '✕ CANCEL' : '+ ADD CONSOLE'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-4 sm:p-6 mb-6">
          <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-4">
            {editingId ? 'EDIT CONSOLE' : 'NEW CONSOLE'}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">
                NAME
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="PS4-1"
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/60"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">
                TYPE
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/60"
              >
                {typeList.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">
                JOYSTICKS / CONTROLLERS
              </label>
              <input
                type="number"
                min={1}
                max={8}
                value={form.joysticks}
                onChange={(e) =>
                  setForm({ ...form, joysticks: parseInt(e.target.value) || 1 })
                }
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/60"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Max players this console supports
              </p>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 tracking-wider">
                DISPLAY ORDER
              </label>
              <input
                type="number"
                value={form.display_order}
                onChange={(e) =>
                  setForm({ ...form, display_order: parseInt(e.target.value) || 0 })
                }
                className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-4 py-3 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50"
          >
            {saving ? 'SAVING...' : editingId ? 'UPDATE' : 'CREATE'}
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : consoles.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎮</div>
          <p className="text-gray-400 text-sm">No consoles yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {consoles.map((c) => (
            <div
              key={c.id}
              className={`bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border rounded-xl p-4 flex items-center gap-3 ${
                c.is_active ? 'border-cyan-500/20' : 'border-gray-700/30 opacity-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-sm sm:text-base">{c.name}</h3>
                  <span
                    className={`text-[10px] font-black tracking-wider px-2 py-0.5 rounded-full border ${
                      typeColors[c.type] ?? typeColors.PS4
                    }`}
                  >
                    {c.type}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                    🎮 {c.joysticks}
                  </span>
                  {!c.is_active && (
                    <span className="text-[10px] text-gray-500">INACTIVE</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Order: {c.display_order}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(c)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/40 transition"
                >
                  {c.is_active ? '👁️' : '🚫'}
                </button>
                <button
                  onClick={() => handleEdit(c)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}