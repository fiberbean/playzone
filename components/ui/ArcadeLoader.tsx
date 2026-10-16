'use client'

import { useEffect, useState } from 'react'

const TIPS = [
  'Pro tip: Multiplayer is charged per console',
  'Pro tip: Cancel up to 2 hours before, only 10% fee',
  'Pro tip: Show your QR + 4-digit code to start',
  'Pro tip: Time credit never expires for 90 days',
  'Pro tip: Overrun is charged only after 5 min grace',
  'Pro tip: Log maintenance to auto-cancel bookings',
]

const STAGES = [
  'Booting arena',
  'Calibrating controllers',
  'Syncing sessions',
  'Almost ready',
]

export function ArcadeLoader({ label = 'Now Loading' }: { label?: string }) {
  const [progress, setProgress] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [stageIndex, setStageIndex] = useState(0)

  // Smooth progress that slows as it approaches 92%
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = (now - start) / 1000
      // ease-out curve: fast start, slow end, capped at 92
      const p = Math.min(92, 92 * (1 - Math.exp(-t / 1.6)))
      setProgress(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTipIndex((i) => (i + 1) % TIPS.length), 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setStageIndex((i) => (i + 1) % STAGES.length), 1200)
    return () => clearInterval(t)
  }, [])

  const pct = Math.floor(progress)

  return (
    <div className="fixed inset-0 z-50 bg-[#07070b] text-white overflow-hidden">
      {/* Ambient backdrop — subtle vignette + glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[500px] h-[500px] bg-pink-500/8 rounded-full blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.6)_100%)]" />
      </div>

      {/* Faint grid */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(#22d3ee 1px, transparent 1px), linear-gradient(90deg, #22d3ee 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Top — zone mark */}
        <div className="px-6 pt-6 sm:pt-8 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <div className="text-sm font-black tracking-[0.2em] bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent leading-none">
              PLAY ZONE
            </div>
            <div className="text-[9px] text-cyan-400/80 tracking-[0.35em] font-bold mt-0.5">
              ARCADE SYSTEM
            </div>
          </div>
        </div>

        {/* Middle — hero */}
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          {/* Big controller badge */}
          <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-8">
            {/* Outer pulse ring */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/20 animate-ping" style={{ animationDuration: '3s' }} />

            {/* Static ring */}
            <div className="absolute inset-0 rounded-full border border-cyan-500/30" />

            {/* Rotating arc */}
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400/40 animate-spin"
              style={{ animationDuration: '1.4s' }}
            />

            {/* Second counter-rotating arc */}
            <div
              className="absolute inset-2 rounded-full border-2 border-transparent border-b-pink-400 border-l-pink-400/40 animate-spin"
              style={{ animationDuration: '2s', animationDirection: 'reverse' }}
            />

            {/* Center badge */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#12121a] to-[#0a0a0f] border border-cyan-500/40 flex items-center justify-center shadow-[0_0_40px_-10px_rgba(34,211,238,0.5)]">
              <span className="text-4xl sm:text-5xl">🎮</span>
            </div>
          </div>

          {/* Status line */}
          <div className="text-center mb-8">
            <div className="text-xs tracking-[0.4em] text-cyan-400 font-bold mb-2">
              {label.toUpperCase()}
            </div>
            <div className="text-[11px] text-gray-500 font-mono tracking-wider h-4 transition-opacity">
              <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse mr-2 align-middle" />
              {STAGES[stageIndex]}...
            </div>
          </div>

          {/* Big progress bar */}
          <div className="w-full max-w-md">
            {/* Numbers above bar */}
            <div className="flex items-end justify-between mb-2">
              <span className="text-[10px] tracking-[0.3em] text-gray-500 font-bold">
                LOADING
              </span>
              <span className="text-2xl font-black tabular-nums text-white leading-none">
                {pct}
                <span className="text-cyan-400 text-base ml-0.5">%</span>
              </span>
            </div>

            {/* Bar track */}
            <div className="relative h-1.5 rounded-full bg-neutral-900 border border-cyan-500/15 overflow-hidden">
              {/* Fill */}
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-cyan-300 to-pink-400 transition-[width] duration-150 ease-out shadow-[0_0_14px_rgba(34,211,238,0.6)]"
                style={{ width: `${progress}%` }}
              />
              {/* Moving shine */}
              <div
                className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"
                style={{ animation: 'shine 1.6s ease-in-out infinite' }}
              />
            </div>

            {/* Segments below bar (cosmetic — like console loading) */}
            <div className="mt-2 flex gap-1">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-0.5 rounded-full transition-colors duration-300 ${
                    (i / 20) * 100 < progress ? 'bg-cyan-400/70' : 'bg-neutral-800'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Bottom — tip */}
        <div className="px-6 pb-8 sm:pb-10">
          <div className="max-w-md mx-auto">
            <div className="flex items-start gap-2 text-[11px] text-gray-400 leading-relaxed min-h-[32px]">
              <span className="text-cyan-400 shrink-0">▸</span>
              <span key={tipIndex} className="animate-tip-in">
                {TIPS[tipIndex]}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shine {
          0%   { transform: translateX(-120px); opacity: 0; }
          40%  { opacity: 1; }
          100% { transform: translateX(560px); opacity: 0; }
        }
        @keyframes tipIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-tip-in { animation: tipIn 0.35s ease-out; }
      `}</style>
    </div>
  )
}