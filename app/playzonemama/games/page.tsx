'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import ImageUploader from '@/components/ImageUploader'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  image_key: string | null
  hourly_rate: number | null
  single_player_rate: number
  multiplayer_rate: number
  display_order: number
  is_active: boolean
}

type Category = { id: string; name: string }

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
      display_order: 0,
    })
    setEditingId(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      alert('Game name kavali')
      return
    }
    if (form.single_player_rate <= 0 || form.multiplayer_rate <= 0) {
      alert('Rates positive ga undali')
      return
    }

    setSaving(true)
    const supabase = createClient()

    if (editingId) {
      const { error } = await supabase
        .from('games')
        .update({
          name: form.name,
          category: form.category,
          image_url: form.image_url,
          image_key: form.image_key,
          single_player_rate: form.single_player_rate,
          multiplayer_rate: form.multiplayer_rate,
          display_order: form.display_order,
        })
        .eq('id', editingId)
      if (error) {
        alert('Update failed: ' + error.message)
        setSaving(false)
        return
      }
    } else {
      const { error } = await supabase.from('games').insert({
        name: form.name,
        category: form.category,
        image_url: form.image_url,
        image_key: form.image_key,
        single_player_rate: form.single_player_rate,
        multiplayer_rate: form.multiplayer_rate,
        display_order: form.display_order,
      })
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
    setForm({
      name: g.name,
      category: g.category ?? 'Other',
      image_url: g.image_url,
      image_key: g.image_key,
      single_player_rate: g.single_player_rate ?? 80,
      multiplayer_rate: g.multiplayer_rate ?? 120,
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

              {/* Pricing — two rates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-gray-500 tracking-wider">
                    SINGLE PLAYER ₹/HR
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={form.single_player_rate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        single_player_rate: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 tracking-wider">
                    MULTIPLAYER ₹/HR
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={form.multiplayer_rate}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        multiplayer_rate: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full mt-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-cyan-500/60"
                  />
                </div>
              </div>

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
          {games.map((g) => (
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

                <div className="absolute bottom-0 left-0 right-0 p-2.5">
                  <h3 className="font-bold text-sm text-white truncate">
                    {g.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-cyan-400 font-black text-sm leading-tight">
                      👤 ₹{g.single_player_rate}
                      <span className="text-[9px] text-gray-400 font-normal ml-0.5">/hr</span>
                    </p>
                    <p className="text-pink-400 font-black text-sm leading-tight">
                      👥 ₹{g.multiplayer_rate}
                      <span className="text-[9px] text-gray-400 font-normal ml-0.5">/hr</span>
                    </p>
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
          ))}
        </div>
      )}
    </div>
  )
}