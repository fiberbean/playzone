import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <span className="text-lg">⚡</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-base font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent leading-none">
                PLAY ZONE
              </h1>
              <p className="text-[10px] text-cyan-400 tracking-widest font-bold">
                ADMIN PANEL
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs sm:text-sm text-gray-400 hover:text-cyan-400 transition px-3 py-2 rounded-lg hover:bg-cyan-500/10"
            >
              ← Feed
            </Link>
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt="admin"
                className="w-8 h-8 rounded-full border-2 border-cyan-500/50"
              />
            )}
          </div>
        </div>
      </header>

      {/* Nav Tabs */}
      <nav className="border-b border-cyan-500/10 bg-[#0a0a0f]/50 sticky top-[57px] z-30 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          <AdminNavLink href="/playzonemama" label="Dashboard" icon="📊" />
          <AdminNavLink href="/playzonemama/live" label="Live" icon="🔴" />
          <AdminNavLink href="/playzonemama/bookings" label="Bookings" icon="📅" />
          <AdminNavLink href="/playzonemama/scan" label="Scan" icon="📷" />
          <AdminNavLink href="/playzonemama/wallet" label="Wallet" icon="💰" />
          <AdminNavLink href="/playzonemama/reports" label="Reports" icon="📈" />
          <AdminNavLink href="/playzonemama/maintenance" label="Maintenance" icon="🔧" />
          <span className="w-px bg-cyan-500/20 my-2 mx-1 shrink-0" />
          <AdminNavLink href="/playzonemama/consoles" label="Consoles" icon="🎮" />
          <AdminNavLink href="/playzonemama/games" label="Games" icon="🎯" />
          <AdminNavLink href="/playzonemama/mapping" label="Mapping" icon="🔗" />
          <span className="w-px bg-cyan-500/20 my-2 mx-1 shrink-0" />
          <AdminNavLink href="/playzonemama/new-post" label="New Post" icon="✍️" />
          <AdminNavLink href="/playzonemama/posts" label="Posts" icon="📝" />
          <AdminNavLink href="/playzonemama/settings" label="Settings" icon="⚙️" />
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
    </div>
  )
}

function AdminNavLink({
  href,
  label,
  icon,
}: {
  href: string
  label: string
  icon: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold text-gray-400 hover:text-cyan-400 border-b-2 border-transparent hover:border-cyan-400 transition whitespace-nowrap"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}