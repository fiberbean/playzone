// components/ui/MoneyBreakdown.tsx
import { formatINR } from '@/lib/utils/money';

interface Row {
  label: string;
  value: number;
  variant?: 'default' | 'fee' | 'refund' | 'total';
}

export function MoneyBreakdown({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg bg-neutral-900/60 p-3 space-y-2">
      {rows.map((row, i) => {
        const color =
          row.variant === 'fee' ? 'text-red-400'
          : row.variant === 'refund' ? 'text-green-400'
          : 'text-white';
        const bold = row.variant === 'total';
        const prefix =
          row.variant === 'fee' ? '−'
          : row.variant === 'refund' ? '+'
          : '';
        return (
          <div key={i} className={`flex justify-between text-sm ${bold ? 'border-t border-neutral-800 pt-2 mt-2' : ''}`}>
            <span className="text-neutral-400">{row.label}</span>
            <span className={`font-mono ${color} ${bold ? 'font-bold' : ''}`}>
              {prefix}{formatINR(Math.abs(row.value))}
            </span>
          </div>
        );
      })}
    </div>
  );
}