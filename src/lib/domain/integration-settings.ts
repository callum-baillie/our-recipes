import { z } from 'zod';
export const syncIntervals = [
  { value: 0, label: 'Manual only' },
  { value: 15, label: 'Every 15 minutes' },
  { value: 30, label: 'Every 30 minutes' },
  { value: 60, label: 'Every hour' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Daily' },
] as const;
export const syncIntervalSchema = z
  .number()
  .int()
  .refine(
    (value) => syncIntervals.some((option) => option.value === value),
    'Choose an available sync interval.',
  );
export type IntegrationState = {
  accounts: Array<{
    id: string;
    label: string;
    provider: string;
    syncIntervalMinutes: number;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    nextSyncAt: string | null;
    lastError: string | null;
    syncing: boolean;
    devices: Array<{ config: string; name: string; model: string }>;
    mappings: Array<{
      id: string;
      profileId: string;
      profileName: string;
      deviceConfig: string;
      scaleUserId: string;
    }>;
  }>;
  profiles: Array<{ id: string; name: string; weightTrackingEnabled: boolean }>;
  sharedMappings: Array<{ id: string; profileName: string }>;
  canAssignHousehold: boolean;
};
