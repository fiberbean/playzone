// app/playzonemama/AdminBottomNav.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PRIMARY = [
  { href: '/playzonemama', label: 'Home', icon: '📊', exact: true },
  { href: '/playzonemama/live', label: 'Live', icon: '🔴' },
  { href: '/playzonemama/bookings', label: 'Bookings', icon: '📅' },
  { href: '/playzonemama/scan', label: 'Scan', icon: '📷' },
]

const MORE_GROUPS = [
  {
    title: 'Operations',
    items: [
      { href: '/playzonemama/wallet', label: 'Wallet', icon: '💰' },
      { href: '/playzonemama/reports', label: 'Reports', icon: '📈' },
      { href: '/playzonemama/maintenance', label: 'Maintenance', icon: '🔧' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { href: '/playzonemama/consoles', label: 'Consoles', icon: '🎮' },
      { href: '/playzonemama/games', label: 'Games', icon: '🎯' },
      { href: '/playzonemama/mapping', label: 'Mapping', icon: '🔗' },
    ],
  },
  {
    title: 'Content',
    items: [
      { href: '/playzonemama/new-post', label: 'New Post', icon: '✍️' },
      { href: '/playzonemama/posts', label: 'Posts', icon: '📝' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/playzonemama/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
]

export function AdminBottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <>
      {/* More drawer */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-[#12121a] border-t border-cyan-500/30 rounded-t-2xl max-h-[80vh] overflow-y-auto pb-20">
            <div className="sticky top-0 bg-[#12121a] border-b border-cyan-500/15 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-white tracking-wider">
                ALL SECTIONS
              </span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 text-gray-400"
              >
                ✕
              </button>
            </div>

            <div className="p-3 space-y-3">
  {MORE_GROUPS.map((group) => (
    <div key={group.title}>
      <div className="text-[9px] tracking-[0.2em] font-bold text-gray-600 mb-1.5 px-1">
        {group.title.toUpperCase()}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {group.items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border transition text-center ${
                active
                  ? 'bg-gradient-to-r from-cyan-500/20 to-pink-500/10 border-cyan-500/50 text-cyan-300'
                  : 'bg-white/5 border-white/10 text-gray-400'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="text-[10px] font-bold tracking-wide leading-tight">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  ))}

              <Link
                href="/"
                onClick={() => setMoreOpen(false)}
                className="block text-center py-3 rounded-xl border border-white/10 text-xs font-bold text-gray-400 tracking-wider"
              >
                ← BACK TO FEED
              </Link>
            </div>
          </div>
        </>
      )}

      {/* Bottom bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-cyan-500/20">
        <div className="grid grid-cols-5 max-w-lg mx-auto">
          {PRIMARY.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 transition ${
                  active ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[9px] font-bold tracking-wider">
                  {item.label.toUpperCase()}
                </span>
              </Link>
            )
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center gap-0.5 py-2.5 transition ${
              moreOpen ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-lg">☰</span>
            <span className="text-[9px] font-bold tracking-wider">MORE</span>
          </button>
        </div>
      </nav>
    </>
  )
}