'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Comment = {
  id: string
  text: string
  created_at: string
  user_id: string
  parent_id: string | null
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
  likes_count?: number
  is_liked?: boolean
}

export default function CommentsSection({
  postId,
  currentUserId,
}: {
  postId: string
  currentUserId: string
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState<Comment | null>(null)
  const [replyText, setReplyText] = useState('')
  const [commentLikes, setCommentLikes] = useState<Record<string, { count: number; liked: boolean }>>({})
  const router = useRouter()

  const fetchComments = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('comments')
      .select(`
        id,
        text,
        created_at,
        user_id,
        parent_id,
        profiles:user_id (full_name, avatar_url)
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    const commentsData = (data as any) ?? []
    setComments(commentsData)

    // Fetch likes for all comments
    if (commentsData.length > 0) {
      const commentIds = commentsData.map((c: Comment) => c.id)
      const { data: likesData } = await supabase
        .from('comment_likes')
        .select('comment_id, user_id')
        .in('comment_id', commentIds)

      const likesMap: Record<string, { count: number; liked: boolean }> = {}
      commentIds.forEach((id: string) => {
        likesMap[id] = { count: 0, liked: false }
      })

      likesData?.forEach((like) => {
        if (likesMap[like.comment_id]) {
          likesMap[like.comment_id].count += 1
          if (like.user_id === currentUserId) {
            likesMap[like.comment_id].liked = true
          }
        }
      })

      setCommentLikes(likesMap)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchComments()

    const supabase = createClient()
    const channel = supabase
      .channel(`comments-${postId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments', filter: `post_id=eq.${postId}` },
        () => fetchComments()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comment_likes' },
        () => fetchComments()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId])

  const handlePost = async () => {
    if (!text.trim()) return
    setPosting(true)

    const supabase = createClient()
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: currentUserId,
      text: text.trim(),
    })

    if (error) {
      alert('Comment failed: ' + error.message)
      setPosting(false)
      return
    }

    setText('')
    setPosting(false)
    fetchComments()
    router.refresh()
  }

  const handleReply = async (parentComment: Comment) => {
    if (!replyText.trim()) return
    setPosting(true)

    const supabase = createClient()
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: currentUserId,
      text: replyText.trim(),
      parent_id: parentComment.id,
    })

    if (error) {
      alert('Reply failed: ' + error.message)
      setPosting(false)
      return
    }

    setReplyText('')
    setReplyTo(null)
    setPosting(false)
    fetchComments()
    router.refresh()
  }

  const handleLikeComment = async (comment: Comment) => {
    const supabase = createClient()
    const current = commentLikes[comment.id] ?? { count: 0, liked: false }

    // Optimistic
    setCommentLikes({
      ...commentLikes,
      [comment.id]: {
        count: current.liked ? current.count - 1 : current.count + 1,
        liked: !current.liked,
      },
    })

    if (current.liked) {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', comment.id)
        .eq('user_id', currentUserId)
    } else {
      await supabase.from('comment_likes').insert({
        comment_id: comment.id,
        user_id: currentUserId,
      })
    }
  }

  const handleDelete = async (commentId: string) => {
    if (!confirm('Comment delete cheyyala?')) return
    const supabase = createClient()
    await supabase.from('comments').delete().eq('id', commentId)
    fetchComments()
    router.refresh()
  }

  const timeAgo = (dateStr: string) => {
    const now = new Date().getTime()
    const seconds = Math.floor((now - new Date(dateStr).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  // Organize comments: top-level + replies
  const topLevel = comments.filter((c) => !c.parent_id)
  const getReplies = (parentId: string) =>
    comments.filter((c) => c.parent_id === parentId)

  const renderComment = (comment: Comment, isReply = false) => {
    const likes = commentLikes[comment.id] ?? { count: 0, liked: false }

    return (
      <div key={comment.id} className={isReply ? 'ml-8 sm:ml-10' : ''}>
        <div className="flex gap-2">
          {comment.profiles?.avatar_url ? (
            <img
              src={comment.profiles.avatar_url}
              alt="avatar"
              className={`${isReply ? 'w-6 h-6' : 'w-8 h-8'} rounded-full border border-cyan-500/30 flex-shrink-0`}
            />
          ) : (
            <div
              className={`${
                isReply ? 'w-6 h-6' : 'w-8 h-8'
              } rounded-full bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center flex-shrink-0`}
            >
              <span className="text-[10px] font-bold">
                {comment.profiles?.full_name?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="bg-white/5 border border-white/5 rounded-xl px-3 py-2">
              <p className="text-[11px] font-bold text-cyan-400">
                {comment.profiles?.full_name ?? 'User'}
              </p>
              <p className="text-xs text-gray-300 break-words whitespace-pre-wrap">
                {comment.text}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-1 px-2">
              <span className="text-[10px] text-gray-500">
                {timeAgo(comment.created_at)}
              </span>

              {/* Like */}
              <button
                onClick={() => handleLikeComment(comment)}
                className={`flex items-center gap-1 text-[10px] transition ${
                  likes.liked ? 'text-pink-400' : 'text-gray-500 hover:text-pink-400'
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill={likes.liked ? '#ec4899' : 'none'}
                  stroke={likes.liked ? '#ec4899' : 'currentColor'}
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {likes.count > 0 && <span>{likes.count}</span>}
              </button>

              {/* Reply */}
              {!isReply && (
                <button
                  onClick={() => {
                    setReplyTo(comment)
                    setReplyText('')
                  }}
                  className="text-[10px] text-gray-500 hover:text-cyan-400 transition"
                >
                  Reply
                </button>
              )}

              {/* Delete */}
              {comment.user_id === currentUserId && (
                <button
                  onClick={() => handleDelete(comment.id)}
                  className="text-[10px] text-red-400 hover:text-red-300 transition"
                >
                  Delete
                </button>
              )}
            </div>

            {/* Reply Input */}
            {replyTo?.id === comment.id && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleReply(comment)
                    }
                  }}
                  placeholder={`Reply to ${comment.profiles?.full_name ?? 'User'}...`}
                  className="flex-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500/60 transition"
                  autoFocus
                />
                <button
                  onClick={() => handleReply(comment)}
                  disabled={posting || !replyText.trim()}
                  className="px-2.5 py-1.5 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  {posting ? '...' : 'Reply'}
                </button>
                <button
                  onClick={() => setReplyTo(null)}
                  className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-bold hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Nested Replies */}
            {!isReply && getReplies(comment.id).map((reply) => renderComment(reply, true))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative px-3 sm:px-4 pb-3 sm:pb-4 border-t border-cyan-500/10 pt-3">
      {loading ? (
        <div className="text-center py-4">
          <div className="w-6 h-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : comments.length > 0 ? (
        <div className="space-y-3 mb-3 max-h-96 overflow-y-auto">
          {topLevel.map((comment) => renderComment(comment))}
        </div>
      ) : (
        <p className="text-xs text-gray-500 text-center mb-3">
          No comments yet. Be the first!
        </p>
      )}

      {/* Add Top-Level Comment */}
      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handlePost()
            }
          }}
          placeholder="Add a comment..."
          className="flex-1 bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-3 py-2 text-xs sm:text-sm focus:outline-none focus:border-cyan-500/60 transition"
          disabled={posting}
        />
        <button
          onClick={handlePost}
          disabled={posting || !text.trim()}
          className="px-3 sm:px-4 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-xl text-xs sm:text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? '...' : 'Post'}
        </button>
      </div>
    </div>
  )
}