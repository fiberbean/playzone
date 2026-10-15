import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import FeedHeader from '@/components/FeedHeader'
import PostCard from '@/components/PostCard'

export const instant = false

type BadgeColor = 'cyan' | 'pink' | 'yellow' | 'green'

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
  badge_color?: BadgeColor
}

export default async function HomePage() {
  await connection()

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
    .single()

  const now = Date.now()

  const placeholderPosts: Post[] = [
    {
      id: '1',
      author_name: 'Play Zone Admin',
      author_avatar: null,
      created_at: new Date(now).toISOString(),
      image_url: null,
      badge: 'NEW',
      badge_color: 'cyan',
      caption: '🎮 New PS5 console added! Book your slot now. Weekend lo rush untundi — advance booking cheyandi!',
      likes: 24,
      comments: 5,
    },
    {
      id: '2',
      author_name: 'Play Zone Admin',
      author_avatar: null,
      created_at: new Date(now - 3600000).toISOString(),
      image_url: null,
      badge: 'TOURNAMENT',
      badge_color: 'pink',
      caption: '🏆 FIFA 26 Tournament — ee Sunday 5 PM. Entry ₹200. Winner ki ₹2000 prize! Register at counter.',
      likes: 48,
      comments: 12,
    },
    {
      id: '3',
      author_name: 'Play Zone Admin',
      author_avatar: null,
      created_at: new Date(now - 86400000).toISOString(),
      image_url: null,
      badge: 'OFFER',
      badge_color: 'yellow',
      caption: '⚡ Happy Hours: 12 PM - 3 PM. 30% off on all bookings. Grab your slot!',
      likes: 67,
      comments: 8,
    },
  ]

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

          <div className="space-y-4 sm:space-y-6">
            {placeholderPosts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}