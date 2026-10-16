// components/ui/Toast.tsx
'use client';

import { create } from 'zustand';
import { useEffect } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'urgent';

interface ToastItem {
  id: string;
  title: string;
  body?: string;
  variant: ToastVariant;
  duration?: number;
  sound?: boolean;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (t: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    const duration = t.duration ?? (t.variant === 'urgent' ? 12000 : 5000);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, duration);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  info: (title: string, body?: string) =>
    useToastStore.getState().push({ title, body, variant: 'info' }),
  success: (title: string, body?: string) =>
    useToastStore.getState().push({ title, body, variant: 'success' }),
  warning: (title: string, body?: string) =>
    useToastStore.getState().push({ title, body, variant: 'warning' }),
  error: (title: string, body?: string) =>
    useToastStore.getState().push({ title, body, variant: 'error' }),
  urgent: (title: string, body?: string, sound = true) =>
    useToastStore.getState().push({ title, body, variant: 'urgent', sound }),
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-100',
  success: 'bg-green-500/10 border-green-500/40 text-green-100',
  warning: 'bg-amber-500/10 border-amber-500/40 text-amber-100',
  error: 'bg-red-500/10 border-red-500/40 text-red-100',
  urgent: 'bg-red-600/20 border-red-500/60 text-red-50 animate-pulse',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <ToastItemView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItemView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    if (item.sound) playChime(item.variant === 'urgent');
  }, [item.id, item.sound, item.variant]);

  return (
    <div
      className={`pointer-events-auto rounded-lg border px-4 py-3 shadow-lg backdrop-blur cursor-pointer transition ${VARIANT_STYLES[item.variant]}`}
      onClick={onDismiss}
    >
      <div className="font-semibold text-sm">{item.title}</div>
      {item.body && <div className="text-xs opacity-80 mt-1 whitespace-pre-line">{item.body}</div>}
    </div>
  );
}

let audioCtx: AudioContext | null = null;
export function playChime(loud = false) {
  if (typeof window === 'undefined') return;
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = loud ? 880 : 660;
    osc.type = 'sine';
    gain.gain.setValueAtTime(loud ? 0.4 : 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    if (loud) {
      setTimeout(() => {
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.frequency.value = 1100;
        o2.type = 'sine';
        g2.gain.setValueAtTime(0.4, ctx.currentTime);
        g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        o2.start();
        o2.stop(ctx.currentTime + 0.6);
      }, 200);
    }
  } catch {}
}