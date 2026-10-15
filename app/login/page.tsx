'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-white px-4 py-6 relative overflow-hidden">
      {/* Neon glow effects */}
      <div className="absolute top-0 left-0 w-48 h-48 sm:w-96 sm:h-96 bg-cyan-500/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-0 w-48 h-48 sm:w-96 sm:h-96 bg-pink-500/20 rounded-full blur-3xl"></div>

      <div className="w-full max-w-[340px] sm:max-w-md relative z-10">
        <div className="bg-[#12121a]/80 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-500/20 p-5">

          {/* Logo */}
          <div className="text-center mb-5">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-cyan-400 to-pink-500 rounded-xl mb-3 shadow-lg shadow-cyan-500/50">
              <span className="text-2xl">⚡</span>
            </div>
            <h1 className="text-2xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent leading-tight">
              PLAY ZONE
            </h1>
            <p className="text-cyan-400 mt-1.5 text-[9px] tracking-[0.2em] font-bold">
              ▸ PLAY ▸ COMPETE ▸ REPEAT ◂
            </p>
          </div>

          {/* Welcome */}
          <div className="text-center mb-5">
            <h2 className="text-base font-bold mb-0.5 text-white tracking-wide">
              ENTER THE ARENA
            </h2>
            <p className="text-gray-400 text-[11px]">
              Sign in to continue your grind
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-3 py-2 rounded-lg mb-4 text-xs">
              {error}
            </div>
          )}

          {/* Google Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold py-3 px-3 rounded-xl hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs tracking-wide"
          >
            <svg className="w-4 h-4 bg-white rounded-full p-0.5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'CONNECTING...' : 'CONTINUE WITH GOOGLE'}
          </button>

          <p className="text-center text-gray-600 text-[9px] mt-4 tracking-wider">
            🔒 SECURE LOGIN • NO PASSWORD NEEDED
          </p>
        </div>
      </div>
    </div>
  )
}