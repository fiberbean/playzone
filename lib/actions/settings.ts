// lib/actions/settings.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { POLICY_DEFAULTS } from '@/lib/constants/policies';

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', key)
    .single();

  if (!data) return POLICY_DEFAULTS[key as keyof typeof POLICY_DEFAULTS] as T;
  return data.value as T;
}

export async function updateSetting(key: string, value: unknown) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') throw new Error('Not admin');

  const { error } = await supabase
    .from('settings')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);

  if (error) throw error;
  revalidatePath('/playzonemama/settings');
}

export async function getAllSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('key, value');
  const map = { ...POLICY_DEFAULTS } as Record<string, unknown>;
  for (const row of data ?? []) {
    if (row.key in POLICY_DEFAULTS) map[row.key] = row.value;
  }
  return map;
}