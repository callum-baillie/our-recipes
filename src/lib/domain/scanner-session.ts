/** One recorded scan as shown on the scan list page. */
export type ScanSessionEntry = {
  id: string;
  time: string;
  kind: 'added' | 'removed' | 'cooked' | 'adjusted' | 'other';
  state: 'saved' | 'undone' | 'review';
  /** A review scan whose barcode has since been saved as a Pantry product. */
  resolved: boolean;
  title: string;
  detail: string;
  barcode: string | null;
  recipeHref?: string;
  /** Checksum-valid retail barcode used to look up a product photo, if any. */
  gtin: string | null;
  brand: string;
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
    /** Recorded best-before date, YYYY-MM-DD. */
    bestBefore: string | null;
  } | null;
};

export type ScanSession = {
  stationId: string;
  name: string;
  stale: boolean;
  readerConnected: boolean;
  mode: string;
  mealControl?: { bootId: string; revision: number; plannedFor: string | null };
  bindingId: string;
  instanceId: string;
  serverTime: number;
  since: number;
  entries: ScanSessionEntry[];
};

export const INACTIVE_BATCH_STATUSES = ['depleted', 'discarded', 'donated'];
