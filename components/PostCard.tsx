'use client'

import { useState } from 'react'

type Post = {
  id: string
  author_name: string
  author_avatar: string | null
  created_at: string
  image_url: string | null
  caption: string
  likes: number
  comments: number
  badge?: string
  badge_color?: 'cyan' | 'pink' | 'yellow' | 'green'
}

export default function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likes)
  const [showComments, setShowComments] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const handleLike = () => {
    setLiked(!liked)
    setLikeCount(liked ? likeCount - 1 : likeCount + 1)
  }

  const timeAgo = (dateStr: string) => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareText = post.caption

  const shareOptions = [
    { name: 'WhatsApp', icon: '💬', url: `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}` },
    { name: 'Instagram', icon: '📷', url: `https://www.instagram.com/` },
    { name: 'Facebook', icon: '📘', url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { name: 'Twitter', icon: '🐦', url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}` },
    { name: 'Copy', icon: '🔗', url: 'copy' },
  ]

  const handleShare = async (option: typeof shareOptions[0]) => {
    if (option.url === 'copy') {
      await navigator.clipboard.writeText(shareUrl)
      alert('Link copied!')
    } else {
      window.open(option.url, '_blank', 'width=600,height=500')
    }
    setShareOpen(false)
  }

  const badgeStyles = {
    cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50',
    pink: 'bg-pink-500/20 text-pink-300 border-pink-500/50',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/50',
    green: 'bg-green-500/20 text-green-300 border-green-500/50',
  }

  const badgeClass = post.badge_color ? badgeStyles[post.badge_color] : badgeStyles.cyan

  return (
    <article className="group relative bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-2xl overflow-hidden shadow-lg hover:shadow-cyan-500/20 hover:border-cyan-500/50 transition-all duration-300">

      <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      {/* Post Header */}
      <div className="relative flex items-center gap-2 sm:gap-3 p-3 sm:p-4">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <span className="text-sm font-black">
              {post.author_name[0]?.toUpperCase() ?? 'P'}
            </span>
          </div>
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-400 rounded-full border-2 border-[#12121a]"></div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-xs sm:text-sm truncate">{post.author_name}</p>
            {post.badge && (
              <span className={`text-[9px] sm:text-[10px] font-black tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full border ${badgeClass}`}>
                {post.badge}
              </span>
            )}
          </div>
          <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5">{timeAgo(post.created_at)}</p>
        </div>

        <button className="text-gray-500 hover:text-cyan-400 p-1 sm:p-2 transition flex-shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      {/* Post Image / Animated Placeholder */}
      {post.image_url ? (
        <img src={post.image_url} alt="post" className="relative w-full" />
      ) : (
        <div className="relative w-full aspect-video overflow-hidden border-y border-cyan-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-[#12121a] to-pink-500/20 animate-pulse"></div>

          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)',
              backgroundSize: '30px 30px',
            }}
          ></div>

          <div className="relative h-full flex flex-col items-center justify-center gap-2">
            <span className="text-5xl sm:text-6xl drop-shadow-[0_0_20px_rgba(0,240,255,0.5)]">🎮</span>
            <p className="text-[10px] sm:text-xs text-cyan-400/60 tracking-widest font-bold">PLAY ZONE</p>
          </div>

          <div className="absolute top-3 left-3 w-5 h-5 sm:w-6 sm:h-6 border-t-2 border-l-2 border-cyan-400/50"></div>
          <div className="absolute top-3 right-3 w-5 h-5 sm:w-6 sm:h-6 border-t-2 border-r-2 border-cyan-400/50"></div>
          <div className="absolute bottom-3 left-3 w-5 h-5 sm:w-6 sm:h-6 border-b-2 border-l-2 border-pink-400/50"></div>
          <div className="absolute bottom-3 right-3 w-5 h-5 sm:w-6 sm:h-6 border-b-2 border-r-2 border-pink-400/50"></div>
        </div>
      )}

      {/* Actions */}
      <div className="relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3">
        {/* Like */}
        <button
          onClick={handleLike}
          className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl transition-all ${
            liked
              ? 'bg-pink-500/20 border border-pink-500/50'
              : 'bg-white/5 border border-white/5 hover:bg-pink-500/10 hover:border-pink-500/30'
          }`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={liked ? '#ec4899' : 'none'}
            stroke={liked ? '#ec4899' : '#9ca3af'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span className={`text-xs sm:text-sm font-bold ${liked ? 'text-pink-400' : 'text-gray-400'}`}>
            {likeCount}
          </span>
        </button>

        {/* Comment */}
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-xs sm:text-sm font-bold text-gray-400">{post.comments}</span>
        </button>

        {/* Share */}
        <button
          onClick={() => setShareOpen(true)}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-cyan-500/10 hover:border-cyan-500/30 transition-all ml-auto"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span className="text-xs sm:text-sm font-bold text-gray-400 hidden xs:inline">Share</span>
        </button>
      </div>

      {/* Caption */}
      <div className="relative px-3 sm:px-4 pb-3 sm:pb-4">
        <p className="text-xs sm:text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
          {post.caption}
        </p>
      </div>

      {/* Comments Box */}
      {showComments && (
        <div className="relative px-3 sm:px-4 pb-3 sm:pb-4 border-t border-cyan-500/10 pt-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add a comment..."
              className="flex-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-cyan-500/60 transition"
            />
            <button className="px-3 sm:px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-xl text-xs sm:text-sm font-bold">
              Post
            </button>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="bg-[#12121a] border border-cyan-500/30 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl shadow-cyan-500/20"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 sm:mb-5">
              <h3 className="text-base sm:text-lg font-black text-cyan-400 tracking-wider">SHARE POST</h3>
              <button
                onClick={() => setShareOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/5 transition"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 sm:gap-3">
              {shareOptions.map((opt) => (
                <button
                  key={opt.name}
                  onClick={() => handleShare(opt)}
                  className="flex flex-col items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-xl hover:bg-cyan-500/10 transition group"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#0a0a0f] border border-cyan-500/30 flex items-center justify-center text-xl sm:text-2xl group-hover:scale-110 group-hover:border-cyan-500/60 transition-all">
                    {opt.icon}
                  </div>
                  <span className="text-[10px] sm:text-xs text-gray-400 text-center leading-tight">
                    {opt.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}