'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionItem } from '@/components/scan-session-cards';
import { useToast } from '@/components/toast-provider';
import { createClientUuid } from './client-uuid';
import { defaultLocation } from './pantry-locations';
import {
  batchInfo,
  fetchBatchInfo,
  pantryRequest,
  removeBatch,
  setBatchQuantity,
  undoBatch,
  type BatchInfo,
} from './pantry-batch';
import { normalizeGtin, retailGtin, type FoodRecord } from '@/lib/domain/food-data';
import { inventoryUnitDimension } from '@/lib/domain/inventory-units';

export type PantryProductSummary = {
  id: string;
  displayName: string;
  brand: string;
  defaultInventoryUnit: string;
  defaultPackageAmount: number | null;
  defaultPackageUnit: string;
};

type CameraRecord = {
  barcode: string;
  title: string;
  brand: string;
  gtin: string | null;
  time: string;
  status: 'looking' | 'saved' | 'unknown' | 'error';
  message: string;
  /** Scans of this barcode this session. */
  count: number;
  batch: BatchInfo | null;
  /** Quantity one scan adds, in the batch's own unit. */
  addQty: number;
  removed: boolean;
  motion?: 'in' | 'bump' | undefined;
};

type LookupResult = {
  preferred?: FoodRecord | null;
  alternatives?: FoodRecord[];
  localProduct?: { id: string; displayName: string; brand: string } | null;
};

const MOTION_MS = 1700;

function photoCode(barcode: string) {
  try {
    return retailGtin(normalizeGtin(barcode).canonicalGtin);
  } catch {
    return null;
  }
}

/** Fields every new batch needs; only amount, unit and place vary. */
const newBatch = (quantity: number, unit: string, locationId: string) => ({
  quantityRemaining: quantity,
  originalQuantity: quantity,
  unit,
  locationId,
  packageCount: null,
  amountPerPackage: null,
  packageUnit: '',
  approximateState: null,
  sublocation: '',
  purchaseDate: '',
  bestBeforeDate: '',
  useByDate: '',
  sellByDate: '',
  openedDate: '',
  frozenDate: '',
  thawedDate: '',
  preparedDate: '',
  expiryPrecision: 'unknown',
  status: 'unopened',
  purchasePriceCents: null,
  source: 'Camera scan',
  notes: '',
  excludeFromGrocery: false,
  sourceRecipeId: '',
  sourceMealPlanEntryId: '',
  sourceShoppingListItemId: '',
});

/**
 * The camera behaves like the handheld scanner: every scan goes straight into the pantry, and
 * scanning the same barcode again adds another. Lines are edited afterwards, never confirmed first.
 */
export function useCameraScanSession({
  locations,
  products,
  onStockChanged,
}: {
  locations: Array<{ id: string; path: string; storageType: string }>;
  products: PantryProductSummary[];
  onStockChanged?: () => void;
}) {
  const { showToast } = useToast();
  const [records, setRecords] = useState<CameraRecord[]>([]);
  const [locationId, setLocationId] = useState(() => defaultLocation(locations)?.id ?? '');
  const map = useRef(new Map<string, CameraRecord>());
  const chains = useRef(new Map<string, Promise<void>>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const where = useRef(locationId);
  useEffect(() => {
    where.current = locationId;
  }, [locationId]);

  useEffect(() => {
    const running = timers.current;
    return () => running.forEach((timer) => clearTimeout(timer));
  }, []);

  const publish = useCallback(() => {
    setRecords([...map.current.values()].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)));
  }, []);

  const patch = useCallback(
    (barcode: string, change: Partial<CameraRecord>) => {
      const current = map.current.get(barcode);
      if (!current) return;
      map.current.set(barcode, { ...current, ...change });
      publish();
      if (change.motion) {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          const latest = map.current.get(barcode);
          if (latest && latest.motion === change.motion) {
            map.current.set(barcode, { ...latest, motion: undefined });
            publish();
          }
        }, MOTION_MS);
        timers.current.add(timer);
      }
    },
    [publish],
  );

  async function create(barcode: string) {
    const gtin = photoCode(barcode);
    const placeholder: CameraRecord = {
      barcode,
      title: barcode,
      brand: '',
      gtin,
      time: new Date().toISOString(),
      status: 'looking',
      message: '',
      count: 1,
      batch: null,
      addQty: 1,
      removed: false,
      motion: 'in',
    };
    map.current.set(barcode, placeholder);
    publish();
    const destination = where.current || locations[0]?.id || '';
    try {
      const lookup = await pantryRequest<LookupResult>(
        '/api/v1/food-data/barcode-lookups',
        'POST',
        { barcode, language: navigator.language.slice(0, 2), compareUsda: false },
      );
      const catalog = lookup.preferred ?? lookup.alternatives?.[0] ?? null;
      if (lookup.localProduct) {
        const known = products.find((p) => p.id === lookup.localProduct!.id);
        let unit = 'each';
        let quantity = 1;
        if (known) {
          if (inventoryUnitDimension(known.defaultInventoryUnit) === 'count') {
            unit = known.defaultInventoryUnit;
          } else if (known.defaultPackageAmount && known.defaultPackageUnit) {
            unit = known.defaultPackageUnit;
            quantity = known.defaultPackageAmount;
          } else {
            throw new Error(
              `Set a package size for ${known.displayName} in your pantry, then scan it again.`,
            );
          }
        }
        const { batch } = await pantryRequest<{ batch: Parameters<typeof batchInfo>[0] }>(
          '/api/v1/pantry/batches',
          'POST',
          { ...newBatch(quantity, unit, destination), productId: lookup.localProduct.id },
          true,
        );
        patch(barcode, {
          title: lookup.localProduct.displayName,
          brand: lookup.localProduct.brand,
          status: 'saved',
          batch: batchInfo(batch),
          addQty: quantity,
        });
      } else if (catalog) {
        const operationId = createClientUuid();
        const saved = await pantryRequest<{ batchIds: string[] }>(
          '/api/v1/pantry/catalog-imports',
          'POST',
          {
            operationId,
            selection: {
              provider: catalog.provider,
              recordId: catalog.providerRecordId,
              expectedCanonicalGtin: catalog.canonicalGtin,
              catalogRef: catalog.catalogRef,
            },
            product: {
              displayName: catalog.displayName.slice(0, 160),
              brand: catalog.brand.slice(0, 120),
              variant: '',
              category: (catalog.categories[0] ?? '').slice(0, 80),
              defaultInventoryUnit: 'package',
              defaultPackageAmount: 1,
              defaultPackageUnit: 'package',
              allergens: catalog.allergens,
              dietaryTags: catalog.labels,
            },
            batches: [newBatch(1, 'package', destination)],
          },
        );
        patch(barcode, {
          title: catalog.displayName,
          brand: catalog.brand,
          status: 'saved',
          batch: await fetchBatchInfo(saved.batchIds[0]!),
          addQty: 1,
        });
      } else {
        patch(barcode, { status: 'unknown', title: 'Unrecognised barcode' });
        return;
      }
      onStockChanged?.();
    } catch (error) {
      patch(barcode, {
        status: 'error',
        title: barcode,
        message: error instanceof Error ? error.message : 'This scan could not be added.',
      });
    }
  }

  async function process(barcode: string) {
    const current = map.current.get(barcode);
    if (current?.status === 'unknown') {
      patch(barcode, { count: current.count + 1, time: new Date().toISOString(), motion: 'bump' });
      return;
    }
    if (current?.status === 'saved' && current.batch && !current.removed) {
      try {
        // Another edit may have moved the batch on since the last scan.
        const fresh = await fetchBatchInfo(current.batch.id);
        const next = (fresh.quantity ?? 0) + current.addQty;
        const saved = await setBatchQuantity(fresh, next);
        patch(barcode, {
          batch: { ...fresh, quantity: next, version: saved.batch?.version ?? fresh.version + 1 },
          count: current.count + 1,
          time: new Date().toISOString(),
          motion: 'bump',
        });
        onStockChanged?.();
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'That scan could not be added.',
          'error',
        );
      }
      return;
    }
    await create(barcode);
  }

  /** Queue a scan. Repeat scans of one barcode run in order so none is lost. */
  function scan(barcode: string) {
    const previous = chains.current.get(barcode) ?? Promise.resolve();
    chains.current.set(
      barcode,
      previous.then(() => process(barcode)).catch(() => undefined),
    );
  }

  async function refresh(barcode: string) {
    const current = map.current.get(barcode);
    if (!current?.batch) return;
    try {
      patch(barcode, { batch: await fetchBatchInfo(current.batch.id) });
    } catch {
      /* The next scan or edit refreshes it. */
    }
    onStockChanged?.();
  }

  async function remove(barcode: string) {
    const current = map.current.get(barcode);
    if (!current?.batch) return;
    const batch = current.batch;
    try {
      const removed = await removeBatch(batch);
      patch(barcode, { removed: true });
      onStockChanged?.();
      const close = showToast(`Removed ${current.title}.`, 'success', {
        autoDismissMs: 8000,
        actions: [
          {
            label: 'Undo',
            onClick: async () => {
              close();
              try {
                await undoBatch({
                  id: batch.id,
                  version: removed.batch?.version ?? batch.version + 1,
                });
                patch(barcode, { removed: false, batch: await fetchBatchInfo(batch.id) });
                onStockChanged?.();
              } catch (error) {
                showToast(
                  error instanceof Error ? error.message : 'That could not be undone.',
                  'error',
                );
              }
            },
          },
        ],
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That could not be removed.', 'error');
    }
  }

  /** A barcode that has just been named becomes an ordinary saved line. */
  function adopt(barcode: string, saved: { product: { displayName: string }; batch: BatchInfo }) {
    patch(barcode, {
      status: 'saved',
      title: saved.product.displayName,
      batch: saved.batch,
      addQty: 1,
    });
    onStockChanged?.();
  }

  function clear() {
    map.current.clear();
    chains.current.clear();
    publish();
  }

  const items: SessionItem[] = records
    .filter((record) => record.status !== 'unknown')
    .map((record) => ({
      key: `camera:${record.barcode}`,
      source: 'camera',
      title: record.status === 'looking' ? `Looking up ${record.barcode}…` : record.title,
      brand: record.brand,
      gtin: record.gtin,
      time: record.time,
      looking: record.status === 'looking',
      batch: record.status === 'saved' ? record.batch : null,
      removed: record.removed,
      amountLabel: record.status === 'error' ? record.message : '',
      step: record.addQty,
      motion: record.motion,
      canPutBack: false,
    }));
  const unnamed = records
    .filter((record) => record.status === 'unknown')
    .map((record) => ({ barcode: record.barcode, count: record.count }));

  return {
    items,
    unnamed,
    locationId,
    setLocationId,
    scan,
    refresh: (key: string) => refresh(key.replace(/^camera:/, '')),
    remove: (key: string) => remove(key.replace(/^camera:/, '')),
    adopt,
    clear,
    count: records.filter((r) => r.status === 'saved' && !r.removed).length,
  };
}
