import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function AdminDashboard() {
  const supabase = await createClient()

  const [{ count: postsCount }, { count: usersCount }, { count: likesCount }] =
    await Promise.all([
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('likes').select('*', { count: 'exact', head: true }),
    ])

  const stats = [
    { label: 'Total Posts', value: postsCount ?? 0, icon: '📝' },
    { label: 'Total Users', value: usersCount ?? 0, icon: '👥' },
    { label: 'Total Likes', value: likesCount ?? 0, icon: '❤️' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          DASHBOARD
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          ADMIN OVERVIEW
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-2xl p-3 sm:p-5 text-center"
          >
            <div className="text-2xl sm:text-4xl mb-2">{stat.icon}</div>
            <div className="text-xl sm:text-3xl font-black text-cyan-400">
              {stat.value}
            </div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-6">
        <h3 className="text-lg font-bold text-cyan-400 mb-3 tracking-wider">
          QUICK ACTIONS
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/playzonemama/new-post"
            className="group flex items-center gap-4 p-4 bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/30">
              ✍️
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base">Create New Post</p>
              <p className="text-[10px] sm:text-xs text-gray-500">
                Upload image + caption
              </p>
            </div>
          </Link>

          <Link
            href="/playzonemama/posts"
            className="group flex items-center gap-4 p-4 bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 hover:border-cyan-500/50 rounded-2xl transition-all"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center text-2xl shadow-lg shadow-cyan-500/30">
              📝
            </div>
            <div>
              <p className="font-bold text-sm sm:text-base">Manage Posts</p>
              <p className="text-[10px] sm:text-xs text-gray-500">
                View + delete posts
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}