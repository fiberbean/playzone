'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Post = {
  id: string
  caption: string | null
  image_url: string | null
  badge: string | null
  badge_color: string | null
  likes_count: number
  comments_count: number
  created_at: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export default function AdminPostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const router = useRouter()

  const fetchPosts = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('posts')
      .select(`
        id,
        caption,
        image_url,
        badge,
        badge_color,
        likes_count,
        comments_count,
        created_at,
        profiles:user_id (full_name, avatar_url)
      `)
      .order('created_at', { ascending: false })

    setPosts((data as any) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchPosts()
  }, [])

  const handleDelete = async (postId: string, imageKey: string | null) => {
    if (!confirm('Ee post ni delete cheyyala?')) return

    setDeleting(postId)
    const supabase = createClient()

    // Delete from DB
    const { error } = await supabase.from('posts').delete().eq('id', postId)

    if (error) {
      alert('Delete failed: ' + error.message)
      setDeleting(null)
      return
    }

    // Update UI
    setPosts(posts.filter((p) => p.id !== postId))
    setDeleting(null)
    router.refresh()
  }

  const timeAgo = (dateStr: string) => {
    const now = new Date().getTime()
    const seconds = Math.floor((now - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const badgeStyles: Record<string, string> = {
    cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
    pink: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    green: 'bg-green-500/20 text-green-300 border-green-500/50',
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          MANAGE POSTS
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          {posts.length} POST{posts.length !== 1 ? 'S' : ''} TOTAL
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📝</div>
          <p className="text-gray-400 text-sm">No posts yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div
              key={post.id}
              className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-xl p-3 sm:p-4 flex gap-3 items-start"
            >
              {/* Thumbnail */}
              {post.image_url ? (
                <img
                  src={post.image_url}
                  alt="post"
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-gradient-to-br from-cyan-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">🎮</span>
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {post.badge && (
                    <span
                      className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded-full border ${
                        badgeStyles[post.badge_color ?? 'cyan']
                      }`}
                    >
                      {post.badge}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500">
                    {timeAgo(post.created_at)}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-300 line-clamp-2">
                  {post.caption ?? 'No caption'}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
                  <span>❤️ {post.likes_count}</span>
                  <span>💬 {post.comments_count}</span>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(post.id, null)}
                disabled={deleting === post.id}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition flex-shrink-0 disabled:opacity-50"
              >
                {deleting === post.id ? (
                  <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin"></div>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}