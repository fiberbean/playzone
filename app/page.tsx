import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FeedHeader from '@/components/FeedHeader'
import PostCard from '@/components/PostCard'
import FeedRealtime from '@/components/FeedRealtime'

// Auth page — prathi user ki different data, so blocking route correct
export const instant = false

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  const { data: posts, error: postsError } = await supabase
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
      user_id,
      profiles:user_id (
        full_name,
        avatar_url
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  // Debug
  console.log('===== POSTS DEBUG =====')
  console.log('POSTS COUNT:', posts?.length)
  console.log('POSTS ERROR:', postsError)
  console.log('===== END =====')

  const postIds = posts?.map((p) => p.id) ?? []
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', user.id)
    .in('post_id', postIds.length > 0 ? postIds : ['00000000-0000-0000-0000-000000000000'])

  const likedPostIds = new Set(userLikes?.map((l) => l.post_id) ?? [])

  const formattedPosts =
    posts?.map((post) => ({
      id: post.id,
      author_name: (post.profiles as any)?.full_name ?? 'User',
      author_avatar: (post.profiles as any)?.avatar_url ?? null,
      created_at: post.created_at,
      image_url: post.image_url,
      caption: post.caption ?? '',
      likes: post.likes_count ?? 0,
      comments: post.comments_count ?? 0,
      badge: post.badge,
      badge_color: post.badge_color,
      is_liked: likedPostIds.has(post.id),
      user_id: post.user_id,
    })) ?? []

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white relative">
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#00f0ff 1px, transparent 1px), linear-gradient(90deg, #00f0ff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      ></div>

      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="relative z-10">
        <FeedHeader profile={profile} />

        <main className="w-full max-w-2xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 pb-24">
          <div className="mb-5 sm:mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
                UPDATES
              </h2>
              <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/50 to-transparent"></div>
            </div>
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1 tracking-widest">
              LATEST FROM PLAY ZONE
            </p>
          </div>

          {formattedPosts.length > 0 ? (
            <div className="space-y-4 sm:space-y-6">
              {formattedPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={user.id}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-2xl mb-6 shadow-lg shadow-cyan-500/50">
                <span className="text-4xl">🎮</span>
              </div>
              <h2 className="text-xl font-bold mb-2">No Posts Yet</h2>
              <p className="text-gray-400 text-sm">
                Admin post create chesaka ikkada kanipistundi
              </p>
            </div>
          )}
        </main>

        <FeedRealtime />
      </div>
    </div>
  )
}