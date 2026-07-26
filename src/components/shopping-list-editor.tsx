'use client';

import {
  ArrowDown,
  ArrowUp,
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Lightbulb,
  PackageOpen,
  Plus,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  StickyNote,
  Store,
  Trash2,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';

import { useToast } from '@/components/toast-provider';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { FoodRecord } from '@/lib/domain/food-data';
import { rankShoppingScanMatches } from '@/lib/domain/shopping-scan-match';
import type { ShoppingListDetail } from '@/lib/services/planning-service';

import styles from './shopping-list-editor.module.css';

type Item = ShoppingListDetail['items'][number];
type ShoppingState = Item['shoppingState'];
type Filter = 'all' | 'to_buy' | 'in_cart' | 'cant_find' | 'sourced';

const BarcodeScanner = dynamic(
  () => import('@/components/barcode-scanner').then((module) => module.BarcodeScanner),
  {
    loading: () => <p role="status">Loading scanner…</p>,
    ssr: false,
  },
);

type PantryOptions = {
  products: Array<{ id: string; displayName: string }>;
  locations: Array<{ id: string; path: string }>;
};

type IntakeDraft = {
  productId: string;
  locationId: string;
  quantity: string;
  unit: string;
  intakeMode: 'partial' | 'complete';
  packageCount: string;
  amountPerPackage: string;
  packageUnit: string;
  sublocation: string;
  purchaseDate: string;
  bestBeforeDate: string;
  useByDate: string;
  sellByDate: string;
  purchasePriceCents: string;
  store: string;
  source: string;
  notes: string;
  operationKey?: string;
  status: string;
};

function emptyIntakeDraft(item: Item, locationId = ''): IntakeDraft {
  return {
    productId: item.pantry?.productId ?? '',
    locationId,
    quantity: item.quantity === null ? '' : String(item.quantity),
    unit: item.unit,
    intakeMode: 'partial',
    packageCount: '',
    amountPerPackage: '',
    packageUnit: '',
    sublocation: '',
    purchaseDate: '',
    bestBeforeDate: '',
    useByDate: '',
    sellByDate: '',
    purchasePriceCents: '',
    store: '',
    source: 'shopping-list-purchase',
    notes: '',
    status: '',
  };
}

export function pantryOptionsFromSummary(body: unknown): PantryOptions {
  const dashboard =
    typeof body === 'object' && body !== null && 'dashboard' in body
      ? (body as { dashboard?: Partial<PantryOptions> }).dashboard
      : undefined;
  return {
    products: Array.isArray(dashboard?.products) ? dashboard.products : [],
    locations: Array.isArray(dashboard?.locations) ? dashboard.locations : [],
  };
}

type ShoppingContribution = {
  mealPlanEntryId: string;
  plannedFor: string;
  recipeId: string;
  recipeTitle: string;
  servings: number;
  ingredientId: string;
  contributionQuantity: number | null;
  contributionUnit: string;
};

export function pantryContributions(item: {
  pantry: ({ demandState: string; provenance: string } & Record<string, unknown>) | null;
}): ShoppingContribution[] {
  if (!item.pantry || item.pantry.demandState === 'manual') return [];
  try {
    const parsed = JSON.parse(item.pantry.provenance) as { contributions?: unknown };
    return Array.isArray(parsed.contributions)
      ? (parsed.contributions as ShoppingContribution[])
      : [];
  } catch {
    return [];
  }
}

type PantryLabelDetail = Pick<
  NonNullable<Item['pantry']>,
  | 'demandState'
  | 'manualQuantityOverride'
  | 'manualUnitOverride'
  | 'manualItemOverride'
  | 'manualNoteOverride'
  | 'shortageQuantity'
  | 'generatedUnit'
> &
  Partial<Pick<NonNullable<Item['pantry']>, 'coverageState'>> &
  Record<string, unknown>;

export function pantryStateLabel(item: { pantry: PantryLabelDetail | null }): string {
  const detail = item.pantry;
  if (!detail) return '';
  const manuallyEdited =
    detail.manualQuantityOverride ||
    detail.manualUnitOverride ||
    detail.manualItemOverride ||
    detail.manualNoteOverride;
  if (detail.demandState === 'manual') return 'Obsolete generated demand · kept as a manual item';
  if (detail.coverageState === 'ignored') return 'Pantry stock ignored · recalculate to refresh';
  if (detail.coverageState === 'inaccurate') return 'Pantry inventory marked inaccurate · review';
  if (detail.coverageState === 'covered') return 'Covered · no purchase currently needed';
  if (detail.demandState === 'uncertain')
    return manuallyEdited
      ? 'Manual value · automatic demand remains uncertain'
      : 'Uncertain generated demand · no numeric shortage claimed';
  if (manuallyEdited)
    return `Manual override · generated shortage is ${detail.shortageQuantity} ${detail.generatedUnit}`;
  return `Generated Pantry shortage · ${detail.shortageQuantity} ${detail.generatedUnit}`;
}

export function createIntakeOperationTracker(createKey: () => string) {
  const keys = new Map<string, string>();
  return {
    begin(itemId: string): string {
      const existing = keys.get(itemId);
      if (existing) return existing;
      const created = createKey();
      keys.set(itemId, created);
      return created;
    },
    current(itemId: string): string | undefined {
      return keys.get(itemId);
    },
    succeeded(itemId: string, completedKey: string): string {
      const current = keys.get(itemId);
      if (current !== completedKey) {
        if (current) return current;
        const created = createKey();
        keys.set(itemId, created);
        return created;
      }
      const next = createKey();
      keys.set(itemId, next);
      return next;
    },
  };
}

type IntakeOperationTracker = ReturnType<typeof createIntakeOperationTracker>;

export async function runTrackedIntakeOperation<T>(
  tracker: IntakeOperationTracker,
  itemId: string,
  dispatch: (operationKey: string) => Promise<{ confirmed: boolean; value: T }>,
): Promise<{
  operationKey: string;
  nextOperationKey: string;
  outcome: 'confirmed' | 'rejected' | 'unknown' | 'stale';
  value?: T;
}> {
  const operationKey = tracker.begin(itemId);
  try {
    const response = await dispatch(operationKey);
    const currentOperationKey = tracker.current(itemId) ?? operationKey;
    if (currentOperationKey !== operationKey)
      return { operationKey, nextOperationKey: currentOperationKey, outcome: 'stale' };
    if (!response.confirmed)
      return {
        operationKey,
        nextOperationKey: tracker.current(itemId) ?? operationKey,
        outcome: 'rejected',
        value: response.value,
      };
    return {
      operationKey,
      nextOperationKey: tracker.succeeded(itemId, operationKey),
      outcome: 'confirmed',
      value: response.value,
    };
  } catch {
    return {
      operationKey,
      nextOperationKey: tracker.current(itemId) ?? operationKey,
      outcome: 'unknown',
    };
  }
}

function normalizedState(item: Item): ShoppingState {
  return item.checked
    ? 'sourced'
    : item.shoppingState === 'sourced'
      ? 'to_buy'
      : item.shoppingState;
}

function itemAmount(item: Item): string {
  return (
    [item.quantity ?? '', item.unit].filter((value) => value !== '').join(' ') || 'Quantity not set'
  );
}

export function ShoppingListEditor({ list }: { list: ShoppingListDetail }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState(() =>
    list.items.map((item) => ({ ...item, shoppingState: normalizedState(item) })),
  );
  const [newItem, setNewItem] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedSupermarketId, setSelectedSupermarketId] = useState(
    list.supermarketProfileId ?? '',
  );
  const alternativeProfiles = list.supermarketProfiles.filter(
    (profile) => profile.id !== list.supermarketProfileId,
  );
  const [retrySupermarketId, setRetrySupermarketId] = useState(alternativeProfiles[0]?.id ?? '');
  const [busy, setBusy] = useState('');
  const [mobileAddOpen, setMobileAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [scanRecord, setScanRecord] = useState<FoodRecord | null>(null);
  const [scanStatus, setScanStatus] = useState('');
  const [scanQuantity, setScanQuantity] = useState('1');
  const [substituteItem, setSubstituteItem] = useState<Item | null>(null);
  const [substituteQuery, setSubstituteQuery] = useState('');
  const [substituteResults, setSubstituteResults] = useState<FoodRecord[]>([]);
  const scanDialogRef = useRef<HTMLDialogElement>(null);
  const reviewDialogRef = useRef<HTMLDialogElement>(null);
  const substituteDialogRef = useRef<HTMLDialogElement>(null);
  const [pantryOptions, setPantryOptions] = useState<PantryOptions>({
    products: [],
    locations: [],
  });
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, IntakeDraft>>({});
  const [operationTracker] = useState(() => createIntakeOperationTracker(createClientUuid));

  useEffect(() => {
    void fetch('/api/v1/pantry/summary')
      .then((response) => response.json())
      .then((body) => setPantryOptions(pantryOptionsFromSummary(body)));
  }, []);

  useEffect(() => {
    if (!list.settings.keepScreenAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    void navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (disposed) void sentinel.release();
        else lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      if (lock) void lock.release();
    };
  }, [list.settings.keepScreenAwake]);

  useEffect(() => {
    const dialog = scanDialogRef.current;
    if (scanOpen && dialog && !dialog.open) dialog.showModal();
    if (!scanOpen && dialog?.open) dialog.close();
  }, [scanOpen]);

  useEffect(() => {
    const dialog = reviewDialogRef.current;
    if (reviewOpen && dialog && !dialog.open) dialog.showModal();
    if (!reviewOpen && dialog?.open) dialog.close();
  }, [reviewOpen]);

  useEffect(() => {
    const dialog = substituteDialogRef.current;
    if (substituteItem && dialog && !dialog.open) dialog.showModal();
    if (!substituteItem && dialog?.open) dialog.close();
  }, [substituteItem]);

  const aisleById = useMemo(
    () => new Map(list.aisles.map((aisle) => [aisle.id, aisle.name])),
    [list.aisles],
  );
  const searched = items.filter((item) =>
    item.item.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const itemsByState = (state: ShoppingState) =>
    searched.filter((item) => normalizedState(item) === state);
  const toBuy = itemsByState('to_buy');
  const inCart = itemsByState('in_cart');
  const cantFind = itemsByState('cant_find');
  const sourced = itemsByState('sourced');
  const total = items.length;
  const progressCount = items.filter((item) =>
    ['in_cart', 'sourced'].includes(normalizedState(item)),
  ).length;
  const remaining = items.filter((item) =>
    ['to_buy', 'cant_find'].includes(normalizedState(item)),
  ).length;
  const progress = total ? Math.round((progressCount / total) * 100) : 0;
  const filterOptions: ReadonlyArray<readonly [Filter, string, number]> = [
    ['all', 'All', total],
    ['to_buy', 'To buy', items.filter((item) => normalizedState(item) === 'to_buy').length],
    ['in_cart', 'In cart', items.filter((item) => normalizedState(item) === 'in_cart').length],
    [
      'cant_find',
      'Can’t find',
      items.filter((item) => normalizedState(item) === 'cant_find').length,
    ],
    ['sourced', 'Sourced', items.filter((item) => normalizedState(item) === 'sourced').length],
  ];
  const scanMatches = useMemo(
    () =>
      scanRecord
        ? rankShoppingScanMatches(
            items
              .filter((item) => !['in_cart', 'sourced'].includes(normalizedState(item)))
              .map((item) => ({ id: item.id, item: item.item })),
            scanRecord,
          )
        : [],
    [items, scanRecord],
  );

  const updateLocal = (id: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const save = async (item: Item) => {
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: item.quantity ?? '',
          unit: item.unit,
          item: item.item,
          note: item.note,
          aisleId: item.aisleId ?? '',
          checked: item.checked,
          shoppingState: item.shoppingState,
        }),
      });
      if (!response.ok) showToast(`Could not save ${item.item}.`, 'error');
      return response.ok;
    } catch {
      showToast(`Could not save ${item.item}. Check the connection and try again.`, 'error');
      return false;
    }
  };

  const setItemState = async (item: Item, state: ShoppingState) => {
    const changed = { ...item, shoppingState: state, checked: state === 'sourced' };
    updateLocal(item.id, changed);
    if (!(await save(changed))) updateLocal(item.id, item);
    else if (state === 'cant_find') showToast(`${item.item} moved to Can’t Find.`, 'success');
  };

  const lookupBarcode = async (value: string) => {
    const normalized = value.replace(/[\s-]+/gu, '');
    if (!normalized) return;
    setBusy('scan');
    setScanStatus('Looking up this barcode…');
    setScanRecord(null);
    try {
      const response = await fetch('/api/v1/food-data/barcode-lookups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: normalized,
          language: navigator.language.slice(0, 2),
          compareUsda: true,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        preferred?: FoodRecord | null;
        alternatives?: FoodRecord[];
        error?: { message?: string };
      } | null;
      const record = body?.preferred ?? body?.alternatives?.[0] ?? null;
      if (!response.ok || !record)
        throw new Error(body?.error?.message ?? 'No product was found for that barcode.');
      setBarcode(normalized);
      setScanRecord(record);
      setScanStatus('');
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : 'Barcode lookup failed.');
    } finally {
      setBusy('');
    }
  };

  const applyScanMatch = async (item: Item) => {
    if (!scanRecord) return;
    const quantity = Number(scanQuantity);
    const scanNote = [
      item.note,
      `Scanned ${scanRecord.displayName}${scanRecord.brand ? ` by ${scanRecord.brand}` : ''}`,
      Number.isFinite(quantity) && quantity > 0 ? `Cart quantity: ${quantity}` : '',
      scanRecord.canonicalGtin ? `GTIN ${scanRecord.canonicalGtin}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);
    const changed = { ...item, note: scanNote, shoppingState: 'in_cart' as const, checked: false };
    updateLocal(item.id, changed);
    if (await save(changed)) {
      showToast(`${item.item} identified and moved to In cart.`, 'success');
      setScanOpen(false);
      setScanRecord(null);
      setBarcode('');
      setScanQuantity('1');
    } else updateLocal(item.id, item);
  };

  const openSubstitute = (item: Item) => {
    setSubstituteItem(item);
    setSubstituteQuery(item.item);
    setSubstituteResults([]);
  };

  const searchSubstitutes = async (event: FormEvent) => {
    event.preventDefault();
    if (!substituteQuery.trim()) return;
    setBusy('substitute');
    try {
      const response = await fetch('/api/v1/food-data/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: substituteQuery,
          context: 'pantry',
          kind: 'any',
          page: 1,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        records?: FoodRecord[];
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(body?.error?.message ?? 'Could not find substitute products.');
      setSubstituteResults(body?.records?.slice(0, 8) ?? []);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not find substitute products.',
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  const applySubstitute = async (record: FoodRecord) => {
    if (!substituteItem) return;
    const original = substituteItem;
    const substituteName = record.genericName || record.displayName;
    const note = [
      original.note,
      `Substitute for ${original.item}: ${record.displayName}${record.brand ? ` by ${record.brand}` : ''}`,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);
    const changed = {
      ...original,
      item: substituteName,
      note,
      shoppingState: 'in_cart' as const,
      checked: false,
    };
    updateLocal(original.id, changed);
    if (await save(changed)) {
      showToast(`${record.displayName} added as the substitute.`, 'success');
      setSubstituteItem(null);
      setSubstituteResults([]);
    } else updateLocal(original.id, original);
  };

  const add = async () => {
    if (!newItem.trim()) return;
    setBusy('add');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: '',
          unit: '',
          item: newItem,
          note: '',
          checked: false,
          shoppingState: 'to_buy',
        }),
      });
      const body = (await response.json().catch(() => null)) as { item?: Item } | null;
      if (!response.ok || !body?.item) {
        showToast('Could not add that shopping item.', 'error');
        return;
      }
      setItems((current) => [...current, body.item!]);
      setNewItem('');
      setMobileAddOpen(false);
      showToast(`${body.item.item} added.`, 'success');
    } catch {
      showToast('Could not add that shopping item. Check the connection and try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const remove = async (item: Item) => {
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        showToast(`Could not remove ${item.item}.`, 'error');
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      showToast(`${item.item} removed.`, 'success');
    } catch {
      showToast(`Could not remove ${item.item}. Check the connection and try again.`, 'error');
    }
  };

  const reorder = async (item: Item, direction: -1 | 1) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[index], next[swap]] = [next[swap], next[index]];
    setItems(next);
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: next.map((entry) => entry.id) }),
      });
      if (response.ok) return;
      setItems(items);
      showToast('Could not save that item order.', 'error');
    } catch {
      setItems(items);
      showToast('Could not save that item order. Check the connection and try again.', 'error');
    }
  };

  const switchSupermarket = async (supermarketProfileId: string) => {
    setSelectedSupermarketId(supermarketProfileId);
    setBusy('store');
    const response = await fetch(`/api/v1/shopping-lists/${list.id}/supermarket-profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supermarketProfileId }),
    });
    if (response.ok) window.location.reload();
    else {
      setSelectedSupermarketId(list.supermarketProfileId ?? '');
      setBusy('');
      showToast('Could not change the supermarket for this list.', 'error');
    }
  };

  const retryAtAnotherStore = async () => {
    if (!retrySupermarketId) return;
    setBusy('retry');
    const response = await fetch(`/api/v1/shopping-lists/${list.id}/retry-store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supermarketProfileId: retrySupermarketId }),
    });
    const body = (await response.json().catch(() => null)) as {
      list?: { id: string };
      error?: { message?: string };
    } | null;
    if (response.ok && body?.list) router.push(`/lists/${body.list.id}`);
    else {
      showToast(body?.error?.message ?? 'Could not create a list for that store.', 'error');
      setBusy('');
    }
  };

  const updateIntakeDraft = (item: Item, changes: Partial<IntakeDraft>) =>
    setIntakeDrafts((current) => ({
      ...current,
      [item.id]: {
        ...(current[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id)),
        ...changes,
      },
    }));

  const updatePantryControl = async (
    item: Item,
    payload:
      | { action: 'ignore' | 'inaccurate' | 'reset' }
      | { action: 'extra'; quantity: number; unit: string },
  ) => {
    setBusy(`pantry-control:${item.id}`);
    try {
      const response = await fetch(
        `/api/v1/shopping-lists/${list.id}/items/${item.id}/pantry-controls`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        showToast(body?.error?.message ?? 'Could not update this Pantry calculation.', 'error');
        return;
      }
      showToast('Pantry calculation updated.', 'success');
      window.location.reload();
    } catch {
      showToast(
        'Could not update this Pantry calculation. Check the connection and try again.',
        'error',
      );
    } finally {
      setBusy('');
    }
  };

  const intake = async (item: Item) => {
    const draft = intakeDrafts[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id);
    const productId = item.pantry?.productId ?? draft.productId;
    const locationId = draft.locationId || pantryOptions.locations[0]?.id;
    if (!productId || !locationId || !draft.quantity || !draft.unit) {
      const message = 'Enter an exact quantity, unit, product, and location.';
      updateIntakeDraft(item, {
        productId: productId ?? '',
        locationId: locationId ?? '',
        status: message,
      });
      showToast(message, 'error');
      return;
    }
    const operationKey = operationTracker.begin(item.id);
    updateIntakeDraft(item, { operationKey, status: 'Adding to Pantry…' });
    const result = await runTrackedIntakeOperation(operationTracker, item.id, async (key) => {
      const response = await fetch(
        `/api/v1/shopping-lists/${list.id}/items/${item.id}/pantry-intake`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationKey: key,
            productId,
            locationId,
            quantity: draft.quantity,
            unit: draft.unit,
            intakeMode: draft.intakeMode,
            ...(draft.packageCount ? { packageCount: draft.packageCount } : {}),
            ...(draft.amountPerPackage ? { amountPerPackage: draft.amountPerPackage } : {}),
            packageUnit: draft.packageUnit,
            sublocation: draft.sublocation,
            ...(draft.purchaseDate ? { purchaseDate: draft.purchaseDate } : {}),
            ...(draft.bestBeforeDate ? { bestBeforeDate: draft.bestBeforeDate } : {}),
            ...(draft.useByDate ? { useByDate: draft.useByDate } : {}),
            ...(draft.sellByDate ? { sellByDate: draft.sellByDate } : {}),
            ...(draft.purchasePriceCents ? { purchasePriceCents: draft.purchasePriceCents } : {}),
            store: draft.store,
            source: draft.source,
            notes: draft.notes || `Purchased from ${list.name}`,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return { confirmed: response.ok, value: body };
    });
    if (result.outcome === 'confirmed') {
      updateIntakeDraft(item, {
        operationKey: result.nextOperationKey,
        status: 'Added to Pantry. A later purchase can be added separately.',
      });
      showToast(`${item.item} added to Pantry.`, 'success');
    } else {
      const message =
        result.outcome === 'unknown'
          ? 'The result is unknown. Retry to safely check the same Pantry operation.'
          : (result.value?.error?.message ?? 'Could not add to Pantry.');
      updateIntakeDraft(item, { status: message });
      showToast(message, 'error');
    }
  };

  const renderItem = (item: Item) => {
    const state = normalizedState(item);
    const intakeDraft =
      intakeDrafts[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id);
    const aisleName = item.aisleId ? aisleById.get(item.aisleId) : undefined;
    return (
      <article
        className={`${styles.item} ${state === 'sourced' ? styles.sourcedItem : ''}`}
        key={item.id}
      >
        <label
          className={`${styles.sourceToggle} ${state === 'sourced' ? styles.sourceToggleActive : ''}`}
        >
          <input
            type="checkbox"
            checked={state === 'sourced'}
            aria-label={`Mark ${item.item} complete`}
            onChange={() => void setItemState(item, state === 'sourced' ? 'to_buy' : 'sourced')}
          />
          {state === 'sourced' ? <Check size={18} /> : null}
        </label>
        <span className={styles.itemThumb}>
          <PackageOpen size={24} aria-hidden="true" />
        </span>
        <div className={styles.itemIdentity}>
          <strong>{item.item}</strong>
          <span>{itemAmount(item)}</span>
          <span className={`${styles.aisleBadge} ${!aisleName ? styles.unassignedBadge : ''}`}>
            {aisleName ?? 'Unassigned'}
          </span>
        </div>
        {state === 'cant_find' ? (
          <>
            <button
              className={`${styles.stateButton} ${styles.foundButton}`}
              type="button"
              onClick={() => void setItemState(item, 'in_cart')}
            >
              <CheckCircle2 size={19} /> <span>Found it!</span>
            </button>
            <button
              className={`${styles.stateButton} ${styles.substituteButton}`}
              type="button"
              onClick={() => openSubstitute(item)}
            >
              <PackageOpen size={19} /> <span>Substitute</span>
            </button>
          </>
        ) : (
          <>
            <button
              className={`${styles.stateButton} ${state === 'in_cart' ? styles.stateButtonActive : ''}`}
              type="button"
              onClick={() => void setItemState(item, state === 'in_cart' ? 'to_buy' : 'in_cart')}
            >
              <ShoppingCart size={19} /> <span>In Cart</span>
            </button>
            <button
              className={styles.stateButton}
              type="button"
              onClick={() => void setItemState(item, 'cant_find')}
            >
              <CircleHelp size={19} /> <span>Can’t Find</span>
            </button>
          </>
        )}
        <details className={styles.itemMenu}>
          <summary aria-label={`Edit ${item.item}`}>•••</summary>
          <div className={styles.itemEditor}>
            <input
              aria-label={`Shopping item ${items.findIndex((entry) => entry.id === item.id) + 1}`}
              value={item.item}
              onChange={(event) => updateLocal(item.id, { item: event.target.value })}
              onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)}
            />
            <input
              aria-label={`${item.item} quantity`}
              inputMode="decimal"
              value={item.quantity ?? ''}
              onChange={(event) =>
                updateLocal(item.id, {
                  quantity: event.target.value === '' ? null : Number(event.target.value),
                })
              }
              onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)}
            />
            <input
              aria-label={`${item.item} unit`}
              value={item.unit}
              onChange={(event) => updateLocal(item.id, { unit: event.target.value })}
              onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)}
            />
            <select
              aria-label={`Aisle for ${item.item}`}
              value={item.aisleId ?? ''}
              onChange={(event) => {
                const changed = { ...item, aisleId: event.target.value || null };
                updateLocal(item.id, changed);
                void save(changed);
              }}
            >
              <option value="">Unassigned</option>
              {list.aisles.map((aisle) => (
                <option key={aisle.id} value={aisle.id}>
                  {aisle.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void reorder(item, -1)}>
              <ArrowUp size={15} /> Move up
            </button>
            <button type="button" onClick={() => void reorder(item, 1)}>
              <ArrowDown size={15} /> Move down
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Remove “${item.item}” from this shopping list?`)) {
                  void remove(item);
                }
              }}
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </details>
        {item.pantry ? (
          <details className={styles.provenance}>
            <summary>{pantryStateLabel(item)}</summary>
            {pantryContributions(item).length ? (
              <ul>
                {pantryContributions(item).map((entry) => (
                  <li key={`${entry.mealPlanEntryId}:${entry.ingredientId}`}>
                    {entry.recipeTitle} · {entry.plannedFor} · {entry.servings} servings
                  </li>
                ))}
              </ul>
            ) : null}
            <div className={styles.pantryControls}>
              <div className={styles.pantryControlIntro}>
                <Link href="/pantry">Open Pantry</Link>
                <span>
                  Substitution is not available here; use Can’t Find to choose an alternative.
                </span>
              </div>
              <form
                className={styles.extraQuantityForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const quantity = Number(form.get('quantity'));
                  const unit = String(form.get('unit') ?? '').trim();
                  if (!Number.isFinite(quantity) || quantity <= 0 || !unit) {
                    showToast('Enter a positive extra quantity and unit.', 'error');
                    return;
                  }
                  void updatePantryControl(item, { action: 'extra', quantity, unit });
                }}
              >
                <label>
                  <span>Extra quantity</span>
                  <input
                    name="quantity"
                    inputMode="decimal"
                    aria-label={`Extra quantity for ${item.item}`}
                    placeholder="0"
                  />
                </label>
                <label>
                  <span>Unit</span>
                  <input
                    name="unit"
                    aria-label={`Extra unit for ${item.item}`}
                    defaultValue={item.pantry.generatedUnit || item.unit}
                    placeholder="Unit"
                  />
                </label>
                <button type="submit" disabled={busy === `pantry-control:${item.id}`}>
                  Add entered quantity as extra
                </button>
              </form>
              <div className={styles.pantryControlActions}>
                <button
                  type="button"
                  disabled={busy === `pantry-control:${item.id}`}
                  onClick={() => void updatePantryControl(item, { action: 'ignore' })}
                >
                  Ignore Pantry stock
                </button>
                <button
                  type="button"
                  disabled={busy === `pantry-control:${item.id}`}
                  onClick={() => void updatePantryControl(item, { action: 'inaccurate' })}
                >
                  Pantry inventory is inaccurate
                </button>
                {item.pantry.coverageState ? (
                  <button
                    type="button"
                    disabled={busy === `pantry-control:${item.id}`}
                    onClick={() => void updatePantryControl(item, { action: 'reset' })}
                  >
                    Use Pantry calculation
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        ) : null}
        {state === 'sourced' && item.pantry ? (
          <details className={styles.intake} open={list.settings.openPantryPurchaseOnCheck}>
            <summary>Record an actual Pantry purchase</summary>
            <div className={styles.intakeGrid}>
              {!item.pantry.productId ? (
                <select
                  aria-label={`Pantry product for ${item.item}`}
                  value={intakeDraft.productId}
                  onChange={(event) =>
                    updateIntakeDraft(item, { productId: event.target.value, status: '' })
                  }
                >
                  <option value="">Choose Pantry product</option>
                  {pantryOptions.products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.displayName}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                aria-label={`Pantry location for ${item.item}`}
                value={intakeDraft.locationId}
                onChange={(event) =>
                  updateIntakeDraft(item, { locationId: event.target.value, status: '' })
                }
              >
                <option value="">Choose Pantry location</option>
                {pantryOptions.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.path}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Purchased quantity for ${item.item}`}
                value={intakeDraft.quantity}
                onChange={(event) =>
                  updateIntakeDraft(item, { quantity: event.target.value, status: '' })
                }
                placeholder="Actual quantity"
              />
              <input
                aria-label={`Purchased unit for ${item.item}`}
                value={intakeDraft.unit}
                onChange={(event) =>
                  updateIntakeDraft(item, { unit: event.target.value, status: '' })
                }
                placeholder="Unit"
              />
              <select
                aria-label={`Coverage mode for ${item.item}`}
                value={intakeDraft.intakeMode}
                onChange={(event) =>
                  updateIntakeDraft(item, {
                    intakeMode: event.target.value as 'partial' | 'complete',
                  })
                }
              >
                <option value="partial">Partial purchase</option>
                <option value="complete">Complete item</option>
              </select>
              {(
                [
                  ['packageCount', 'Package count'],
                  ['amountPerPackage', 'Amount per package'],
                  ['packageUnit', 'Package unit'],
                  ['sublocation', 'Shelf or sublocation'],
                  ['purchasePriceCents', 'Purchase price in cents'],
                  ['store', 'Store'],
                  ['source', 'Source'],
                ] as const
              ).map(([field, label]) => (
                <input
                  key={field}
                  aria-label={`${label} for ${item.item}`}
                  value={intakeDraft[field]}
                  onChange={(event) => updateIntakeDraft(item, { [field]: event.target.value })}
                  placeholder={label}
                />
              ))}
              {(
                [
                  ['purchaseDate', 'Purchase date'],
                  ['bestBeforeDate', 'Best-before date'],
                  ['useByDate', 'Use-by date'],
                  ['sellByDate', 'Sell-by date'],
                ] as const
              ).map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    type="date"
                    aria-label={label}
                    value={intakeDraft[field]}
                    onChange={(event) => updateIntakeDraft(item, { [field]: event.target.value })}
                  />
                </label>
              ))}
              <textarea
                aria-label={`Purchase notes for ${item.item}`}
                value={intakeDraft.notes}
                onChange={(event) => updateIntakeDraft(item, { notes: event.target.value })}
                placeholder="Purchase notes"
              />
              <button
                type="button"
                aria-label="Add purchased to Pantry · Confirm and add to Pantry"
                onClick={() => void intake(item)}
              >
                Confirm and add to Pantry
              </button>
              {intakeDrafts[item.id]?.status ? (
                <span role="status">{intakeDrafts[item.id]!.status}</span>
              ) : null}
            </div>
          </details>
        ) : null}
      </article>
    );
  };

  const section = (state: ShoppingState, title: string, sectionItems: Item[], className = '') => {
    if (filter !== 'all' && filter !== state) return null;
    if (!sectionItems.length && state !== 'to_buy') return null;
    return (
      <details className={`${styles.listSection} ${className}`} open key={state}>
        <summary>
          <span>
            {state === 'to_buy' ? (
              <>
                <span className={styles.desktopSectionTitle}>Items to buy</span>
                <span className={styles.mobileSectionTitle}>To buy</span>
              </>
            ) : (
              title
            )}{' '}
            <small>· {sectionItems.length}</small>
          </span>
          <ChevronDown size={18} />
        </summary>
        <div className={styles.items}>
          {sectionItems.length ? (
            sectionItems.map(renderItem)
          ) : (
            <p className={styles.emptyState}>Nothing here yet.</p>
          )}
        </div>
      </details>
    );
  };

  return (
    <section className={styles.shoppingMode}>
      <div className={styles.mobileSummary}>
        <div className={styles.mobileProgressCard}>
          <span
            className={styles.progressRing}
            style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}
          />
          <span>
            <strong>
              {remaining} of {total} remaining
            </strong>
            <small>{progress}% complete</small>
          </span>
        </div>
      </div>

      <div className={styles.topGrid}>
        <form
          className={styles.addItem}
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder="Add an item..."
            aria-label="New shopping item"
          />
          <button
            type="submit"
            aria-busy={busy === 'add'}
            disabled={busy === 'add' || !newItem.trim()}
          >
            <Plus size={18} aria-hidden="true" /> {busy === 'add' ? 'Adding…' : 'Add item'}
          </button>
        </form>
        <section className={styles.storePanel} aria-label="Supermarket for this list">
          <label>
            <span>Shopping at</span>
            <select
              value={selectedSupermarketId}
              disabled={busy === 'store'}
              onChange={(event) => void switchSupermarket(event.target.value)}
            >
              <option value="">No supermarket profile</option>
              {list.supermarketProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                  {profile.locationLabel ? ` · ${profile.locationLabel}` : ''}
                </option>
              ))}
            </select>
          </label>
          <Link href="/settings/lists">
            <Settings size={17} /> List settings
          </Link>
        </section>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.mobileSearchRow}>
          <label className={styles.search}>
            <Search size={19} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search items..."
            />
          </label>
          <button
            className={styles.mobileAddButton}
            type="button"
            onClick={() => setMobileAddOpen((current) => !current)}
          >
            <Plus size={18} />
            <span>Add item</span>
          </button>
          <button className={styles.scanButton} type="button" onClick={() => setScanOpen(true)}>
            <ScanLine size={18} />
            <span>Scan mode</span>
          </button>
        </div>
        <div className={styles.filters} aria-label="Filter shopping items">
          {filterOptions.map(([value, label, count]) => (
            <button
              key={value}
              className={filter === value ? styles.activeFilter : ''}
              type="button"
              onClick={() => setFilter(value)}
            >
              <span>{label}</span>
              <small>{count}</small>
            </button>
          ))}
        </div>
        <div className={styles.desktopSort}>
          <button type="button">
            Sort: <strong>A → Z</strong>
            <ChevronDown size={16} />
          </button>
          <button type="button">
            Group: <strong>Aisle</strong>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      {mobileAddOpen ? (
        <form
          className={styles.mobileAddPanel}
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <input
            autoFocus
            value={newItem}
            onChange={(event) => setNewItem(event.target.value)}
            placeholder="Add an item..."
            aria-label="New shopping item mobile"
          />
          <button type="submit" disabled={!newItem.trim()}>
            Add
          </button>
        </form>
      ) : null}

      <div className={styles.contentGrid}>
        <div className={styles.listColumn}>
          {section('to_buy', 'Items to buy', toBuy)}
          {section('in_cart', 'In cart', inCart, styles.inCartSection)}
          {section('cant_find', 'Can’t find', cantFind, styles.cantFindSection)}
          {section('sourced', 'Sourced', sourced, styles.sourcedSection)}
          {cantFind.length ? (
            <section className={styles.retryPanel}>
              <div>
                <Store size={21} />
                <span>
                  <strong>Try another store</strong>
                  <small>Move these items into a new list, ordered for that store.</small>
                </span>
              </div>
              {alternativeProfiles.length ? (
                <div className={styles.retryControls}>
                  <select
                    aria-label="Choose another supermarket"
                    value={retrySupermarketId}
                    onChange={(event) => setRetrySupermarketId(event.target.value)}
                  >
                    {alternativeProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name}
                        {profile.locationLabel ? ` · ${profile.locationLabel}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-busy={busy === 'retry'}
                    disabled={busy === 'retry'}
                    onClick={() => void retryAtAnotherStore()}
                  >
                    Try other store
                  </button>
                </div>
              ) : (
                <Link href="/settings/lists">Add another supermarket profile</Link>
              )}
            </section>
          ) : null}
        </div>

        <aside className={styles.sideRail}>
          <section>
            <h2>
              <Settings size={19} /> List progress
            </h2>
            <div className={styles.railProgress}>
              <span
                className={styles.progressRing}
                style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties}
              />
              <strong>
                {remaining} of {total}
                <small>remaining</small>
              </strong>
            </div>
            <div className={styles.progressBar}>
              <span style={{ width: `${progress}%` }} />
            </div>
            <footer>
              <span>{sourced.length} sourced</span>
              <span>{inCart.length} in cart</span>
            </footer>
          </section>
          <section>
            <h2>
              <Store size={19} /> Shopping at
            </h2>
            <strong>{list.supermarketProfile?.name ?? 'No supermarket profile'}</strong>
            <p>
              {list.supermarketProfile
                ? list.supermarketProfile.locationLabel || 'Aisles are ordered for this store.'
                : 'Choose a store profile to see aisles and prices.'}
            </p>
            <Link href="/settings/lists">Manage profiles →</Link>
          </section>
          <section>
            <h2>
              <StickyNote size={19} /> Notes
            </h2>
            <p>Add a note for this list...</p>
          </section>
          <section>
            <h2>
              <Lightbulb size={19} /> Tips
            </h2>
            <p>Group by aisle to shop faster and avoid backtracking.</p>
          </section>
        </aside>
      </div>

      <nav className={styles.mobileDock} aria-label="Shopping list totals">
        <button className={styles.dockMetric} type="button" onClick={() => setFilter('in_cart')}>
          <ShoppingCart />
          <strong>{inCart.length}</strong>
          <small>In cart</small>
        </button>
        <button className={styles.dockMetric} type="button" onClick={() => setFilter('cant_find')}>
          <CircleHelp />
          <strong>{cantFind.length}</strong>
          <small>Can’t Find</small>
        </button>
        <button type="button" onClick={() => setReviewOpen(true)}>
          <ClipboardCheck /> I’m done shopping
        </button>
      </nav>

      <dialog
        className={styles.workflowDialog}
        ref={scanDialogRef}
        aria-labelledby="shopping-scan-title"
        onClose={() => setScanOpen(false)}
      >
        <header>
          <div>
            <span className={styles.dialogIcon}>
              <ScanLine />
            </span>
            <div>
              <h2 id="shopping-scan-title">Scan mode</h2>
              <p>Identify a product, then match it to the right item and quantity.</p>
            </div>
          </div>
          <button type="button" aria-label="Close scan mode" onClick={() => setScanOpen(false)}>
            <X />
          </button>
        </header>
        <div className={styles.dialogBody}>
          {scanOpen ? <BarcodeScanner onDetected={(value) => void lookupBarcode(value)} /> : null}
          <form
            className={styles.barcodeForm}
            onSubmit={(event) => {
              event.preventDefault();
              void lookupBarcode(barcode);
            }}
          >
            <label>
              <span>Enter barcode</span>
              <span>
                <Barcode />
                <input
                  inputMode="numeric"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="UPC, EAN, or GTIN"
                />
              </span>
            </label>
            <button
              type="submit"
              aria-busy={busy === 'scan'}
              disabled={busy === 'scan' || !barcode.trim()}
            >
              {busy === 'scan' ? 'Looking up…' : 'Look up'}
            </button>
          </form>
          {scanStatus ? (
            <p className={styles.dialogStatus} role="status">
              {scanStatus}
            </p>
          ) : null}
          {scanRecord ? (
            <section className={styles.scanResult}>
              <div>
                <span className={styles.productThumb}>
                  {scanRecord.images[0] ? (
                    <Image
                      src={scanRecord.images[0].url}
                      alt=""
                      width={56}
                      height={56}
                      unoptimized
                    />
                  ) : (
                    <PackageOpen />
                  )}
                </span>
                <span>
                  <small>Product identified</small>
                  <strong>{scanRecord.displayName}</strong>
                  <span>{[scanRecord.brand, scanRecord.quantity].filter(Boolean).join(' · ')}</span>
                </span>
              </div>
              <label>
                Quantity in cart
                <input
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={scanQuantity}
                  onChange={(event) => setScanQuantity(event.target.value)}
                />
              </label>
              <div className={styles.matchList}>
                <h3>{scanMatches.length ? 'Match to your list' : 'No close list match found'}</h3>
                {scanMatches.length ? (
                  scanMatches.map((match) => {
                    const item = items.find((entry) => entry.id === match.id);
                    return item ? (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => void applyScanMatch(item)}
                      >
                        <span>
                          <strong>{item.item}</strong>
                          <small>{match.score >= 0.9 ? 'Exact match' : 'Suggested match'}</small>
                        </span>
                        <span>Move to cart →</span>
                      </button>
                    ) : null;
                  })
                ) : (
                  <p>Try a broader list item name, or add this as a new item and scan again.</p>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </dialog>

      <dialog
        className={styles.workflowDialog}
        ref={substituteDialogRef}
        aria-labelledby="shopping-substitute-title"
        onClose={() => setSubstituteItem(null)}
      >
        <header>
          <div>
            <span className={styles.dialogIcon}>
              <PackageOpen />
            </span>
            <div>
              <h2 id="shopping-substitute-title">Find a substitute</h2>
              <p>Search real food products, then record what went into the cart.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close substitute search"
            onClick={() => setSubstituteItem(null)}
          >
            <X />
          </button>
        </header>
        <div className={styles.dialogBody}>
          {substituteItem ? (
            <p className={styles.replacingLabel}>
              Replacing <strong>{substituteItem.item}</strong>
            </p>
          ) : null}
          <form
            className={styles.substituteSearch}
            onSubmit={(event) => void searchSubstitutes(event)}
          >
            <label>
              <Search />
              <input
                value={substituteQuery}
                onChange={(event) => setSubstituteQuery(event.target.value)}
                placeholder="Try chicken, steak, dairy-free milk…"
              />
            </label>
            <button
              type="submit"
              aria-busy={busy === 'substitute'}
              disabled={busy === 'substitute' || substituteQuery.trim().length < 2}
            >
              {busy === 'substitute' ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className={styles.substituteResults}>
            {substituteResults.map((record) => (
              <button
                key={`${record.provider}:${record.providerRecordId}`}
                type="button"
                onClick={() => void applySubstitute(record)}
              >
                <span className={styles.productThumb}>
                  {record.images[0] ? (
                    <Image src={record.images[0].url} alt="" width={56} height={56} unoptimized />
                  ) : (
                    <PackageOpen />
                  )}
                </span>
                <span>
                  <strong>{record.displayName}</strong>
                  <small>
                    {[record.brand, record.genericName, record.quantity]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </span>
                <span>Use substitute</span>
              </button>
            ))}
            {!substituteResults.length ? (
              <p>
                Search by the ingredient or alternative you want. Suggestions come from the
                configured food-data providers.
              </p>
            ) : null}
          </div>
        </div>
      </dialog>

      <dialog
        className={`${styles.workflowDialog} ${styles.reviewDialog}`}
        ref={reviewDialogRef}
        aria-labelledby="shopping-review-title"
        onClose={() => setReviewOpen(false)}
      >
        <header>
          <div>
            <span className={styles.dialogIcon}>
              <ClipboardCheck />
            </span>
            <div>
              <h2 id="shopping-review-title">Review this shopping trip</h2>
              <p>Check anything unresolved before you finish.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close shopping review"
            onClick={() => setReviewOpen(false)}
          >
            <X />
          </button>
        </header>
        <div className={styles.dialogBody}>
          {!toBuy.length && !cantFind.length ? (
            <section className={styles.reviewComplete}>
              <CheckCircle2 />
              <h3>Everything is accounted for</h3>
              <p>Your cart and sourced items are ready to review in Pantry.</p>
              <Link href="/lists">Finish shopping</Link>
            </section>
          ) : (
            <>
              {toBuy.length ? (
                <section className={styles.reviewGroup}>
                  <h3>
                    Still to buy <span>{toBuy.length}</span>
                  </h3>
                  <p>These items have not been marked as in your cart.</p>
                  <ul>
                    {toBuy.map((item) => (
                      <li key={item.id}>
                        <span>{item.item}</span>
                        <button type="button" onClick={() => void setItemState(item, 'in_cart')}>
                          Found it
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {cantFind.length ? (
                <section className={`${styles.reviewGroup} ${styles.reviewWarning}`}>
                  <h3>
                    Can’t find <span>{cantFind.length}</span>
                  </h3>
                  <p>
                    Try substitutes now, loop back through the store, or make a list for another
                    supermarket.
                  </p>
                  <ul>
                    {cantFind.map((item) => (
                      <li key={item.id}>
                        <span>{item.item}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewOpen(false);
                            openSubstitute(item);
                          }}
                        >
                          Substitute
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {cantFind.length ? (
                <section className={styles.reviewRetry}>
                  <Store />
                  <div>
                    <strong>Try another store</strong>
                    <p>
                      The new list contains only Can’t Find items and follows that store’s aisle
                      order.
                    </p>
                  </div>
                  {alternativeProfiles.length ? (
                    <>
                      <select
                        aria-label="Choose store for unresolved items"
                        value={retrySupermarketId}
                        onChange={(event) => setRetrySupermarketId(event.target.value)}
                      >
                        {alternativeProfiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                            {profile.locationLabel ? ` · ${profile.locationLabel}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-busy={busy === 'retry'}
                        disabled={busy === 'retry'}
                        onClick={() => void retryAtAnotherStore()}
                      >
                        Create store list
                      </button>
                    </>
                  ) : (
                    <Link href="/settings/lists">Add a supermarket profile</Link>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
        <footer>
          <button type="button" onClick={() => setReviewOpen(false)}>
            Continue shopping
          </button>
        </footer>
      </dialog>
    </section>
  );
}
