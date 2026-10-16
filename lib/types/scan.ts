// lib/types/scan.ts

export type ScanType = 'in' | 'out';
export type ScanMethod = 'qr' | 'barcode' | 'manual' | 'override';

export interface ScanChallenge {
  id: string;
  booking_id: string;
  scan_type: ScanType;
  code: string;
  expires_at: string;
  verified_at: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

export interface ScanLog {
  id: string;
  booking_id: string;
  scanned_by: string | null;
  scan_type: ScanType;
  method: ScanMethod;
  scanned_at: string;
  device: string | null;
  note: string | null;
}