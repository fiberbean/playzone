// lib/utils/settings.ts
import { createClient } from '@/lib/supabase/server';
import { POLICY_DEFAULTS, PolicyKey } from '@/lib/constants/policies';

export type AppSettings = typeof POLICY_DEFAULTS;

/**
 * Load all settings from DB, merged with defaults.
 * Server-side helper. Use `getSetting(key)` for one-off reads.
 */
export async function loadSettings(): Promise<AppSettings> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('settings')
    .select('key, value');

  if (error || !data) return { ...POLICY_DEFAULTS };

  const merged = { ...POLICY_DEFAULTS } as Record<string, unknown>;
  for (const row of data) {
    if (row.key in POLICY_DEFAULTS) {
      merged[row.key] = row.value;
    }
  }
  return merged as AppSettings;
}

export function getDefault<K extends PolicyKey>(key: K): AppSettings[K] {
  return POLICY_DEFAULTS[key];
}