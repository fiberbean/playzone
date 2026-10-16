// lib/types/maintenance.ts

export type MaintenanceStatus = 'active' | 'resolved';

export interface ConsoleMaintenance {
  id: string;
  console_id: string;
  reason: string;
  description: string | null;
  status: MaintenanceStatus;

  started_at: string;
  expected_end_at: string | null;
  ended_at: string | null;

  cost: number;
  vendor: string | null;
  reported_by: string | null;
  resolved_by: string | null;

  created_at: string;
}

export interface ConsoleMaintenanceWithConsole extends ConsoleMaintenance {
  console?: { id: string; name: string; type: string };
}