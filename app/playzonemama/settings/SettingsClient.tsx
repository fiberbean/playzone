// app/playzonemama/settings/SettingsClient.tsx
'use client';

import { useState } from 'react';
import { updateSetting } from '@/lib/actions/settings';
import { toast } from '@/components/ui/Toast';
import { invalidateSettingsCache } from '@/lib/hooks/useSettings';

interface Row {
  key: string;
  value: unknown;
  description: string | null;
}

interface SectionDef {
  title: string;
  icon: string;
  keys: string[];
}

const SECTIONS: SectionDef[] = [
  {
    title: 'Zone',
    icon: '🏢',
    keys: ['zone_name', 'zone_upi_id', 'zone_payee_name', 'zone_phone'],
  },
  {
    title: 'Hours & Slots',
    icon: '⏰',
    keys: [
      'open_hour', 'close_hour', 'slot_minutes',
      'min_duration_min', 'max_duration_min', 'advance_days',
    ],
  },
  {
    title: 'Policies',
    icon: '📋',
    keys: ['cancellation_fee_pct', 'reschedule_fee_pct', 'cutoff_hours'],
  },
  {
    title: 'Reminders',
    icon: '🔔',
    keys: ['reminder_minutes', 'booking_start_reminders'],
  },
  {
    title: 'Scan / Check-in',
    icon: '📷',
    keys: [
      'scan_enabled', 'scan_require_code', 'scan_code_length',
      'scan_code_expiry_sec', 'scan_code_max_attempts',
      'scan_override_enabled', 'scan_early_minutes', 'scan_late_minutes',
      'scan_no_show_minutes', 'scan_overrun_grace_min', 'scan_overrun_round_min',
    ],
  },
  {
    title: 'Time Credit',
    icon: '⏱',
    keys: ['time_credit_expiry_days', 'time_credit_min_use_min'],
  },
];

const LABELS: Record<string, string> = {
  zone_name: 'Zone Name',
  zone_upi_id: 'UPI ID',
  zone_payee_name: 'Payee Name',         // ✅ NEW
  zone_phone: 'Contact Phone',
  open_hour: 'Open Hour (24h)',
  close_hour: 'Close Hour (24h)',
  slot_minutes: 'Slot Size (min)',
  min_duration_min: 'Min Duration (min)',
  max_duration_min: 'Max Duration (min)',
  advance_days: 'Advance Booking (days)',
  cancellation_fee_pct: 'Cancellation Fee %',
  reschedule_fee_pct: 'Reschedule Fee %',
  cutoff_hours: 'Cutoff (hours before start)',
  reminder_minutes: 'Session Reminders (min)',
  booking_start_reminders: 'Booking Start Reminders (min)',
  scan_enabled: 'Enable Scanning',
  scan_require_code: 'Require 4-digit Code',
  scan_code_length: 'Code Length',
  scan_code_expiry_sec: 'Code Expiry (sec)',
  scan_code_max_attempts: 'Max Wrong Attempts',
  scan_override_enabled: 'Allow Admin Override',
  scan_early_minutes: 'Early Arrival Grace (min)',
  scan_late_minutes: 'Late Arrival Grace (min)',
  scan_no_show_minutes: 'No-show Threshold (min)',
  scan_overrun_grace_min: 'Overrun Grace (min)',
  scan_overrun_round_min: 'Overrun Round-up (min)',
  time_credit_expiry_days: 'Time Credit Expiry (days)',
  time_credit_min_use_min: 'Min Time Credit Use (min)',
};

export function SettingsClient({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState<Record<string, unknown>>(() => {
    const m: Record<string, unknown> = {};
    for (const r of initial) m[r.key] = r.value;
    return m;
  });
  const [saving, setSaving] = useState<string | null>(null);

  const handleSave = async (key: string, value: unknown) => {
    setSaving(key);
    try {
      await updateSetting(key, value);
      invalidateSettingsCache();
      setRows((r) => ({ ...r, [key]: value }));
      toast.success('Saved', `${LABELS[key] ?? key} updated`);
    } catch (e) {
      toast.error('Failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-neutral-400">Every value here drives the system. No code change needed.</p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>{section.icon}</span>{section.title}
          </h2>
          <div className="space-y-3">
            {section.keys.map((k) => (
              <SettingRow
                key={k}
                settingKey={k}
                label={LABELS[k] ?? k}
                value={rows[k]}
                saving={saving === k}
                onSave={handleSave}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SettingRow({
  settingKey, label, value, saving, onSave,
}: {
  settingKey: string;
  label: string;
  value: unknown;
  saving: boolean;
  onSave: (key: string, value: unknown) => void;
}) {
  const [draft, setDraft] = useState(value);

  const type =
    typeof value === 'boolean' ? 'boolean'
    : typeof value === 'number' ? 'number'
    : Array.isArray(value) ? 'array'
    : 'text';

  const display =
    typeof draft === 'boolean' ? String(draft)
    : Array.isArray(draft) ? draft.join(', ')
    : String(draft ?? '');

  const commit = () => {
    if (type === 'boolean') return;
    let parsed: unknown = draft;
    if (type === 'number') {
      const n = Number(draft);
      if (Number.isNaN(n)) return toast.error('Invalid number');
      parsed = n;
    } else if (type === 'array') {
      parsed = display.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n));
    }
    if (JSON.stringify(parsed) !== JSON.stringify(value)) onSave(settingKey, parsed);
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-neutral-900 pb-3 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white">{label}</div>
        <div className="text-xs text-neutral-500 font-mono truncate">{settingKey}</div>
      </div>

      {type === 'boolean' ? (
        <button
          onClick={() => {
            const next = !draft;
            setDraft(next);
            onSave(settingKey, next);
          }}
          disabled={saving}
          className={`min-w-[80px] rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            draft ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-400'
          }`}
        >
          {draft ? 'ON' : 'OFF'}
        </button>
      ) : (
        <input
          value={display}
          onChange={(e) => setDraft(
            type === 'number' ? Number(e.target.value) : type === 'array' ? e.target.value : e.target.value
          )}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          disabled={saving}
          className="w-44 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
        />
      )}
    </div>
  );
}