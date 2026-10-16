// lib/types/settings.ts

export interface Setting {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export type SettingsMap = Record<string, unknown>;

export interface GameCategory {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface ConsoleType {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}

export interface MaintenanceReason {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
}