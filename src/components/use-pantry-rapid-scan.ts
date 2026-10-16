'use client';
import { useEffect, useRef, useState } from 'react';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { FoodRecord } from '@/lib/domain/food-data';

type LocalProduct = { id: string; displayName: string; brand: string };
export type RapidScanEntry = {
  barcode: string;
  count: number;
  operationId: string;
  record?: FoodRecord;
  local?: LocalProduct;
  status: 'loading' | 'ready' | 'unknown' | 'error';
  error?: string;
  saveAttempted?: boolean;
};
async function post(url: string, body: unknown, signal?: AbortSignal, key?: string) {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message ?? 'This item could not be saved.');
  return result;
}

/** Camera counts are pending until explicitly added. Uncertain saves reuse the same operation key. */
export function usePantryRapidScan(
  onImported?: (
    product: { id: string; displayName: string },
    options?: { keepOpen?: boolean },
  ) => void,
) {
  const pending = useRef(new Map<string, RapidScanEntry>());
  const mounted = useRef(true);
  const saving = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const [entries, setEntries] = useState<RapidScanEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    mounted.current = true;
    const controllers = requests.current;
    return () => {
      mounted.current = false;
      controllers.forEach((request) => request.abort());
    };
  }, []);
  function publish() {
    if (mounted.current) setEntries([...pending.current.values()]);
  }
  async function scan(barcode: string) {
    if (saving.current) return;
    const previous = pending.current.get(barcode);
    if (previous) {
      if (previous.saveAttempted) {
        setMessage('Retry or remove the failed item before scanning it again.');
        return;
      }
      pending.current.set(barcode, { ...previous, count: Math.min(10000, previous.count + 1) });
      publish();
      return;
    }
    if (pending.current.size >= 100) {
      setMessage('Add or remove the queued items before scanning more.');
      return;
    }
    pending.current.set(barcode, {
      barcode,
      count: 1,
      operationId: createClientUuid(),
      status: 'loading',
    });
    publish();
    const controller = new AbortController();
    requests.current.add(controller);
    try {
      const result = await post(
        '/api/v1/food-data/barcode-lookups',
        { barcode, language: navigator.language.slice(0, 2), compareUsda: false },
        controller.signal,
      );
      const current = pending.current.get(barcode);
      if (!current || !mounted.current) return;
      const record = result.preferred ?? result.alternatives?.[0];
      const local = result.localProduct;
      pending.current.set(barcode, {
        ...current,
        record,
        local,
        status: record || local ? 'ready' : 'unknown',
      });
      publish();
    } catch (error) {
      const current = pending.current.get(barcode);
      if (current && mounted.current && !controller.signal.aborted) {
        pending.current.set(barcode, {
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : 'Lookup failed.',
        });
        publish();
      }
    } finally {
      requests.current.delete(controller);
    }
  }
  function remove(barcode: string) {
    if (saving.current) return;
    pending.current.delete(barcode);
    publish();
  }
  function quantity(barcode: string, count: number) {
    const current = pending.current.get(barcode);
    if (!current || current.saveAttempted || saving.current) return;
    pending.current.set(barcode, {
      ...current,
      count: Math.max(1, Math.min(10000, Math.trunc(count) || 1)),
    });
    publish();
  }
  async function addAll(locationId: string) {
    if (saving.current || !locationId) return;
    saving.current = true;
    setBusy(true);
    setMessage('');
    let added = 0;
    let lastProduct: { id: string; displayName: string } | null = null;
    try {
      for (const entry of [...pending.current.values()].filter(
        (entry) => entry.status === 'ready',
      )) {
        pending.current.set(entry.barcode, { ...entry, saveAttempted: true });
        publish();
        const batch = {
          quantityRemaining: entry.count,
          originalQuantity: entry.count,
          unit: 'each',
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
          source: 'Barcode scan',
          notes: '',
          excludeFromGrocery: false,
          sourceRecipeId: '',
          sourceMealPlanEntryId: '',
          sourceShoppingListItemId: '',
        };
        try {
          if (entry.local) {
            await post(
              '/api/v1/pantry/batches',
              { ...batch, productId: entry.local.id },
              undefined,
              entry.operationId,
            );
            lastProduct = entry.local;
          } else if (entry.record) {
            const record = entry.record;
            const result = await post(
              '/api/v1/pantry/catalog-imports',
              {
                operationId: entry.operationId,
                selection: {
                  provider: record.provider,
                  recordId: record.providerRecordId,
                  expectedCanonicalGtin: record.canonicalGtin,
                },
                product: {
                  displayName: record.displayName.slice(0, 160),
                  brand: record.brand.slice(0, 120),
                  variant: '',
                  category: (record.categories[0] ?? '').slice(0, 80),
                  defaultInventoryUnit: 'each',
                  defaultPackageAmount: null,
                  defaultPackageUnit: '',
                  allergens: record.allergens,
                  dietaryTags: record.labels,
                },
                batches: [batch],
              },
              undefined,
              entry.operationId,
            );
            lastProduct = result.product ?? {
              id: result.productId ?? '',
              displayName: record.displayName,
            };
          }
          added += entry.count;
          pending.current.delete(entry.barcode);
          publish();
        } catch (error) {
          pending.current.set(entry.barcode, {
            ...entry,
            saveAttempted: true,
            status: 'ready',
            error: error instanceof Error ? error.message : 'Save failed. Retry this item.',
          });
          publish();
        }
      }
      if (lastProduct) onImported?.(lastProduct, { keepOpen: true });
      setMessage(
        added
          ? `Added ${added} items. Any unresolved scans remain below.`
          : 'No items were added. Review the messages below.',
      );
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { entries, busy, message, scan, remove, quantity, addAll };
}
