// app/not-found.tsx
import Link from 'next/link'

export const instant = false

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">🎮</div>
        <h1 className="text-3xl font-black tracking-wider bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent mb-2">
          404
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          This page doesn't exist — or you took a wrong turn.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold tracking-wider"
        >
          ← Back to Feed
        </Link>
      </div>
    </div>
  )
}