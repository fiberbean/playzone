// lib/hooks/useSettings.ts
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { POLICY_DEFAULTS } from '@/lib/constants/policies';

type SettingsMap = typeof POLICY_DEFAULTS;

let cache: SettingsMap | null = null;
let cacheTime = 0;
const CACHE_MS = 30_000;

export function useSettings(): { settings: SettingsMap; loading: boolean } {
  const [settings, setSettings] = useState<SettingsMap>(cache ?? POLICY_DEFAULTS);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache && Date.now() - cacheTime < CACHE_MS) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from('settings').select('key, value');
      const map = { ...POLICY_DEFAULTS } as Record<string, unknown>;
      for (const row of data ?? []) {
        if (row.key in POLICY_DEFAULTS) map[row.key] = row.value;
      }
      cache = map as SettingsMap;
      cacheTime = Date.now();
      setSettings(cache);
      setLoading(false);
    })();
  }, []);

  return { settings, loading };
}

export function invalidateSettingsCache() {
  cache = null;
  cacheTime = 0;
}