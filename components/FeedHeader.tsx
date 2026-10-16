'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { NotificationBell } from '@/components/NotificationBell'
import { formatINR } from '@/lib/utils/money'

type Profile = {
  id: string
  email: string | null
  full_name: string | null
  avatar_url: string | null
  role: string
  wallet_balance: number
  time_credit_min?: number
}

export default function FeedHeader({ profile }: { profile: Profile | null }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <span className="text-base sm:text-lg">⚡</span>
            </div>
            <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
              PLAY ZONE
            </h1>
          </div>

          {/* Right side: bell + hamburger */}
          <div className="flex items-center gap-2">
            {profile?.id && <NotificationBell userId={profile.id} />}

            <button
              onClick={() => setMenuOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#12121a] border border-cyan-500/30 hover:border-cyan-500/60 transition"
            >
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Menu Drawer */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={() => setMenuOpen(false)}
          />

          <div className="fixed top-0 right-0 h-full w-72 sm:w-80 max-w-[85vw] bg-[#12121a] border-l border-cyan-500/30 z-50 shadow-2xl overflow-y-auto">
            <div className="p-4 sm:p-5 border-b border-cyan-500/20">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base sm:text-lg font-bold text-cyan-400">MENU</h2>
                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-3">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt="avatar"
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 border-cyan-500/50"
                  />
                ) : (
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center">
                    <span className="text-base sm:text-lg font-bold">
                      {profile?.full_name?.[0]?.toUpperCase() ?? 'U'}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-sm sm:text-base">
                    {profile?.full_name ?? 'User'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{profile?.email}</p>
                </div>
              </div>

              {/* Wallet + time credit */}
              <div className="mt-4 space-y-2">
                <div className="bg-gradient-to-r from-cyan-500/10 to-pink-500/10 border border-cyan-500/30 rounded-xl p-3">
                  <p className="text-xs text-gray-400">Wallet Balance</p>
                  <p className="text-xl sm:text-2xl font-bold text-cyan-400">
                    {formatINR(Number(profile?.wallet_balance ?? 0))}
                  </p>
                </div>

                {(profile?.time_credit_min ?? 0) > 0 && (
                  <div className="bg-pink-500/10 border border-pink-500/30 rounded-xl p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-pink-300">⏱ Time Credit</p>
                        <p className="text-lg font-bold text-white">
                          {profile?.time_credit_min} min
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <nav className="p-2 sm:p-3">
              <MenuItem icon="🏠" label="Feed" onClick={() => { setMenuOpen(false); router.push('/') }} />
              <MenuItem icon="🎮" label="Book Session" onClick={() => { setMenuOpen(false); router.push('/book') }} />
              <MenuItem icon="📜" label="My Bookings" onClick={() => { setMenuOpen(false); router.push('/bookings') }} />
              <MenuItem icon="💰" label="Wallet" onClick={() => { setMenuOpen(false); router.push('/wallet') }} />
              <MenuItem icon="🔔" label="Notifications" onClick={() => { setMenuOpen(false); router.push('/notifications') }} />
              <MenuItem icon="👤" label="Profile" onClick={() => { setMenuOpen(false); router.push('/profile') }} />

              {profile?.role === 'admin' && (
                <>
                  <div className="my-3 border-t border-cyan-500/20"></div>
                  <MenuItem icon="🛡️" label="Admin Panel" onClick={() => { setMenuOpen(false); router.push('/playzonemama') }} />
                </>
              )}

              <div className="my-3 border-t border-cyan-500/20"></div>
              <MenuItem icon="🚪" label="Logout" onClick={handleLogout} danger />
            </nav>
          </div>
        </>
      )}
    </>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 sm:px-4 py-3 rounded-xl transition text-left ${
        danger
          ? 'hover:bg-red-500/10 text-red-400'
          : 'hover:bg-cyan-500/10 text-gray-200'
      }`}
    >
      <span className="text-lg sm:text-xl">{icon}</span>
      <span className="font-medium text-sm sm:text-base">{label}</span>
    </button>
  )
}