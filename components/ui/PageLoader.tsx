// components/ui/PageLoader.tsx
'use client'

export function PageLoader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center">
      <div className="text-center">
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-cyan-500/20" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-cyan-500 animate-spin" />
          <div className="absolute inset-3 rounded-full bg-gradient-to-br from-cyan-500/20 to-pink-500/20 flex items-center justify-center">
            <span className="text-xl">🎮</span>
          </div>
        </div>
        <p className="text-xs tracking-widest text-cyan-400 font-bold">{label.toUpperCase()}</p>
      </div>
    </div>
  )
}

export function InlineLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-cyan-500/30 border-t-cyan-500 animate-spin" />
        <span className="text-xs tracking-wider text-gray-400 font-bold">{label.toUpperCase()}</span>
      </div>
    </div>
  )
}