// app/playzonemama/AdminSidebar.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Profile = {
  full_name: string | null
  avatar_url: string | null
} | null

interface NavItem {
  href: string
  label: string
  icon: string
  exact?: boolean
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const GROUPS: NavGroup[] = [
  {
    title: 'Operations',
    items: [
      { href: '/playzonemama', label: 'Dashboard', icon: '📊', exact: true },
      { href: '/playzonemama/live', label: 'Live Sessions', icon: '🔴' },
      { href: '/playzonemama/bookings', label: 'Bookings', icon: '📅' },
      { href: '/playzonemama/scan', label: 'Scan ID', icon: '📷' },
      { href: '/playzonemama/wallet', label: 'Wallet', icon: '💰' },
    ],
  },
  {
    title: 'Analytics',
    items: [
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

export function AdminSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()

  return (
    <aside className="w-64 shrink-0 border-r border-cyan-500/15 bg-[#07070b] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-cyan-500/15">
        <Link href="/playzonemama" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <div className="text-sm font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent leading-none">
              PLAY ZONE
            </div>
            <div className="text-[9px] text-cyan-400 tracking-[0.25em] font-bold mt-0.5">
              ADMIN
            </div>
          </div>
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-4 sidebar-scroll">
        {GROUPS.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="px-5 mb-1.5 text-[9px] tracking-[0.2em] font-bold text-gray-600">
              {group.title.toUpperCase()}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/')

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-5 py-2 mx-2 rounded-lg text-sm font-medium transition ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500/20 to-pink-500/10 text-cyan-300 border-l-2 border-cyan-400'
                        : 'text-gray-400 hover:text-white hover:bg-white/5 border-l-2 border-transparent'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — user + back to feed */}
      <div className="border-t border-cyan-500/15 p-3">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-cyan-400 hover:bg-cyan-500/10 transition tracking-wider"
        >
          ← BACK TO FEED
        </Link>

        {profile && (
          <div className="flex items-center gap-2 px-3 py-2 mt-1">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full border border-cyan-500/50"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center text-xs font-bold">
                {(profile.full_name ?? 'A').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">
                {profile.full_name ?? 'Admin'}
              </div>
              <div className="text-[9px] text-cyan-400 tracking-wider font-bold">
                ADMIN
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}