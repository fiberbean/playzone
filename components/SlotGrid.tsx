// components/SlotGrid.tsx
'use client';

import type { SlotDef } from '@/lib/utils/slots';

interface Props {
  slots: SlotDef[];
  selectedStart: Date | null;
  onSelect: (start: Date) => void;
  disabled?: boolean;
}

export function SlotGrid({ slots, selectedStart, onSelect, disabled }: Props) {
  // Group: morning (<12), afternoon (12–17), evening (>=17)
  const groups = {
    Morning: slots.filter((s) => s.startMin < 12 * 60),
    Afternoon: slots.filter((s) => s.startMin >= 12 * 60 && s.startMin < 17 * 60),
    Evening: slots.filter((s) => s.startMin >= 17 * 60),
  };

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([label, group]) => (
        group.length === 0 ? null : (
          <div key={label}>
            <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">{label}</div>
            <div className="grid grid-cols-4 gap-2">
              {group.map((slot) => {
                const selected = selectedStart?.getTime() === slot.start.getTime();
                const unavailable = slot.isPast || slot.isBooked || slot.isMaintenance;
                const pending = slot.isPending;

                let cls =
                  'rounded-lg border p-2 text-xs font-medium transition text-center';
                if (unavailable) {
                  cls += ' bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed line-through';
                } else if (pending && !selected) {
                  cls += ' bg-amber-500/10 border-amber-500/40 text-amber-300';
                } else if (selected) {
                  cls += ' bg-cyan-500 border-cyan-400 text-white';
                } else {
                  cls += ' bg-neutral-900 border-neutral-700 text-white hover:border-cyan-500/60';
                }

                return (
                  <button
                    key={slot.start.toISOString()}
                    disabled={disabled || unavailable}
                    onClick={() => onSelect(slot.start)}
                    className={cls}
                  >
                    {slot.label}
                  </button>
                );
              })}
            </div>
          </div>
        )
      ))}
      <div className="flex gap-4 text-xs text-neutral-500 pt-2">
        <span>🟩 Free</span>
        <span>⬜ Booked</span>
        <span>🟨 Pending</span>
        <span>🔧 Maintenance</span>
      </div>
    </div>
  );
}