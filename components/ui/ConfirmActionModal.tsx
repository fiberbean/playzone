// components/ui/ConfirmActionModal.tsx
'use client';

import { useState } from 'react';
import { formatINR } from '@/lib/utils/money';

export interface MoneyLine {
  label: string;
  value: number;
  highlight?: 'red' | 'green' | 'default';
  bold?: boolean;
  note?: string;
}

export interface BalanceLine {
  label: string;
  value: number;
  bold?: boolean;
}

export interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  variant?: 'info' | 'warning' | 'danger';
  summary?: string[];
  breakdown?: MoneyLine[];
  balance?: BalanceLine[];
  notices?: string[];
  reasonInput?: { enabled: boolean; label?: string; placeholder?: string };
  confirmLabel?: string;
  cancelLabel?: string;
  requireReason?: boolean;
  busy?: boolean;
  onConfirm: (reason?: string) => void | Promise<void>;
  onCancel: () => void;
}

const VARIANT_BORDER = {
  info: 'border-cyan-500/40',
  warning: 'border-amber-500/40',
  danger: 'border-red-500/40',
};

const VARIANT_ICON = {
  info: 'ⓘ',
  warning: '⚠',
  danger: '🚨',
};

export function ConfirmActionModal(props: ConfirmActionModalProps) {
  const {
    open, title, variant = 'info',
    summary, breakdown, balance, notices,
    reasonInput, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
    requireReason = false, busy = false,
    onConfirm, onCancel,
  } = props;

  const [reason, setReason] = useState('');

  if (!open) return null;

  const canConfirm = !busy && (!requireReason || reason.trim().length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className={`w-full max-w-md rounded-xl border bg-neutral-950 p-5 shadow-2xl ${VARIANT_BORDER[variant]}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">{VARIANT_ICON[variant]}</span>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>

        {summary && summary.length > 0 && (
          <div className="mb-4 text-sm text-neutral-300 space-y-1">
            {summary.map((s, i) => <div key={i}>{s}</div>)}
          </div>
        )}

        {breakdown && breakdown.length > 0 && (
          <div className="mb-4 rounded-lg bg-neutral-900/60 p-3 space-y-2">
            {breakdown.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-neutral-400">{line.label}</span>
                <span className={`font-mono ${
                  line.highlight === 'red' ? 'text-red-400'
                  : line.highlight === 'green' ? 'text-green-400'
                  : 'text-white'
                } ${line.bold ? 'font-bold' : ''}`}>
                  {line.highlight === 'red' ? '−' : line.highlight === 'green' ? '+' : ''}
                  {formatINR(Math.abs(line.value))}
                </span>
              </div>
            ))}
          </div>
        )}

        {balance && balance.length > 0 && (
          <div className="mb-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2">
            {balance.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-neutral-400">{line.label}</span>
                <span className={`font-mono text-white ${line.bold ? 'font-bold' : ''}`}>
                  {formatINR(line.value)}
                </span>
              </div>
            ))}
          </div>
        )}

        {notices && notices.length > 0 && (
          <div className="mb-4 text-xs text-amber-300/80 space-y-1">
            {notices.map((n, i) => <div key={i}>ⓘ {n}</div>)}
          </div>
        )}

        {reasonInput?.enabled && (
          <div className="mb-4">
            <label className="block text-xs text-neutral-400 mb-1">
              {reasonInput.label ?? 'Reason (optional)'}
              {requireReason && <span className="text-red-400"> *</span>}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonInput.placeholder}
              rows={2}
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 p-2 text-sm text-white focus:outline-none focus:border-cyan-500"
            />
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm font-medium text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={!canConfirm}
            className={`flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
              variant === 'danger' ? 'bg-red-600 hover:bg-red-700'
              : variant === 'warning' ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-cyan-600 hover:bg-cyan-700'
            }`}
          >
            {busy ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}