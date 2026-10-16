// app/playzonemama/layout.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AdminSidebar } from './AdminSidebar'
import { AdminBottomNav } from './AdminBottomNav'

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
      {/* ============ DESKTOP: Sidebar layout ============ */}
      <div className="hidden lg:flex min-h-screen">
        <AdminSidebar profile={profile} />
        <main className="flex-1 min-w-0 px-6 py-6 max-w-7xl mx-auto">
          {children}
        </main>
      </div>

      {/* ============ MOBILE: Header + content + bottom nav ============ */}
      <div className="lg:hidden pb-24">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-cyan-500/20">
          <div className="px-4 py-3 flex items-center justify-between">
            <Link href="/playzonemama" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/30">
                <span className="text-lg">⚡</span>
              </div>
              <div>
                <h1 className="text-sm font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent leading-none">
                  PLAY ZONE
                </h1>
                <p className="text-[9px] text-cyan-400 tracking-widest font-bold mt-0.5">
                  ADMIN PANEL
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="text-[10px] font-bold text-gray-400 hover:text-cyan-400 transition px-2 py-1.5 rounded-lg hover:bg-cyan-500/10 tracking-wider"
              >
                FEED
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

        {/* Content */}
        <main className="px-4 py-6">{children}</main>

        {/* Bottom nav */}
        <AdminBottomNav />
      </div>
    </div>
  )
}