// components/GameDetailModal.tsx
'use client'

import { getPlayerRate, getDiscountInfo } from '@/lib/utils/money'

type Game = {
  id: string
  name: string
  category: string | null
  image_url: string | null
  single_player_rate: number
  multiplayer_rate: number
  pricing_mode: 'flat' | 'pct_discount' | 'amt_discount' | string | null
  player_rates: Record<string, number> | null
  max_players: number
}

interface Props {
  game: Game
  consoleCount?: number
  onClose: () => void
  onSelect: () => void
}

export function GameDetailModal({ game, onClose, onSelect }: Props) {
  const playerCounts = Array.from({ length: game.max_players }, (_, i) => i + 1)
  const baseRate = Number(game.player_rates?.['1'] ?? game.single_player_rate ?? 0)

  const rateRows = playerCounts.map((n) => {
    const rate = getPlayerRate(
      game.player_rates,
      game.pricing_mode,
      n,
      game.single_player_rate
    )
    const disc = getDiscountInfo(baseRate, rate)
    return { n, rate, disc }
  })

  const hasAnyDiscount = rateRows.some((r) => r.disc.hasDiscount)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[92vh] rounded-t-2xl sm:rounded-2xl border-2 border-cyan-500/40 bg-neutral-950 shadow-2xl relative overflow-y-auto hide-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="fixed sm:absolute top-3 right-3 z-30 w-9 h-9 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white hover:bg-black/80 transition"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Poster */}
        <div className="relative w-full" style={{ aspectRatio: '16 / 9', maxHeight: '40vh' }}>
          <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 to-pink-500/20 overflow-hidden">
            {game.image_url ? (
              <img
                src={game.image_url}
                alt={game.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl opacity-40">
                🎮
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent pointer-events-none" />
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Name + Category + Max Players circle — left aligned */}
          <div className="mb-3">
            <h2 className="text-lg font-black text-white tracking-wide truncate">
              {game.name}
            </h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {game.category && (
                <span className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full border bg-cyan-500/10 border-cyan-500/40 text-cyan-300">
                  {game.category.toUpperCase()}
                </span>
              )}
              <span className="w-7 h-7 rounded-full bg-cyan-500/15 backdrop-blur-md border-2 border-cyan-500/60 shadow-lg shadow-cyan-500/30 flex items-center justify-center">
                <span className="text-[10px] font-black text-cyan-300 tabular-nums">
                  {game.max_players}P
                </span>
              </span>
            </div>
          </div>

          {/* PRICING — Borderless table with thin dividers */}
          <div className="mb-3">
            {/* Base price header */}
            <div className="flex items-center justify-between px-1 py-1.5">
              <span className="text-[9px] font-black tracking-widest text-cyan-300">
                BASE PRICE
              </span>
              <span className="text-xs font-black text-white font-mono tabular-nums">
                ₹{baseRate}
                <span className="text-[9px] text-gray-500 font-normal ml-0.5">/hr</span>
              </span>
            </div>

            {/* Thin divider */}
            <div className="h-px bg-white/10" />

            {/* Player rates table — no borders */}
            <div className="px-1 py-2">
              <table className="w-auto">
                <tbody>
                  <tr>
                    <td className="pr-4 text-[8px] font-black tracking-widest text-gray-500 align-middle whitespace-nowrap">
                      PLAYERS
                    </td>
                    {playerCounts.map((n) => (
                      <td
                        key={n}
                        className="pr-4 text-center text-[10px] font-black tracking-wider text-white tabular-nums align-middle whitespace-nowrap"
                      >
                        {n}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="pr-4 pt-1.5 text-[8px] font-black tracking-widest text-cyan-300 align-top whitespace-nowrap">
                      PRICE
                    </td>
                    {rateRows.map(({ n, rate, disc }) => (
                      <td
                        key={n}
                        className="pr-4 pt-1.5 text-center align-top whitespace-nowrap"
                      >
                        <div className="flex flex-col items-center gap-0">
                          <span className="text-xs font-black text-white font-mono tabular-nums leading-tight">
                            ₹{rate}
                          </span>
                          {disc.hasDiscount ? (
                            <span className="text-[8px] text-green-300 font-mono leading-tight">
                              (₹{disc.amount} off)
                            </span>
                          ) : (
                            <span className="text-[8px] text-gray-500 font-mono leading-tight">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Thin divider */}
            <div className="h-px bg-white/10" />

            {/* Hint */}
            <div className="px-1 py-1.5">
              <div className="text-[8px] text-gray-500 leading-tight">
                {hasAnyDiscount
                  ? 'Base rate — discounted price shown below.'
                  : 'Flat rate — same for all players.'}
              </div>
            </div>
          </div>

          {/* Info notice — full width */}
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5 text-[10px] text-amber-200 leading-relaxed mb-3">
            ⓘ Final price shown after selecting console and duration.
            <br />
            ⓘ Free cancel/reschedule up to 2 hrs before start.
          </div>

          {/* Actions — full width */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-gray-300 font-bold text-xs hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSelect}
              className="flex-[2] py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 text-white font-bold text-xs tracking-wider active:scale-[0.98] transition shadow-lg shadow-cyan-500/30"
            >
              SELECT THIS GAME →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}