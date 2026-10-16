// components/ui/BlockedActionModal.tsx
'use client';

export interface BlockedActionModalProps {
  open: boolean;
  title: string;
  message: string;
  icon?: string;
  onClose: () => void;
}

export function BlockedActionModal({ open, title, message, icon = '🚫', onClose }: BlockedActionModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-950 p-5 shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-3xl mb-2">{icon}</div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        <p className="text-sm text-neutral-400 whitespace-pre-line mb-5 text-center">{message}</p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-neutral-800 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}