'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ImageUploader from '@/components/ImageUploader'
import { createClient } from '@/lib/supabase/client'

export default function NewPostPage() {
  const router = useRouter()
  const [caption, setCaption] = useState('')
  const [badge, setBadge] = useState('')
  const [badgeColor, setBadgeColor] = useState<'cyan' | 'pink' | 'yellow' | 'green'>('cyan')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const badges = [
    { label: 'None', value: '' },
    { label: 'NEW', value: 'NEW' },
    { label: 'TOURNAMENT', value: 'TOURNAMENT' },
    { label: 'OFFER', value: 'OFFER' },
    { label: 'UPDATE', value: 'UPDATE' },
  ]

  const badgeColors = [
    { label: 'Cyan', value: 'cyan', class: 'bg-cyan-500' },
    { label: 'Pink', value: 'pink', class: 'bg-pink-500' },
    { label: 'Yellow', value: 'yellow', class: 'bg-yellow-500' },
    { label: 'Green', value: 'green', class: 'bg-green-500' },
  ]

  const handlePost = async () => {
    if (!caption.trim() && !imageUrl) {
      setError('Caption leda image - okkati kavali')
      return
    }

    setPosting(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('Not authenticated')
        setPosting(false)
        return
      }

      const { error: insertError } = await supabase.from('posts').insert({
        user_id: user.id,
        caption: caption.trim() || null,
        image_url: imageUrl,
        image_key: imageKey,
        badge: badge || null,
        badge_color: badge ? badgeColor : null,
      })

      if (insertError) {
        console.error(insertError)
        setError(insertError.message)
        setPosting(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      console.error(err)
      setError('Something went wrong')
      setPosting(false)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">
          CREATE POST
        </h2>
        <p className="text-xs text-gray-500 mt-1 tracking-widest">
          SHARE WITH YOUR CUSTOMERS
        </p>
      </div>

      <div className="bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/20 rounded-2xl p-4 sm:p-6 space-y-5">
        {/* Image Uploader */}
        <div>
          <label className="block text-xs text-cyan-400 tracking-widest font-bold mb-2">
            IMAGE (OPTIONAL)
          </label>
          <ImageUploader
            onUploadComplete={(url, key) => {
              setImageUrl(url)
              setImageKey(key)
            }}
            onUploadError={(err) => {
              setError(err)
            }}
          />
        </div>

        {/* Caption */}
        <div>
          <label className="block text-xs text-cyan-400 tracking-widest font-bold mb-2">
            CAPTION
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Write something... (announcement, tournament, offer)"
            rows={4}
            className="w-full bg-[#0a0a0f] border border-cyan-500/20 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500/60 transition resize-none"
            maxLength={500}
          />
          <p className="text-[10px] text-gray-500 mt-1 text-right">
            {caption.length}/500
          </p>
        </div>

        {/* Badge */}
        <div>
          <label className="block text-xs text-cyan-400 tracking-widest font-bold mb-2">
            BADGE (OPTIONAL)
          </label>
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBadge(b.value)}
                className={`px-3 py-2 rounded-lg text-xs font-bold border transition ${
                  badge === b.value
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:border-cyan-500/40'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Badge Color */}
        {badge && (
          <div>
            <label className="block text-xs text-cyan-400 tracking-widest font-bold mb-2">
              BADGE COLOR
            </label>
            <div className="flex gap-2 flex-wrap">
              {badgeColors.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setBadgeColor(c.value as any)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition ${
                    badgeColor === c.value
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-white/10 hover:border-cyan-500/40'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${c.class}`}></span>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handlePost}
          disabled={posting}
          className="w-full py-4 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-black rounded-xl shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {posting ? 'POSTING...' : '📢 POST NOW'}
        </button>
      </div>
    </div>
  )
}