// components/SlotGrid.tsx
'use client'

import { formatTime } from '@/lib/utils/time'
import type { SlotDef } from '@/lib/utils/slots' // 👈 Type name fixed

interface Props {
  slots: SlotDef[]
  selectedStart: Date | null
  selectedEnd?: Date | null
  onSelect: (start: Date) => void
}

export function SlotGrid({ slots, selectedStart, selectedEnd, onSelect }: Props) {
  if (slots.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-gray-500">
        No slots available
      </div>
    )
  }

  const nowMs = Date.now()
  const startMs = selectedStart?.getTime() ?? null
  const endMs = selectedEnd?.getTime() ?? null

  return (
    <div className="flex flex-wrap gap-y-2 gap-x-0 relative">
      {slots.map((slot, i) => {
        const slotTime = slot.start.getTime()
        const isPastSlot = slotTime <= nowMs
        const disabled = isPastSlot || slot.isBooked || slot.isPending || slot.isMaintenance

        const isStart = startMs !== null && slotTime === startMs
        const isEnd = endMs !== null && slotTime === endMs
        const isInRange = startMs !== null && endMs !== null && slotTime > startMs && slotTime < endMs

        let cls = 'relative flex-shrink-0 flex flex-col items-center justify-center h-16 sm:h-20 w-[calc(25%)] sm:w-[calc(16.666%)] md:w-[calc(12.5%)] transition-all '
        
        if (isStart) {
          cls += 'bg-gradient-to-r from-cyan-600/40 to-cyan-500/10 border-y-2 border-l-2 border-cyan-400 rounded-l-lg z-20 pl-1 '
        } else if (isEnd) {
          cls += 'bg-gradient-to-r from-pink-500/10 to-pink-600/40 border-y-2 border-r-2 border-pink-400 rounded-r-lg z-20 pr-1 '
        } else if (isInRange) {
          cls += 'bg-purple-500/20 border-y-2 border-purple-500/30 border-x-0 z-10 '
        } else {
          cls += 'px-1 '
        }

        const label = formatTime(slot.start.toISOString())
        const [time, meridiem] = label.split(' ')

        return (
          <div key={slot.start.toISOString()} className={`relative ${cls}`}>
            <button
              type="button"
              onClick={() => !disabled && onSelect(slot.start)}
              disabled={disabled}
              className={`w-[calc(100%-6px)] h-[calc(100%-6px)] flex flex-col items-center justify-center rounded-lg transition-all active:scale-[0.95] ${
                slot.isMaintenance ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                slot.isBooked ? 'bg-green-500/15 text-green-300 border border-green-500/30' :
                slot.isPending ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30' :
                isPastSlot ? 'bg-white/5 text-gray-600 border border-white/10 line-through' :
                (isStart || isEnd || isInRange) ? 'bg-transparent border-none text-white z-10' :
                'bg-[#12121a] border border-white/10 text-gray-200 hover:border-cyan-500/40'
              }`}
            >
              {isStart && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-20">
                  IN
                </span>
              )}
              {isEnd && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-pink-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-md z-20">
                  OUT
                </span>
              )}

              <span className={`text-xs sm:text-sm font-bold ${isStart || isEnd ? 'mt-1' : ''}`}>
                {time}
              </span>
              {meridiem && (
                <span className="text-[9px] sm:text-[10px] opacity-70 mt-0.5 font-medium">
                  {meridiem}
                </span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}