// app/playzonemama/games/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ImageUploader from '@/components/ImageUploader'
import { getPlayerRate } from '@/lib/utils/money'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  image_key: string | null
  hourly_rate: number | null
  single_player_rate: number
  multiplayer_rate: number
  pricing_mode: 'flat' | 'pct_discount' | 'amt_discount' | null
  player_rates: Record<string, number> | null
  max_players: number
  display_order: number
  is_active: boolean
}

type Category = { id: string; name: string }

type PricingMode = 'flat' | 'pct_discount' | 'amt_discount'

export default function GamesPage() {
  const [games, setGames] = useState<Game[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    category: 'Sports',
    image_url: null as string | null,
    image_key: null as string | null,
    single_player_rate: 80,
    multiplayer_rate: 120,
    pricing_mode: 'flat' as PricingMode,
    player_rates: { '1': 80, '2': 120, '3': 120, '4': 120 } as Record<string, number>,
    max_players: 4,
    display_order: 0,
  })

  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const fallbackCategories = ['Sports', 'Action', 'Racing', 'Fighting', 'Adventure', 'Other']

  const fetchAll = async () => {
    const supabase = createClient()
    const [gamesRes, catsRes] = await Promise.all([
      supabase.from('games').select('*').order('display_order', { ascending: true }),
      supabase.from('game_categories').select('id, name').eq('is_active', true).order('display_order'),
    ])
    setGames((gamesRes.data as any) ?? [])
    setCategories((catsRes.data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const resetForm = () => {
    setForm({
      name: '',
      category: categories[0]?.name ?? 'Sports',
      image_url: null,
      image_key: null,
      single_player_rate: 80,
      multiplayer_rate: 120,
      pricing_mode: 'flat',
      player_rates: { '1': 80, '2': 120, '3': 120, '4': 120 },
      max_players: 4,
      display_order: 0,
    })
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Game name kavali')
      return
    }
    if (form.single_player_rate <= 0) {
      alert('Single rate positive ga undali')
      return
    }

    setSaving(true)
    const supabase = createClient()

    // Build player_rates based on mode
    const cleanPlayerRates: Record<string, number> = {}
    for (let i = 1; i <= form.max_players; i++) {
      const v = Number(form.player_rates[String(i)] ?? 0)
      if (v >= 0) cleanPlayerRates[String(i)] = v
    }

    const payload = {
      name: form.name,
      category: form.category,
      image_url: form.image_url,
      image_key: form.image_key,
      single_player_rate: form.single_player_rate,
      multiplayer_rate: form.multiplayer_rate,
      pricing_mode: form.pricing_mode,
      player_rates: cleanPlayerRates,
      max_players: form.max_players,
      display_order: form.display_order,
    }

    if (editingId) {
      const { error } = await supabase.from('games').update(payload).eq('id', editingId)
      if (error) {
        alert('Update failed: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('games').insert(payload)
      if (error) {
        alert('Create failed: ' + error.message)
        setSaving(false)
        return
      }
    }

    resetForm()
    setShowForm(false)
    setSaving(false)
    fetchAll()
    router.refresh()
  }

  const handleEdit = (g: Game) => {
    // Build player_rates with defaults
    const pr = g.player_rates ?? {}
    const player_rates: Record<string, number> = {}
    for (let i = 1; i <= 8; i++) {
      const key = String(i)
      player_rates[key] = Number(pr[key] ?? (i === 1 ? g.single_player_rate : g.multiplayer_rate) ?? 0)
    }

    setForm({
      name: g.name,
      category: g.category ?? 'Other',
      image_url: g.image_url,
      image_key: g.image_key,
      single_player_rate: g.single_player_rate ?? 80,
      multiplayer_rate: g.multiplayer_rate ?? 120,
      pricing_mode: (g.pricing_mode as PricingMode) ?? 'flat',
      player_rates,
      max_players: g.max_players ?? 4,
      display_order: g.display_order,
    })
    setEditingId(g.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ee game ni delete cheyyala?')) return
    const supabase = createClient()
    await supabase.from('games').delete().eq('id', id)
    fetchAll()
    router.refresh()
  }

  const toggleActive = async (g: Game) => {
    const supabase = createClient()
    await supabase.from('games').update({ is_active: !g.is_active }).eq('id', g.id)
    fetchAll()
  }

  const categoryColors: Record<string, string> = {
    Sports: 'bg-green-500/20 text-green-300 border-green-500/50',
    Action: 'bg-red-500/20 text-red-300 border-red-500/50',
    Racing: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    Fighting: 'bg-orange-500/20 text-orange-300 border-orange-500/50',
    Adventure: 'bg-blue-500/20 text-blue-300 border-blue-500/50',
    Other: 'bg-gray-500/20 text-gray-300 border-gray-500/50',
  }

  const categoryList = categories.length > 0
    ? categories.map((c) => c.name)
    : fallbackCategories

  // Preview rate for a given player count
  const previewRate = (n: number): number => {
    return getPlayerRate(
      form.player_rates,
      form.pricing_mode,
      n,
      form.single_player_rate
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            GAMES
          </h2>
          <p className="text-xs text-gray-500 mt-1 tracking-widest">
            {games.length} TOTAL
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm(!showForm)
            resetForm()
          }}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl text-sm tracking-wider"
        >
          {showForm ? '✕ CANCEL' : '+ ADD GAME'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-4 sm:p-6 mb-6">
          <h3 className="text-sm font-bold text-cyan-400 tracking-wider mb-4">
            {editingId ? 'EDIT GAME' : 'NEW GAME'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left: Image Upload */}
            <div>
              <label className="text-[10px] text-gray-500 tracking-wider mb-2 block">
                GAME COVER IMAGE
              </label>
              {form.image_url ? (
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/30">
                  <img
                    src={form.image_url}
                    alt="cover"
                    className="w-full aspect-square object-cover"
                  />
                  <button
                    onClick={() =>
                      setForm({ ...form, image_url: null, image_key: null })
                    }
                    className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-red-500/90 hover:bg-red-500 text-white rounded-full text-sm"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <ImageUploader
                  onUploadComplete={(url, key) => {
                    setForm({ ...form, image_url: url, image_key: key })
                  }}
                  onUploadError={(err) => alert(err)}
                />
              )}
            </div>

            {/* Right: Details */}
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500 tracking-wider">
                  GAME NAME
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="FIFA 26"
                  className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              <div>
                <label className="text-[10px] text-gray-500 tracking-wider">
                  CATEGORY
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                >
                  {categoryList.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* PRICING MODE */}
              <div>
                <label className="text-[10px] text-gray-500 tracking-wider">
                  PRICING MODE
                </label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {([
                    { key: 'flat', label: 'Flat ₹', hint: 'Direct rate' },
                    { key: 'pct_discount', label: '% Off', hint: 'Discount %' },
                    { key: 'amt_discount', label: '₹ Off', hint: 'Discount ₹' },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, pricing_mode: m.key })
                      }}
                      className={`py-2 rounded-lg text-xs font-bold border transition ${
                        form.pricing_mode === m.key
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                          : 'border-white/10 bg-white/5 text-gray-400'
                      }`}
                      title={m.hint}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="text-[9px] text-gray-500 mt-1">
                  {form.pricing_mode === 'flat' && 'Enter the actual rate per player count.'}
                  {form.pricing_mode === 'pct_discount' && 'Base rate (row 1) + discount % for more players.'}
                  {form.pricing_mode === 'amt_discount' && 'Base rate (row 1) + discount ₹ for more players.'}
                </div>
              </div>

              {/* MAX PLAYERS */}
              <div>
                <label className="text-[10px] text-gray-500 tracking-wider">
                  MAX PLAYERS
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.max_players}
                  onChange={(e) => {
                    const n = Math.min(Math.max(parseInt(e.target.value) || 4, 1), 8)
                    setForm({ ...form, max_players: n })
                  }}
                  className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                />
              </div>

              {/* DISPLAY ORDER */}
              <div>
                <label className="text-[10px] text-gray-500 tracking-wider">
                  DISPLAY ORDER
                </label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      display_order: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                />
              </div>
            </div>
          </div>

          {/* PER-PLAYER RATES */}
          <div className="mt-5 rounded-xl border border-cyan-500/20 bg-black/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] text-gray-500 tracking-wider font-bold">
                  PLAYER RATES
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5">
                  {form.pricing_mode === 'flat' && 'Actual rate per player count (₹/hr)'}
                  {form.pricing_mode === 'pct_discount' && 'Row 1 = base rate. Others = discount % off base.'}
                  {form.pricing_mode === 'amt_discount' && 'Row 1 = base rate. Others = ₹ off base.'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {Array.from({ length: form.max_players }, (_, i) => i + 1).map((n) => {
                const key = String(n)
                const isBase = n === 1
                const value = form.player_rates[key] ?? 0

                return (
                  <div key={n} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-gray-400 font-bold">
                      {n} player{n > 1 ? 's' : ''}
                    </div>

                    <div className="flex-1 relative">
                      <input
                        type="number"
                        min={0}
                        step={form.pricing_mode === 'pct_discount' ? 1 : 10}
                        value={value}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0
                          setForm({
                            ...form,
                            player_rates: { ...form.player_rates, [key]: v },
                          })
                        }}
                        className="w-full bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-500/60"
                        placeholder={form.pricing_mode === 'flat' ? '100' : isBase ? '100' : '0'}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                        {form.pricing_mode === 'flat' ? '₹/hr' : form.pricing_mode === 'pct_discount' ? '%' : '₹'}
                      </span>
                    </div>

                    {/* Live preview */}
                    {form.pricing_mode !== 'flat' && !isBase && value > 0 && (
                      <div className="w-24 text-right text-xs font-bold text-cyan-300">
                        → ₹{previewRate(n)}/hr
                      </div>
                    )}

                    {form.pricing_mode === 'flat' && (
                      <div className="w-24 text-right text-xs font-bold text-cyan-300">
                        ₹{value}/hr
                      </div>
                    )}

                    {form.pricing_mode !== 'flat' && isBase && (
                      <div className="w-24 text-right text-[10px] text-gray-500">
                        (base)
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full mt-5 py-3 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold rounded-xl disabled:opacity-50 tracking-wider"
          >
            {saving ? 'SAVING...' : editingId ? 'UPDATE GAME' : 'CREATE GAME'}
          </button>
        </div>
      )}

      {/* Games Grid */}
      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎮</div>
          <p className="text-gray-400 text-sm">No games yet</p>
          <p className="text-gray-500 text-xs mt-1">
            Add your first game to get started
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {games.map((g) => {
            const baseRate = getPlayerRate(
              g.player_rates,
              g.pricing_mode,
              1,
              g.single_player_rate
            )
            const multiRate = getPlayerRate(
              g.player_rates,
              g.pricing_mode,
              2,
              g.multiplayer_rate
            )
            return (
              <div
                key={g.id}
                className={`group relative bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border rounded-2xl overflow-hidden transition-all hover:scale-[1.02] ${
                  g.is_active
                    ? 'border-cyan-500/20 hover:border-cyan-500/60 hover:shadow-lg hover:shadow-cyan-500/20'
                    : 'border-gray-700/30 opacity-50'
                }`}
              >
                {/* Image */}
                <div className="relative aspect-square overflow-hidden">
                  {g.image_url ? (
                    <img
                      src={g.image_url}
                      alt={g.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 via-[#12121a] to-pink-500/20 flex items-center justify-center">
                      <span className="text-5xl opacity-50">🎮</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>

                  {g.category && (
                    <div className="absolute top-2 left-2">
                      <span
                        className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-sm ${
                          categoryColors[g.category] ?? categoryColors.Other
                        }`}
                      >
                        {g.category.toUpperCase()}
                      </span>
                    </div>
                  )}

                  {!g.is_active && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full bg-gray-800/90 text-gray-400 border border-gray-600">
                        HIDDEN
                      </span>
                    </div>
                  )}

                  {/* Max players badge */}
                  <div className="absolute top-2 right-2 mt-6">
                    <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-cyan-300 border border-cyan-500/40">
                      👥 {g.max_players}
                    </span>
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <h3 className="font-bold text-sm text-white truncate">
                      {g.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-cyan-400 font-black text-sm leading-tight">
                        👤 ₹{baseRate}
                        <span className="text-[9px] text-gray-400 font-normal ml-0.5">/hr</span>
                      </p>
                      {g.max_players > 1 && (
                        <p className="text-pink-400 font-black text-sm leading-tight">
                          👥 ₹{multiRate}
                          <span className="text-[9px] text-gray-400 font-normal ml-0.5">/hr</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 p-2 bg-[#0a0a0f]/50">
                  <button
                    onClick={() => toggleActive(g)}
                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-cyan-500/40 transition text-sm"
                    title={g.is_active ? 'Hide' : 'Show'}
                  >
                    {g.is_active ? '👁️' : '🚫'}
                  </button>
                  <button
                    onClick={() => handleEdit(g)}
                    className="flex-1 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 transition text-sm"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="flex-1 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition text-sm"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}