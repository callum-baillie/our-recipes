/** One recorded scan as shown on the scan list page. */
export type ScanSessionEntry = {
  id: string;
  time: string;
  kind: 'added' | 'removed' | 'cooked' | 'adjusted' | 'other';
  state: 'saved' | 'undone' | 'review';
  title: string;
  detail: string;
  barcode: string | null;
  quantity: number | null;
  unit: string;
  /** The recorded transaction can still be reversed as a unit. */
  canUndo: boolean;
  /** The pantry batch this scan created has changed since the scan was recorded. */
  edited: boolean;
  batch: {
    id: string;
    version: number;
    quantity: number | null;
    unit: string;
    location: string;
    status: string;
  } | null;
};

export type ScanSession = {
  stationId: string;
  name: string;
  stale: boolean;
  readerConnected: boolean;
  mode: string;
  bindingId: string;
  instanceId: string;
  serverTime: number;
  since: number;
  entries: ScanSessionEntry[];
};

export const INACTIVE_BATCH_STATUSES = ['depleted', 'discarded', 'donated'];
