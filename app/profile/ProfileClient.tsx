// app/profile/ProfileClient.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatINR } from '@/lib/utils/money'
import { toast } from '@/components/ui/Toast'

type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  role: string
  wallet_balance: number
  time_credit_min: number
  notification_prefs: any
  created_at: string
}

interface Props {
  profile: Profile
  stats: { total: number; completed: number; spend: number }
}

const DEFAULT_PREFS = {
  session_ending: true,
  booking_starting: true,
  wallet: true,
  posts: true,
  sound: false,
}

export function ProfileClient({ profile, stats }: Props) {
  const router = useRouter()
  const [name, setName] = useState(profile.full_name ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [prefs, setPrefs] = useState({ ...DEFAULT_PREFS, ...(profile.notification_prefs ?? {}) })
  const [saving, setSaving] = useState(false)
  const [prefsSaving, setPrefsSaving] = useState(false)

  const handleSaveProfile = async () => {
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: name.trim() || null, phone: phone.trim() || null })
      .eq('id', profile.id)
    setSaving(false)
    if (error) toast.error('Update failed', error.message)
    else {
      toast.success('Saved')
      router.refresh()
    }
  }

  const togglePref = async (key: keyof typeof DEFAULT_PREFS) => {
    const next = { ...prefs, [key]: !prefs[key] }
    setPrefs(next)
    setPrefsSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next })
      .eq('id', profile.id)
    setPrefsSaving(false)
    if (error) {
      toast.error('Failed to save preference')
      setPrefs(prefs) // revert
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-cyan-400 transition">←</Link>
          <h1 className="font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
            PROFILE
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 pb-24 space-y-4">
        {/* Avatar + identity card */}
        <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/30 rounded-2xl p-5 text-center">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-20 h-20 rounded-full mx-auto border-2 border-cyan-500/50 mb-3"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto bg-gradient-to-br from-cyan-500 to-pink-500 flex items-center justify-center text-3xl font-black mb-3">
              {(profile.full_name ?? profile.email ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-lg font-bold text-white">{profile.full_name ?? 'Guest'}</div>
          <div className="text-xs text-gray-400">{profile.email}</div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
            <Stat label="Bookings" value={String(stats.total)} />
            <Stat label="Completed" value={String(stats.completed)} />
            <Stat label="Spent" value={formatINR(stats.spend)} />
          </div>
        </div>

        {/* Wallet quick card */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
            <div className="text-[10px] text-cyan-300 tracking-wider font-bold">WALLET</div>
            <div className="text-xl font-black text-white mt-1">
              {formatINR(Number(profile.wallet_balance))}
            </div>
          </div>
          <div className="rounded-xl border border-pink-500/30 bg-pink-500/5 p-3">
            <div className="text-[10px] text-pink-300 tracking-wider font-bold">TIME CREDIT</div>
            <div className="text-xl font-black text-white mt-1">
              {profile.time_credit_min} min
            </div>
          </div>
        </div>

        {/* Editable profile */}
        <div className="bg-[#12121a] border border-white/5 rounded-2xl p-4 space-y-3">
          <h2 className="text-xs font-bold tracking-wider text-cyan-400">EDIT PROFILE</h2>

          <div>
            <label className="text-[10px] text-gray-500 tracking-wider">FULL NAME</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 tracking-wider">PHONE</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 XXXXX XXXXX"
              className="w-full mt-1 bg-[#0a0a0f] border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>

        {/* Notification prefs */}
        <div className="bg-[#12121a] border border-white/5 rounded-2xl p-4 space-y-2">
          <h2 className="text-xs font-bold tracking-wider text-cyan-400 mb-2">
            NOTIFICATION PREFERENCES
          </h2>

          <PrefToggle
            label="Session ending reminders"
            sub="10 / 5 / 2 min before session ends"
            value={prefs.session_ending}
            onChange={() => togglePref('session_ending')}
          />
          <PrefToggle
            label="Booking start reminders"
            sub="30 / 10 min before your slot"
            value={prefs.booking_starting}
            onChange={() => togglePref('booking_starting')}
          />
          <PrefToggle
            label="Wallet activity"
            sub="Recharges, refunds, charges"
            value={prefs.wallet}
            onChange={() => togglePref('wallet')}
          />
          <PrefToggle
            label="Zone posts"
            sub="New games, offers"
            value={prefs.posts}
            onChange={() => togglePref('posts')}
          />
          <PrefToggle
            label="Sound alerts"
            sub="Plays on zone tablet"
            value={prefs.sound}
            onChange={() => togglePref('sound')}
          />
        </div>

        {/* Quick links */}
        <div className="space-y-2">
          <QuickLink href="/bookings" label="My Bookings" icon="📅" />
          <QuickLink href="/wallet" label="Wallet & History" icon="💰" />
          <QuickLink href="/notifications" label="Notifications" icon="🔔" />
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full py-3 rounded-xl border border-red-500/40 text-red-300 text-sm font-bold hover:bg-red-500/10 transition"
        >
          Sign Out
        </button>

        <div className="text-center text-[10px] text-gray-600 pt-4">
          Member since {new Date(profile.created_at).toLocaleDateString('en-IN', {
            month: 'short', year: 'numeric',
          })}
        </div>
      </main>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500 tracking-wider font-bold">{label.toUpperCase()}</div>
      <div className="text-base font-black text-white mt-0.5">{value}</div>
    </div>
  )
}

function PrefToggle({
  label, sub, value, onChange,
}: {
  label: string
  sub?: string
  value: boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0"
    >
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm text-white">{label}</div>
        {sub && <div className="text-[10px] text-gray-500">{sub}</div>}
      </div>
      <div
        className={`w-11 h-6 rounded-full relative transition ${
          value ? 'bg-cyan-500' : 'bg-neutral-800'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </div>
    </button>
  )
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-3 rounded-xl bg-[#12121a] border border-white/5 hover:border-cyan-500/40 transition"
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <span className="text-sm text-white font-bold">{label}</span>
      </div>
      <span className="text-gray-600 text-lg">›</span>
    </Link>
  )
}