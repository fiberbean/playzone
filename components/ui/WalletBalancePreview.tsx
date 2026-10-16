// components/ui/WalletBalancePreview.tsx
import { formatINR } from '@/lib/utils/money';

interface Props {
  label: string;
  before: number;
  after: number;
  credit?: boolean;
}

export function WalletBalancePreview({ label, before, after, credit = false }: Props) {
  const diff = after - before;
  return (
    <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2">
      <div className="text-xs uppercase tracking-wide text-cyan-300/70">{label}</div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-400">Before</span>
        <span className="font-mono text-white">{formatINR(before)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-neutral-400">Change</span>
        <span className={`font-mono ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {diff >= 0 ? '+' : '−'}{formatINR(Math.abs(diff))}
        </span>
      </div>
      <div className="flex justify-between text-sm border-t border-neutral-800 pt-2">
        <span className="text-neutral-400">After</span>
        <span className="font-mono font-bold text-white">{formatINR(after)}</span>
      </div>
    </div>
  );
}