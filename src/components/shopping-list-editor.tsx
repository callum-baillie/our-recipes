'use client';
import { AppDialog } from './app-dialog';
import { DialogViewport } from './dialog-viewport';
import {
  shoppingWorkflow,
  shoppingWorkflowState,
  moveShoppingItem,
} from '@/lib/domain/shopping-workflow';
import { formatShoppingQuantity } from '@/lib/domain/shopping-quantity';
import { ShoppingListNotes } from './shopping-list-notes';
import { ShoppingListShortcuts } from './shopping-list-shortcuts';
import { KitchenPrintDialog } from './kitchen-print-dialog';
import { DecisionAssistance } from '@/components/decision-assistance';

import { InstacartShopping } from './instacart-shopping';
import { AiAssistantDrawer } from './ai-assistant-drawer';

import {
  ArrowDown,
  ArrowUp,
  Barcode,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  ListTodo,
  Lightbulb,
  PackageOpen,
  Plus,
  ScanLine,
  Search,
  Settings,
  ShoppingCart,
  StickyNote,
  Store,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';

import { useToast } from '@/components/toast-provider';
import { createClientUuid } from '@/lib/client/client-uuid';
import { AsyncSkeleton } from '@/components/skeleton';
import type { FoodRecord } from '@/lib/domain/food-data';
import { rankPantryMatches, type PantryMatchCandidate } from '@/lib/domain/pantry-shopping-match';
import { rankShoppingScanMatches } from '@/lib/domain/shopping-scan-match';
import type { ShoppingListDetail } from '@/lib/services/planning-service';

import styles from './shopping-list-editor.module.css';

type Item = ShoppingListDetail['items'][number];
type ShoppingState = Item['shoppingState'];
type SortMode = 'position' | 'alpha' | 'recent';
type GroupMode = 'aisle' | 'none';

const BarcodeScanner = dynamic(
  () => import('@/components/barcode-scanner').then((module) => module.BarcodeScanner),
  {
    loading: () => <AsyncSkeleton label="Opening barcode scanner" variant="scanner" />,
    ssr: false,
  },
);

type PantryOptions = {
  products: Array<{
    id: string;
    displayName: string;
    aliases: string[];
    stock: Array<{ quantity: number; unit: string }>;
  }>;
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
    quantity: String(item.cartQuantity > 0 ? item.cartQuantity : (item.quantity ?? '')),
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
      ? (
          body as {
            dashboard?: {
              products?: Array<{ id?: unknown; displayName?: unknown; aliases?: unknown }>;
              locations?: Array<{ id?: unknown; path?: unknown }>;
              batches?: Array<{
                productId?: unknown;
                quantityRemaining?: unknown;
                unit?: unknown;
                approximateState?: unknown;
                status?: unknown;
                excludeFromGrocery?: unknown;
              }>;
            };
          }
        ).dashboard
      : undefined;
  const batches = Array.isArray(dashboard?.batches) ? dashboard.batches : [];
  return {
    products: Array.isArray(dashboard?.products)
      ? dashboard.products.flatMap((product) => {
          if (typeof product.id !== 'string' || typeof product.displayName !== 'string') return [];
          const byUnit = new Map<string, number>();
          batches
            .filter(
              (batch) =>
                batch.productId === product.id &&
                typeof batch.quantityRemaining === 'number' &&
                batch.quantityRemaining > 0 &&
                typeof batch.unit === 'string' &&
                batch.approximateState === null &&
                !batch.excludeFromGrocery &&
                !['depleted', 'discarded', 'donated'].includes(String(batch.status)),
            )
            .forEach((batch) =>
              byUnit.set(
                batch.unit as string,
                (byUnit.get(batch.unit as string) ?? 0) + (batch.quantityRemaining as number),
              ),
            );
          return [
            {
              id: product.id,
              displayName: product.displayName,
              aliases: Array.isArray(product.aliases)
                ? product.aliases.filter((alias): alias is string => typeof alias === 'string')
                : [],
              stock: [...byUnit].map(([unit, quantity]) => ({ quantity, unit })),
            },
          ];
        })
      : [],
    locations: Array.isArray(dashboard?.locations)
      ? dashboard.locations.flatMap((location) =>
          typeof location.id === 'string' && typeof location.path === 'string'
            ? [{ id: location.id, path: location.path }]
            : [],
        )
      : [],
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
      ? 'Manual amount · Pantry match still needs review'
      : 'Pantry match needed for an exact buy amount';
  if (manuallyEdited)
    return `Manual amount · calculated buy amount is ${detail.shortageQuantity} ${detail.generatedUnit}`;
  return 'Plan and Pantry calculation';
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
  return shoppingWorkflowState(item);
}

export function shoppingItemAmount(
  item: Pick<Item, 'quantity' | 'unit'> & {
    pantry:
      | (Pick<NonNullable<Item['pantry']>, 'demandState' | 'formulaInputs' | 'generatedUnit'> &
          Record<string, unknown>)
      | null;
  },
): string {
  if (item.quantity === null && item.pantry?.demandState === 'uncertain') {
    try {
      const formula = JSON.parse(item.pantry.formulaInputs) as {
        requiredQuantity?: unknown;
        unit?: unknown;
      };
      if (
        typeof formula.requiredQuantity === 'number' &&
        Number.isFinite(formula.requiredQuantity) &&
        formula.requiredQuantity > 0
      ) {
        const unit =
          typeof formula.unit === 'string' && formula.unit.trim()
            ? formula.unit
            : item.pantry.generatedUnit || item.unit;
        return `${formula.requiredQuantity} ${unit}`.trim() + ' recipe demand';
      }
    } catch {
      // Fall through to the ordinary unknown-quantity label.
    }
  }
  return (
    [item.quantity ?? '', item.unit].filter((value) => value !== '').join(' ') || 'Quantity not set'
  );
}

export type ShoppingQuantitySummary = {
  primary: string;
  secondary: string;
  calculation: string;
  isEstimate: boolean;
};

function finiteQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function formatQuantity(quantity: number, unit: string): string {
  return formatShoppingQuantity(quantity, unit);
}

export function shoppingQuantitySummary(
  item: Pick<Item, 'quantity' | 'unit'> & {
    pantry:
      | (Pick<NonNullable<Item['pantry']>, 'demandState' | 'formulaInputs' | 'generatedUnit'> &
          Partial<
            Pick<
              NonNullable<Item['pantry']>,
              | 'manualQuantityOverride'
              | 'manualUnitOverride'
              | 'manualItemOverride'
              | 'manualNoteOverride'
            >
          > &
          Record<string, unknown>)
      | null;
  },
): ShoppingQuantitySummary {
  const ordinaryAmount =
    item.quantity === null
      ? 'Quantity not set'
      : `${formatQuantity(item.quantity, item.unit)} to buy`;
  if (!item.pantry) {
    return {
      primary: ordinaryAmount,
      secondary: '',
      calculation: '',
      isEstimate: false,
    };
  }

  let formula: Record<string, unknown> = {};
  try {
    formula = JSON.parse(item.pantry.formulaInputs) as Record<string, unknown>;
  } catch {
    return {
      primary: ordinaryAmount,
      secondary: '',
      calculation: '',
      isEstimate: false,
    };
  }

  const unit =
    typeof formula.unit === 'string' && formula.unit.trim()
      ? formula.unit
      : item.pantry.generatedUnit || item.unit;
  const planQuantity =
    finiteQuantity(formula.recipeRequirement) ?? finiteQuantity(formula.requiredQuantity);

  if (planQuantity !== null) {
    return {
      primary:
        item.quantity === null
          ? `${formatQuantity(planQuantity, unit)} recipe demand`
          : ordinaryAmount,
      secondary: '',
      calculation:
        item.quantity === null
          ? 'Buy amount needs a Pantry match'
          : planQuantity > 0
            ? `${formatQuantity(planQuantity, unit)} needed for planned meals`
            : '',
      isEstimate: item.quantity === null,
    };
  }

  return {
    primary: ordinaryAmount,
    secondary: '',
    calculation: '',
    isEstimate: false,
  };
}

function pantryStockLabel(product: PantryOptions['products'][number] | undefined): string {
  if (!product) return '';
  if (!product.stock.length) return '0 already in Pantry';
  return `${product.stock
    .map(({ quantity, unit }) => formatQuantity(quantity, unit))
    .join(' + ')} already in Pantry`;
}

export function ShoppingListEditor({
  list,
  initialPantryOptions,
  instacartEnabled = false,
}: {
  list: ShoppingListDetail;
  initialPantryOptions?: PantryOptions;
  instacartEnabled?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState(() =>
    list.items.map((item) => ({ ...item, shoppingState: normalizedState(item) })),
  );
  const dirtyItems = useRef(new Map<string, number>());
  const saveChains = useRef(new Map<string, Promise<boolean>>());
  const [syncError, setSyncError] = useState('');
  const [newItem, setNewItem] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newUnit, setNewUnit] = useState('');
  const [query, setQuery] = useState('');
  const [focusedShopping, setFocusedShopping] = useState(true);
  const pendingStateChanges = useRef(new Set<string>());
  const reorderPending = useRef(false);
  const [pendingItems, setPendingItems] = useState<string[]>([]);
  const [lastChecked, setLastChecked] = useState<{
    item: Item;
    previous: Item | null;
  } | null>(null);
  const [reenteringItem, setReenteringItem] = useState<string | null>(null);
  const [unpackMode, setUnpackMode] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [cartQuantityItem, setCartQuantityItem] = useState<Item | null>(null);
  const [cartQuantityDraft, setCartQuantityDraft] = useState('');
  const [editingItem, setEditingItem] = useState<{
    id: string;
    name: string;
    quantity: string;
    unit: string;
    aisleId: string;
  } | null>(null);
  const [editError, setEditError] = useState('');
  const editingItemId = useRef<string | null>(null);
  useEffect(() => {
    editingItemId.current = editingItem?.id ?? null;
  }, [editingItem?.id]);
  const [sortMode, setSortMode] = useState<SortMode>('alpha');
  const [groupMode, setGroupMode] = useState<GroupMode>('aisle');
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
  const cartQuantityDialogRef = useRef<HTMLDialogElement>(null);
  const addItemInputRef = useRef<HTMLInputElement>(null);
  const [pantryOptions, setPantryOptions] = useState<PantryOptions>(
    initialPantryOptions ?? { products: [], locations: [] },
  );
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, IntakeDraft>>({});
  const [operationTracker] = useState(() => createIntakeOperationTracker(createClientUuid));
  const automaticMatches = useRef(new Set<string>());

  useEffect(() => {
    if (initialPantryOptions) return;
    void fetch('/api/v1/pantry/summary')
      .then((response) => response.json())
      .then((body) => setPantryOptions(pantryOptionsFromSummary(body)));
  }, [initialPantryOptions]);

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

  useEffect(() => {
    const dialog = cartQuantityDialogRef.current;
    if (cartQuantityItem && dialog && !dialog.open) dialog.showModal();
    if (!cartQuantityItem && dialog?.open) dialog.close();
  }, [cartQuantityItem]);

  useEffect(() => {
    let disposed = false;
    let fetching = false;
    const refresh = async () => {
      if (
        fetching ||
        reorderPending.current ||
        document.visibilityState !== 'visible' ||
        document.activeElement?.matches('input,textarea,select')
      )
        return;
      fetching = true;
      try {
        const response = await fetch(`/api/v1/shopping-lists/${list.id}`, { cache: 'no-store' });
        const body = await response.json();
        if (!response.ok)
          throw new Error('Shared list updates paused. Your edits are kept; reconnect to sync.');
        if (disposed || reorderPending.current) return;
        const latest = body.list.items as Item[];
        setItems((current) => {
          const locked = (id: string) =>
            dirtyItems.current.has(id) ||
            pendingStateChanges.current.has(id) ||
            editingItemId.current === id;
          const byId = new Map(current.map((item) => [item.id, item]));
          return [
            ...latest.map((item) =>
              locked(item.id)
                ? (byId.get(item.id) ?? item)
                : { ...item, shoppingState: normalizedState(item) },
            ),
            ...current.filter(
              (item) => locked(item.id) && !latest.some((next) => next.id === item.id),
            ),
          ];
        });
        setSyncError('');
      } catch (error) {
        if (!disposed)
          setSyncError(
            error instanceof Error ? error.message : 'Shared updates are temporarily unavailable.',
          );
      } finally {
        fetching = false;
      }
    };
    const timer = setInterval(() => void refresh(), 30000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [list.id]);

  const aisleById = useMemo(
    () => new Map(list.aisles.map((aisle) => [aisle.id, aisle.name])),
    [list.aisles],
  );
  const searched = items
    .filter((item) => item.item.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => {
      if (sortMode === 'alpha') {
        return left.item.localeCompare(right.item, undefined, { sensitivity: 'base' });
      }
      if (sortMode === 'recent') {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      }
      return left.position - right.position;
    });
  const itemsByState = (state: ShoppingState) =>
    searched.filter((item) => normalizedState(item) === state);
  const wholeTrip = shoppingWorkflow(items);
  const toBuy = itemsByState('to_buy');
  const inCart = itemsByState('in_cart');
  const cantFind = itemsByState('cant_find');
  const sourced = itemsByState('sourced');
  const total = items.length;
  const progressCount = wholeTrip.inCart.length + wholeTrip.sourced.length;
  const remaining = wholeTrip.toBuy.length + wholeTrip.cantFind.length;
  const progress = total ? Math.round((progressCount / total) * 100) : 0;
  const scanMatches = useMemo(
    () =>
      scanRecord
        ? rankShoppingScanMatches(
            items
              .filter((item) => unpackMode || normalizedState(item) !== 'sourced')
              .map((item) => ({ id: item.id, item: item.item })),
            scanRecord,
          )
        : [],
    [items, scanRecord, unpackMode],
  );
  const stockedPantryProducts = useMemo(
    () => pantryOptions.products.filter((product) => product.stock.length > 0),
    [pantryOptions.products],
  );
  const pantryCandidatesFor = (item: Item): PantryMatchCandidate[] =>
    item.pantry && !item.pantry.productId
      ? rankPantryMatches(item.item, stockedPantryProducts)
      : [];

  const updateLocal = (id: string, patch: Partial<Item>) => {
    dirtyItems.current.set(id, (dirtyItems.current.get(id) ?? 0) + 1);
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const persistItem = async (item: Item) => {
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
          cartQuantity: item.cartQuantity,
          cartLabel: item.cartLabel,
        }),
      });
      if (!response.ok) showToast(`Could not save ${item.item}.`, 'error');
      return response.ok;
    } catch {
      showToast(`Could not save ${item.item}. Check the connection and try again.`, 'error');
      return false;
    }
  };

  const save = (item: Item): Promise<boolean> => {
    const version = dirtyItems.current.get(item.id);
    const previous = saveChains.current.get(item.id) ?? Promise.resolve(true);
    const next = previous
      .catch(() => false)
      .then(() => persistItem(item))
      .then((ok) => {
        if (ok && dirtyItems.current.get(item.id) === version) dirtyItems.current.delete(item.id);
        return ok;
      });
    saveChains.current.set(item.id, next);
    void next.finally(() => {
      if (saveChains.current.get(item.id) === next) saveChains.current.delete(item.id);
    });
    return next;
  };

  const setItemState = async (
    item: Item,
    state: ShoppingState,
    cartQuantity?: number,
    cartLabel = item.cartLabel,
  ) => {
    if (pendingStateChanges.current.has(item.id)) return;
    pendingStateChanges.current.add(item.id);
    setPendingItems((current) => [...current, item.id]);
    const previous = { ...item };
    const changed = {
      ...item,
      cartQuantity:
        cartQuantity ??
        (state === 'in_cart'
          ? (item.quantity ?? Math.max(1, item.cartQuantity))
          : item.cartQuantity),
      cartLabel,
      shoppingState: state,
      checked: state === 'sourced',
    };
    const wasDirty = dirtyItems.current.has(item.id);
    updateLocal(item.id, changed);
    const changedVersion = dirtyItems.current.get(item.id);
    try {
      if (!(await save(changed))) {
        if (dirtyItems.current.get(item.id) === changedVersion) {
          setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
          if (!wasDirty) dirtyItems.current.delete(item.id);
        }
      } else {
        setLastChecked({ item: changed, previous });
        if (state === 'cant_find') showToast(`${item.item} moved to Can’t Find.`, 'success');
      }
    } finally {
      pendingStateChanges.current.delete(item.id);
      setPendingItems((current) => current.filter((id) => id !== item.id));
    }
  };

  const restoreLastAction = async () => {
    if (!lastChecked) return;
    const { item, previous } = lastChecked;
    if (!previous) {
      try {
        const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Could not remove the scanned item.');
        setItems((current) => current.filter((row) => row.id !== item.id));
        setLastChecked(null);
        showToast(`${item.item} removed from the list.`, 'success');
      } catch {
        showToast('Could not undo that scanned item. Check the connection and try again.', 'error');
      }
      return;
    }
    updateLocal(item.id, previous);
    const restored = { ...previous };
    if (await save(restored)) {
      setLastChecked(null);
      setReenteringItem(item.id);
      window.setTimeout(
        () => setReenteringItem((current) => (current === item.id ? null : current)),
        550,
      );
      showToast(`${item.item} restored to the list.`, 'success');
    } else {
      setItems((current) => current.map((row) => (row.id === item.id ? item : row)));
    }
  };

  const editCartQuantity = (item: Item) => {
    setCartQuantityDraft(String(item.cartQuantity || item.quantity || 1));
    setCartQuantityItem(item);
  };

  const saveCartQuantity = async (event: FormEvent) => {
    event.preventDefault();
    if (!cartQuantityItem) return;
    const amount = Number(cartQuantityDraft);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000) {
      showToast('Enter a quantity from 0 to 10,000.', 'error');
      return;
    }
    const previous = { ...cartQuantityItem };
    const complete = amount > 0 && (previous.quantity === null || amount >= previous.quantity);
    const changed = {
      ...previous,
      cartQuantity: amount,
      cartLabel: amount ? previous.cartLabel : '',
      shoppingState: (complete ? 'in_cart' : 'to_buy') as ShoppingState,
      checked: false,
    };
    updateLocal(previous.id, changed);
    if (await save(changed)) {
      setLastChecked({ item: changed, previous });
      showToast(
        amount && !complete
          ? `${formatQuantity(amount, previous.unit)} recorded; the remaining amount stays on your list.`
          : amount
            ? `${previous.item} marked in cart.`
            : `${previous.item} remains on your list.`,
        'success',
      );
      setCartQuantityItem(null);
    } else {
      setItems((current) => current.map((row) => (row.id === previous.id ? previous : row)));
    }
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
    const cartQuantity =
      item.cartQuantity + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    const complete = item.quantity === null || cartQuantity >= item.quantity;
    const scanNote = [
      item.note,
      `Scanned ${scanRecord.displayName}${scanRecord.brand ? ` by ${scanRecord.brand}` : ''}`,
      Number.isFinite(quantity) && quantity > 0 ? `Cart quantity: ${quantity}` : '',
      scanRecord.canonicalGtin ? `GTIN ${scanRecord.canonicalGtin}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);
    const changed = {
      ...item,
      note: scanNote,
      cartLabel: scanRecord.displayName,
      cartQuantity,
      shoppingState: (unpackMode && complete
        ? 'sourced'
        : complete
          ? 'in_cart'
          : 'to_buy') as ShoppingState,
      checked: unpackMode && complete,
    };
    updateLocal(item.id, changed);
    if (await save(changed)) {
      setLastChecked({ item: changed, previous: item });
      if (unpackMode) {
        const candidate = rankPantryMatches(scanRecord.displayName, stockedPantryProducts)[0];
        updateIntakeDraft(item, {
          productId: candidate?.productId ?? item.pantry?.productId ?? '',
          quantity: String(cartQuantity),
        });
      }
      showToast(
        !complete
          ? `${formatQuantity(cartQuantity, item.unit)} recorded; the remainder stays on your list.`
          : unpackMode
            ? `${item.item} identified and ready to unpack into Pantry.`
            : `${item.item} identified and moved to In cart.`,
        'success',
      );
      setScanOpen(false);
      setScanRecord(null);
      setBarcode('');
      setScanQuantity('1');
    } else updateLocal(item.id, item);
  };

  const addScannedItem = async () => {
    if (!scanRecord) return;
    const quantity = Number(scanQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10_000) {
      setScanStatus('Enter a quantity from 0 to 10,000.');
      return;
    }
    setBusy('scan-add');
    try {
      const itemName = scanRecord.genericName?.trim() || scanRecord.displayName;
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: '',
          unit: '',
          item: itemName,
          note: [
            `Scanned ${scanRecord.displayName}${scanRecord.brand ? ` by ${scanRecord.brand}` : ''}`,
            scanRecord.canonicalGtin ? `GTIN ${scanRecord.canonicalGtin}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 240),
          checked: unpackMode,
          shoppingState: unpackMode ? 'sourced' : 'in_cart',
          cartQuantity: quantity,
          cartLabel: scanRecord.displayName,
        }),
      });
      const body = (await response.json().catch(() => null)) as { item?: Item } | null;
      if (!response.ok || !body?.item) throw new Error('Could not add the scanned item.');
      setItems((current) => [...current, body.item!]);
      setLastChecked({ item: body.item, previous: null });
      setScanOpen(false);
      setScanRecord(null);
      setBarcode('');
      setScanQuantity('1');
      showToast(
        `${itemName} added to ${unpackMode ? 'Pantry unpacking' : 'Add to cart'}.`,
        'success',
      );
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : 'Could not add the scanned item.');
    } finally {
      setBusy('');
    }
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
      cartLabel: record.displayName,
      cartQuantity: original.quantity ?? Math.max(1, original.cartQuantity),
      shoppingState: 'in_cart' as const,
      checked: false,
    };
    updateLocal(original.id, changed);
    if (await save(changed)) {
      setLastChecked({ item: changed, previous: original });
      showToast(`${record.displayName} added as the substitute.`, 'success');
      setSubstituteItem(null);
      setSubstituteResults([]);
    } else updateLocal(original.id, original);
  };

  const add = async () => {
    if (!newItem.trim()) return;
    const quantity = newQuantity.trim() ? Number(newQuantity) : null;
    if (
      (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || !newUnit.trim())) ||
      (newUnit.trim() && quantity === null)
    ) {
      showToast('Enter a positive quantity and unit together.', 'error');
      return;
    }
    setBusy('add');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: quantity ?? '',
          unit: newUnit.trim(),
          item: newItem,
          note: '',
          checked: false,
          shoppingState: 'to_buy',
          cartQuantity: 0,
          cartLabel: '',
        }),
      });
      const body = (await response.json().catch(() => null)) as { item?: Item } | null;
      if (!response.ok || !body?.item) {
        showToast('Could not add that shopping item.', 'error');
        return;
      }
      setItems((current) => [...current, body.item!]);
      setNewItem('');
      setNewQuantity('');
      setNewUnit('');
      setMobileAddOpen(false);
      showToast(`${body.item.item} added.`, 'success');
    } catch {
      showToast('Could not add that shopping item. Check the connection and try again.', 'error');
    } finally {
      setBusy('');
    }
  };

  const matchPantryProduct = useCallback(
    async (
      item: Item,
      productId: string,
      matchType: 'exact' | 'suggested' | 'manual',
      announce = true,
    ) => {
      try {
        const response = await fetch(
          `/api/v1/shopping-lists/${list.id}/items/${item.id}/pantry-match`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId, matchType }),
          },
        );
        const body = (await response.json().catch(() => null)) as {
          detail?: NonNullable<Item['pantry']>;
        } | null;
        if (!response.ok || !body?.detail) throw new Error('Could not save that Pantry match.');
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, pantry: { ...body.detail!, productId } } : entry,
          ),
        );
        if (announce) {
          const product = pantryOptions.products.find((candidate) => candidate.id === productId);
          showToast(
            `${item.item} matched to ${product?.displayName ?? 'the Pantry item'}.`,
            'success',
          );
        }
      } catch (error) {
        automaticMatches.current.delete(item.id);
        if (announce)
          showToast(
            error instanceof Error ? error.message : 'Could not save that Pantry match.',
            'error',
          );
      }
    },
    [list.id, pantryOptions.products, showToast],
  );

  useEffect(() => {
    for (const item of items) {
      if (!item.pantry || item.pantry.productId || automaticMatches.current.has(item.id)) continue;
      const best = rankPantryMatches(item.item, stockedPantryProducts)[0];
      if (!best?.certain) continue;
      automaticMatches.current.add(item.id);
      void matchPantryProduct(item, best.productId, 'exact', false);
    }
  }, [items, matchPantryProduct, stockedPantryProducts]);

  const remove = async (item: Item) => {
    if (busy) return false;
    setBusy('remove');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        showToast(`Could not remove ${item.item}.`, 'error');
        return false;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      showToast(`${item.item} removed.`, 'success');
      return true;
    } catch {
      showToast(`Could not remove ${item.item}. Check the connection and try again.`, 'error');
      return false;
    } finally {
      setBusy('');
    }
  };

  const movementContext = (item: Item) =>
    searched.filter(
      (entry) =>
        normalizedState(entry) === normalizedState(item) &&
        (groupMode !== 'aisle' ||
          (entry.aisleId && aisleById.has(entry.aisleId) ? entry.aisleId : 'unassigned') ===
            (item.aisleId && aisleById.has(item.aisleId) ? item.aisleId : 'unassigned')),
    );
  const reorder = async (item: Item, direction: -1 | 1) => {
    if (sortMode !== 'position' || busy) return;
    const next = moveShoppingItem(items, movementContext(item), item.id, direction);
    if (!next) return;
    const previousPositions = new Map(items.map((entry) => [entry.id, entry.position]));
    setBusy('reorder');
    reorderPending.current = true;
    setItems(next);
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: next.map((entry) => entry.id) }),
      });
      if (!response.ok) throw new Error('Could not save that item order.');
    } catch {
      setItems((current) =>
        current.map((entry) => ({
          ...entry,
          position: previousPositions.get(entry.id) ?? entry.position,
        })),
      );
      showToast('Could not save that item order. Your previous order was restored.', 'error');
    } finally {
      reorderPending.current = false;
      setBusy('');
    }
  };
  const openItemEditor = (item: Item) => {
    setEditError('');
    setEditingItem({
      id: item.id,
      name: item.item,
      quantity: String(item.quantity ?? ''),
      unit: item.unit,
      aisleId: item.aisleId ?? '',
    });
  };
  const commitItemEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingItem || busy) return;
    const original = items.find((item) => item.id === editingItem.id);
    const raw = editingItem.quantity.trim();
    const quantity = raw === '' ? null : Number(raw);
    if (
      !original ||
      !editingItem.name.trim() ||
      editingItem.name.trim().length > 160 ||
      (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000))
    ) {
      setEditError(
        'Enter a name up to 160 characters and a buy quantity greater than zero, up to 10,000, or leave quantity blank when unknown.',
      );
      return;
    }
    const changed = {
      ...original,
      item: editingItem.name.trim(),
      quantity,
      unit: editingItem.unit.trim(),
      aisleId: editingItem.aisleId || null,
    };
    const previousDirty = dirtyItems.current.get(original.id);
    updateLocal(original.id, changed);
    const version = dirtyItems.current.get(original.id);
    setBusy('edit');
    const ok = await save(changed);
    setBusy('');
    if (ok) {
      setEditingItem(null);
      showToast('Item changes saved.', 'success');
    } else {
      if (dirtyItems.current.get(original.id) === version) {
        setItems((current) => current.map((item) => (item.id === original.id ? original : item)));
        if (previousDirty === undefined) dirtyItems.current.delete(original.id);
        else dirtyItems.current.set(original.id, previousDirty);
      }
      setEditError('Changes were not saved. Your entries are kept here; try again.');
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
      | {
          action:
            | 'ignore'
            | 'inaccurate'
            | 'reset'
            | 'skip_policy'
            | 'restore_policy'
            | 'assume_empty_for_trip';
        }
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

  const makeNextShop = async () => {
    if (
      !window.confirm(
        'Make this the Next shop? Outstanding untouched recurring amounts will move here; recipe and manual items stay on their current lists.',
      )
    )
      return;
    setBusy('next-shop');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_restock_target' }),
      });
      if (!response.ok) throw new Error('Could not designate this list as Next shop.');
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update Next shop.', 'error');
    } finally {
      setBusy('');
    }
  };

  const updatePolicyReview = async (
    productId: string,
    action: 'restore_policy' | 'skip_policy' | 'assume_empty_for_trip',
  ) => {
    setBusy(`policy:${productId}`);
    try {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/policies/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error('Could not change that recurring policy for this trip.');
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update the policy.', 'error');
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
    if (!item.pantry && productId) await matchPantryProduct(item, productId, 'manual', false);
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
    const quantitySummary = shoppingQuantitySummary(item);
    const pantryCandidates = pantryCandidatesFor(item);
    const automaticCandidate = pantryCandidates.find((candidate) => candidate.certain);
    const matchedProductId = item.pantry?.productId ?? automaticCandidate?.productId;
    const matchedProduct = pantryOptions.products.find(
      (product) => product.id === matchedProductId,
    );
    const suggestedMatches = automaticCandidate ? [] : pantryCandidates;
    const intakeDraft =
      intakeDrafts[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id);
    const aisleName = item.aisleId ? aisleById.get(item.aisleId) : undefined;
    return (
      <article
        className={`${styles.item} ${state === 'sourced' ? styles.sourcedItem : ''} ${reenteringItem === item.id ? styles.itemReturned : ''}`}
        key={item.id}
      >
        {!focusedShopping ? (
          <label
            className={`${styles.sourceToggle} ${state === 'sourced' ? styles.sourceToggleActive : ''}`}
          >
            <input
              type="checkbox"
              checked={state === 'sourced'}
              aria-label={`Mark ${item.item} complete`}
              disabled={pendingItems.includes(item.id)}
              onChange={() => void setItemState(item, state === 'sourced' ? 'to_buy' : 'sourced')}
            />
            {state === 'sourced' ? <Check size={18} /> : null}
          </label>
        ) : null}
        <span className={styles.itemThumb}>
          <PackageOpen size={24} aria-hidden="true" />
        </span>
        <div
          className={`${styles.itemIdentity} ${
            groupMode === 'aisle' ? styles.itemIdentityGrouped : ''
          }`}
        >
          <strong>{item.cartLabel || item.item}</strong>
          {item.cartLabel && item.cartLabel !== item.item ? (
            <small className={styles.requestedItem}>For: {item.item}</small>
          ) : null}
          {(pantryContributions(item).length > 0 || item.policyBreakdown) && (
            <span>
              {pantryContributions(item).length ? (
                <small className={styles.aisleBadge}>Meal plan</small>
              ) : null}
              {item.policyBreakdown ? (
                <small className={styles.aisleBadge}>
                  {item.policyBreakdown.mode === 'always_have' ? 'Always have' : 'Always buy'}
                </small>
              ) : null}
            </span>
          )}
          <span
            className={`${styles.quantitySummary} ${
              quantitySummary.isEstimate ? styles.quantitySummaryEstimate : ''
            }`}
          >
            <span className={styles.buyAmount}>{quantitySummary.primary}</span>
            {item.cartQuantity > 0 ? (
              <span className={styles.cartAmount}>
                {formatQuantity(item.cartQuantity, item.unit)} in cart
                {item.quantity !== null && item.cartQuantity < item.quantity
                  ? ` · ${formatQuantity(item.quantity - item.cartQuantity, item.unit)} still needed`
                  : ''}
              </span>
            ) : null}
            {matchedProduct ? (
              <span className={styles.pantryAmount}>{pantryStockLabel(matchedProduct)}</span>
            ) : null}
            {quantitySummary.calculation ? (
              <span className={styles.quantityCalculation}>
                {quantitySummary.calculation}
                {quantitySummary.isEstimate && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openItemEditor(item)}
                  >
                    Set buy quantity
                  </button>
                )}
              </span>
            ) : null}
          </span>
          {groupMode === 'none' ? (
            <span className={`${styles.aisleBadge} ${!aisleName ? styles.unassignedBadge : ''}`}>
              {aisleName ?? 'Unassigned'}
            </span>
          ) : null}
        </div>
        {state === 'sourced' ? (
          <button
            className={styles.stateButton}
            type="button"
            disabled={pendingItems.includes(item.id)}
            onClick={() => void setItemState(item, 'to_buy', 0, '')}
          >
            Move back to To buy
          </button>
        ) : state === 'cant_find' ? (
          <>
            <button
              className={`${styles.stateButton} ${styles.foundButton}`}
              type="button"
              disabled={pendingItems.includes(item.id)}
              onClick={() => void setItemState(item, 'in_cart', item.quantity ?? 1)}
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
              className={`${styles.stateButton} ${styles.inCartButton} ${
                state === 'in_cart' ? styles.stateButtonActive : ''
              }`}
              type="button"
              disabled={pendingItems.includes(item.id)}
              onClick={() =>
                void (state === 'in_cart'
                  ? setItemState(item, 'to_buy', 0, '')
                  : setItemState(item, 'in_cart'))
              }
            >
              <ShoppingCart size={19} />{' '}
              <span>
                {state === 'in_cart'
                  ? 'Remove from cart'
                  : item.cartQuantity > 0
                    ? 'Add remaining'
                    : 'Add to cart'}
              </span>
            </button>
            <button
              className={`${styles.stateButton} ${styles.cantFindButton}`}
              type="button"
              disabled={pendingItems.includes(item.id)}
              onClick={() => void setItemState(item, 'cant_find')}
            >
              <CircleHelp size={19} /> <span>Can’t find</span>
            </button>
          </>
        )}
        {state === 'sourced' && (
          <details className={styles.sourcedActions}>
            <summary className="recipe-disclosure-summary">
              <span>Other actions</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div>
              <button
                type="button"
                disabled={pendingItems.includes(item.id)}
                onClick={() => void setItemState(item, 'in_cart')}
              >
                Move to cart
              </button>
              <button
                type="button"
                disabled={pendingItems.includes(item.id)}
                onClick={() => void setItemState(item, 'cant_find')}
              >
                Move to Can’t find
              </button>
            </div>
          </details>
        )}
        {state !== 'cant_find' && (state === 'in_cart' || item.cartQuantity > 0) ? (
          <button
            className={styles.cartQuantityButton}
            type="button"
            disabled={pendingItems.includes(item.id)}
            onClick={() => editCartQuantity(item)}
          >
            Change quantity
          </button>
        ) : null}
        {!focusedShopping && (
          <button
            className={styles.itemMenu}
            type="button"
            aria-label={`Edit ${item.item}`}
            onClick={() => openItemEditor(item)}
          >
            Edit
          </button>
        )}
        {suggestedMatches.length ? (
          <section
            className={styles.pantryMatchPanel}
            aria-label={`Pantry matches for ${item.item}`}
          >
            <strong>Match to item already in Pantry</strong>
            <div>
              {suggestedMatches.map((candidate) => {
                const product = pantryOptions.products.find(
                  (option) => option.id === candidate.productId,
                );
                return (
                  <button
                    key={candidate.productId}
                    type="button"
                    onClick={() => void matchPantryProduct(item, candidate.productId, 'suggested')}
                  >
                    <span>{candidate.displayName}</span>
                    <small>{pantryStockLabel(product)}</small>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
        {item.pantry && matchedProduct ? (
          <details className={styles.provenance}>
            <summary>
              {item.policyBreakdown ? 'Demand and policy breakdown' : 'Pantry details'}
            </summary>
            <p>{pantryStateLabel(item)}</p>
            {item.policyBreakdown ? (
              <dl>
                <div>
                  <dt>Meal plan</dt>
                  <dd>
                    {item.policyBreakdown.recipeRequirement} {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>
                    {item.policyBreakdown.mode === 'always_have'
                      ? 'Always have reserve'
                      : 'Always buy baseline'}
                  </dt>
                  <dd>
                    {item.policyBreakdown.policyContribution ?? 'Review'}{' '}
                    {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>Usable Pantry</dt>
                  <dd>
                    {item.policyBreakdown.usablePantry} {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>Pending coverage</dt>
                  <dd>
                    {item.policyBreakdown.pendingCoverage} {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>Recorded this trip</dt>
                  <dd>
                    {item.policyBreakdown.recordedCoverage} {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>Before package rounding</dt>
                  <dd>
                    {item.policyBreakdown.unroundedPurchaseGoal ?? 'Review'}{' '}
                    {item.policyBreakdown.unit}
                  </dd>
                </div>
                <div>
                  <dt>Final buy amount</dt>
                  <dd>
                    {item.policyBreakdown.finalBuyQuantity ?? 'Review'} {item.policyBreakdown.unit}
                  </dd>
                </div>
              </dl>
            ) : null}
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
                  Choose the matching Pantry item after shopping, then record what you bought.
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
                {item.policyBreakdown ? (
                  <button
                    type="button"
                    disabled={busy === `pantry-control:${item.id}`}
                    onClick={() => void updatePantryControl(item, { action: 'skip_policy' })}
                  >
                    Skip recurring purchase
                  </button>
                ) : null}
                {item.policyBreakdown?.needsReview ? (
                  <button
                    type="button"
                    disabled={busy === `pantry-control:${item.id}`}
                    onClick={() =>
                      void updatePantryControl(item, { action: 'assume_empty_for_trip' })
                    }
                  >
                    Assume empty for this trip
                  </button>
                ) : null}
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
        {unpackMode && (['in_cart', 'sourced'].includes(state) || item.cartQuantity > 0) ? (
          <details className={styles.intake} open={list.settings.openPantryPurchaseOnCheck}>
            <summary>Unpack into Pantry</summary>
            <div className={styles.intakeGrid}>
              {!item.pantry?.productId ? (
                <select
                  aria-label={`Pantry product for ${item.item}`}
                  value={intakeDraft.productId}
                  onChange={(event) => {
                    const productId = event.target.value;
                    updateIntakeDraft(item, { productId, status: '' });
                    if (productId) void matchPantryProduct(item, productId, 'manual', false);
                  }}
                >
                  <option value="">Refine item in Pantry</option>
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
                aria-label={`Add ${item.item} to Pantry`}
                onClick={() => void intake(item)}
              >
                Add to Pantry
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
    if (!sectionItems.length && state !== 'to_buy') return null;
    const groupedItems =
      groupMode === 'aisle'
        ? [
            ...list.aisles.map((aisle) => ({
              id: aisle.id,
              name: aisle.name,
              items: sectionItems.filter((item) => item.aisleId === aisle.id),
            })),
            {
              id: 'unassigned',
              name: 'Unassigned',
              items: sectionItems.filter((item) => !item.aisleId || !aisleById.has(item.aisleId)),
            },
          ].filter((group) => group.items.length)
        : [];
    return (
      <details
        className={`${styles.listSection} ${className}`}
        open={state !== 'sourced'}
        id={`shopping-items-${list.id}-${state}`}
        key={state}
      >
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
            groupMode === 'aisle' ? (
              groupedItems.map((group) => (
                <section
                  className={styles.aisleGroup}
                  id={`aisle-${list.id}-${state}-${group.id}`}
                  key={group.id}
                >
                  <h2>
                    <span>{group.name}</span>
                    <small>{group.items.length}</small>
                  </h2>
                  <div>{group.items.map(renderItem)}</div>
                </section>
              ))
            ) : (
              sectionItems.map(renderItem)
            )
          ) : (
            <p className={styles.emptyState}>
              {query
                ? 'No matching items in this section. Clear search to see the full list.'
                : 'Nothing here yet.'}
            </p>
          )}
        </div>
      </details>
    );
  };

  const openNotes = () => {
    setFocusedShopping(false);
    window.setTimeout(() => {
      const details = document.getElementById('shopping-list-notes') as HTMLDetailsElement | null;
      if (!details) return;
      details.open = true;
      details.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  const addListItem = () => {
    if (window.matchMedia('(max-width: 800px)').matches) {
      setMobileAddOpen((current) => !current);
      return;
    }
    setFocusedShopping(false);
    window.setTimeout(() => addItemInputRef.current?.focus(), 0);
  };

  const scrollToRemaining = () => {
    const state = wholeTrip.toBuy.length
      ? 'to_buy'
      : wholeTrip.cantFind.length
        ? 'cant_find'
        : 'in_cart';
    setQuery('');
    requestAnimationFrame(() => {
      const section = document.getElementById(
        `shopping-items-${list.id}-${state}`,
      ) as HTMLDetailsElement | null;
      if (section) {
        section.open = true;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        section.querySelector('summary')?.focus({ preventScroll: true });
      }
    });
  };

  return (
    <section className={`${styles.shoppingMode} ${focusedShopping ? styles.focusedShopping : ''}`}>
      <DialogViewport />
      <div className={styles.shoppingTaskbar}>
        <div>
          <strong>
            {remaining
              ? `${remaining} item${remaining === 1 ? '' : 's'} left to buy`
              : total
                ? 'Everything is accounted for'
                : 'Your list is ready'}
          </strong>
          <span>
            {total
              ? `${progressCount} of ${total} in cart or sourced`
              : 'Add an item or build a list from your meal plan.'}
          </span>
          {list.isAutomaticRestockTarget ? (
            <small className={styles.nextShopMark}>Next shop</small>
          ) : null}
        </div>
      </div>
      {lastChecked ? (
        <div className={styles.undoNotice} role="status">
          <span>{lastChecked.item.item} updated.</span>
          <button
            type="button"
            disabled={pendingItems.includes(lastChecked.item.id)}
            onClick={() => void restoreLastAction()}
          >
            <Undo2 size={16} /> Undo
          </button>
        </div>
      ) : null}
      <div className={styles.toolbar}>
        <label className={styles.search} aria-label="Search shopping items">
          <Search size={19} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search items"
            type="search"
          />
        </label>
        <details className={styles.toolsDisclosure}>
          <summary className="recipe-disclosure-summary">
            <span>Shopping tools</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <div className={styles.quickActions} aria-label="Shopping list tools">
            <button
              type="button"
              onClick={() => setScanOpen(true)}
              aria-label="Scan item"
              title="Scan item"
            >
              <ScanLine aria-hidden="true" />
              <span>Scan</span>
            </button>
            <button type="button" onClick={addListItem} aria-label="Add item" title="Add item">
              <Plus aria-hidden="true" />
              <span>Add</span>
            </button>
            <button type="button" onClick={openNotes} aria-label="Add note" title="Add note">
              <StickyNote aria-hidden="true" />
              <span>Note</span>
            </button>
            <button
              type="button"
              onClick={scrollToRemaining}
              aria-label={`${remaining} items remaining`}
              title="Items remaining"
            >
              <ListTodo aria-hidden="true" />
              <span>{remaining} left</span>
            </button>
            <button
              type="button"
              aria-pressed={unpackMode}
              onClick={() => setUnpackMode((current) => !current)}
              aria-label={unpackMode ? 'Close unpack mode' : 'Unpack groceries into Pantry'}
              title="Unpack groceries"
            >
              <PackageOpen aria-hidden="true" />
              <span>Unpack</span>
            </button>
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              aria-label="Chat with the kitchen assistant"
              title="Kitchen assistant"
            >
              <Sparkles aria-hidden="true" />
              <span>Assistant</span>
            </button>
            <button
              type="button"
              disabled={!lastChecked}
              onClick={() => void restoreLastAction()}
              aria-label="Undo last shopping action"
              title="Undo"
            >
              <Undo2 aria-hidden="true" />
              <span>Undo</span>
            </button>
          </div>
        </details>
        <div className={styles.shoppingModeSwitch} aria-label="Shopping list view">
          <button
            type="button"
            aria-pressed={focusedShopping}
            onClick={() => setFocusedShopping(true)}
          >
            <ShoppingCart size={17} /> Shopping mode
          </button>
          <button
            type="button"
            aria-pressed={!focusedShopping}
            onClick={() => setFocusedShopping(false)}
          >
            <Settings size={17} /> Manage list
          </button>
        </div>
      </div>

      {!focusedShopping ? (
        <div className={styles.topGrid}>
          <form
            className={styles.addItem}
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <input
              ref={addItemInputRef}
              value={newItem}
              onChange={(event) => setNewItem(event.target.value)}
              placeholder="Add an item..."
              aria-label="New shopping item"
            />
            <input
              value={newQuantity}
              onChange={(event) => setNewQuantity(event.target.value)}
              placeholder="Qty"
              aria-label="New shopping item quantity"
              inputMode="decimal"
            />
            <input
              value={newUnit}
              onChange={(event) => setNewUnit(event.target.value)}
              placeholder="Unit"
              aria-label="New shopping item unit"
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
            {list.isAutomaticRestockTarget ? (
              <strong className={styles.aisleBadge}>Next shop</strong>
            ) : (
              <button
                type="button"
                disabled={busy === 'next-shop'}
                onClick={() => void makeNextShop()}
              >
                {busy === 'next-shop' ? 'Updating…' : 'Make Next shop'}
              </button>
            )}
            <Link href="/settings/lists">
              <Settings size={17} /> Shopping settings
            </Link>
          </section>
        </div>
      ) : null}

      {list.policyReviews.some((review) => review.state === 'needs_review') ? (
        <section className={styles.restoredNotice} role="status">
          <strong>Pantry review needed</strong>{' '}
          {list.policyReviews
            .filter((review) => review.state === 'needs_review')
            .map((review) => review.productName)
            .join(', ')}{' '}
          has approximate or incompatible stock. Update Pantry, or open its row and assume empty for
          this trip.
        </section>
      ) : null}
      {list.policyReviews.some((review) => review.state === 'dismissed') ? (
        <section className={styles.restoredNotice} role="status">
          <strong>Skipped for this trip:</strong>{' '}
          {list.policyReviews
            .filter((review) => review.state === 'dismissed')
            .map((review) => (
              <button
                key={review.productId}
                type="button"
                disabled={busy === `policy:${review.productId}`}
                onClick={() => void updatePolicyReview(review.productId, 'restore_policy')}
              >
                Restore {review.productName}
              </button>
            ))}
        </section>
      ) : null}

      {syncError && (
        <p role="status" className={styles.syncNotice}>
          {syncError}
        </p>
      )}
      {!focusedShopping ? (
        <div className={styles.manageTools}>
          <ShoppingListShortcuts
            listId={list.id}
            currentNames={items.filter((item) => !item.checked).map((item) => item.item)}
            onAdded={(added) =>
              setItems((current) => [
                ...current,
                ...added.filter((item) => !current.some((existing) => existing.id === item.id)),
              ])
            }
          />
          {instacartEnabled ? (
            <InstacartShopping listId={list.id} items={items} configured={instacartEnabled} />
          ) : null}
          <div className={styles.utilities}>
            <KitchenPrintDialog kind="shopping-list" listId={list.id} />
            <ShoppingListNotes
              listId={list.id}
              initialNote={list.notes ?? ''}
              initialVersion={list.notesVersion ?? 0}
            />
            <div className={styles.desktopSort}>
              <label>
                <span>Sort</span>
                <select
                  aria-label="Sort shopping items"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="position">List order</option>
                  <option value="alpha">A to Z</option>
                  <option value="recent">Recently added</option>
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </label>
              <label>
                <span>Group</span>
                <select
                  aria-label="Group shopping items"
                  value={groupMode}
                  onChange={(event) => setGroupMode(event.target.value as GroupMode)}
                >
                  <option value="aisle">Aisle</option>
                  <option value="none">None</option>
                </select>
                <ChevronDown size={16} aria-hidden="true" />
              </label>
            </div>
          </div>
        </div>
      ) : null}
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
          <input
            value={newQuantity}
            onChange={(event) => setNewQuantity(event.target.value)}
            placeholder="Qty"
            aria-label="New shopping item quantity mobile"
            inputMode="decimal"
          />
          <input
            value={newUnit}
            onChange={(event) => setNewUnit(event.target.value)}
            placeholder="Unit"
            aria-label="New shopping item unit mobile"
          />
          <button type="submit" disabled={!newItem.trim()}>
            Add
          </button>
        </form>
      ) : null}

      {query && (
        <p role="status" className={styles.resultScope}>
          {searched.length} of {items.length} items match “{query}”.{' '}
          <button className="text-button" type="button" onClick={() => setQuery('')}>
            Clear search
          </button>
        </p>
      )}
      <nav className={styles.aisleNavigation} aria-label="Jump to shopping section">
        <button type="button" onClick={scrollToRemaining}>
          Remaining ({remaining})
        </button>
        {groupMode === 'aisle' &&
          [
            ...list.aisles.map((aisle) => ({ id: aisle.id, name: aisle.name })),
            { id: 'unassigned', name: 'Unassigned' },
          ]
            .filter((aisle) => toBuy.some((item) => (item.aisleId ?? 'unassigned') === aisle.id))
            .map((aisle) => (
              <a
                key={aisle.id}
                href={`#aisle-${list.id}-to_buy-${aisle.id}`}
                onClick={() => {
                  const details = document.getElementById(
                    `shopping-items-${list.id}-to_buy`,
                  ) as HTMLDetailsElement | null;
                  if (details) details.open = true;
                }}
              >
                {aisle.name}
              </a>
            ))}
      </nav>
      <div className={styles.contentGrid}>
        <div className={styles.listColumn}>
          {!focusedShopping && (
            <DecisionAssistance
              embedded
              key={`${list.id}:${list.supermarketProfileId}`}
              listId={list.id}
              storeId={list.supermarketProfileId ?? undefined}
              initialTask="aisles"
              onApplied={() => {
                void fetch(`/api/v1/shopping-lists/${list.id}`)
                  .then((response) => (response.ok ? response.json() : null))
                  .then((body) => {
                    if (body?.list)
                      setItems(
                        body.list.items.map((item: Item) => ({
                          ...item,
                          shoppingState: normalizedState(item),
                        })),
                      );
                  })
                  .catch(() =>
                    showToast('Matches saved. Reload the list to see the updated route.', 'error'),
                  );
              }}
              tasks={['aisles', 'duplicates']}
              title="Prepare this shopping trip"
              description="Place unassigned items along your store route and review possible duplicates. Your aisle corrections stay in place."
            />
          )}

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
              <span>{wholeTrip.sourced.length} sourced</span>
              <span>{wholeTrip.inCart.length} in cart</span>
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
              <Lightbulb size={19} /> Tips
            </h2>
            <p>Group by aisle to shop faster and avoid backtracking.</p>
          </section>
        </aside>
      </div>

      <nav className={styles.mobileDock} aria-label="Shopping list totals">
        <button className={styles.dockMetric} type="button" onClick={scrollToRemaining}>
          <ListTodo />
          <strong>{remaining}</strong>
          <small>Items left</small>
        </button>
        <button type="button" onClick={() => setAssistantOpen(true)}>
          <Sparkles /> Assistant
        </button>
        <button
          type="button"
          aria-pressed={unpackMode}
          onClick={() => setUnpackMode((mode) => !mode)}
        >
          <PackageOpen /> Unpack
        </button>
        <button type="button" onClick={() => setReviewOpen(true)}>
          <ClipboardCheck /> Review trip
        </button>
      </nav>

      {editingItem && items.some((item) => item.id === editingItem.id) && (
        <AppDialog
          className={styles.editDialog}
          aria-labelledby="shopping-item-edit-title"
          onClose={() => {
            if (busy !== 'edit') setEditingItem(null);
          }}
        >
          <header>
            <div>
              <h2 id="shopping-item-edit-title">Edit item</h2>
              <p>{items.find((item) => item.id === editingItem.id)?.item}</p>
            </div>
            <button
              type="button"
              disabled={busy === 'edit'}
              aria-label="Close item editor"
              onClick={() => setEditingItem(null)}
            >
              <X />
            </button>
          </header>
          <form onSubmit={(event) => void commitItemEdit(event)}>
            <fieldset role="presentation" disabled={!!busy} className={styles.editBody}>
              <label>
                Name
                <input
                  value={editingItem.name}
                  maxLength={160}
                  required
                  onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })}
                />
              </label>
              <label>
                To buy quantity
                <input
                  inputMode="decimal"
                  value={editingItem.quantity}
                  onChange={(event) =>
                    setEditingItem({ ...editingItem, quantity: event.target.value })
                  }
                  aria-describedby="buy-quantity-help"
                />
              </label>
              {items.find((item) => item.id === editingItem.id)?.quantity === null &&
                items.find((item) => item.id === editingItem.id)?.pantry?.demandState ===
                  'uncertain' && (
                  <p>
                    Planned recipe demand:{' '}
                    {shoppingQuantitySummary(
                      items.find((item) => item.id === editingItem.id)!,
                    ).primary.replace(/ recipe demand$/u, '')}
                    . This is context only; enter the amount you intend to buy separately.
                  </p>
                )}
              <p id="buy-quantity-help">
                Blank means the buy quantity is unknown.{' '}
                {
                  shoppingQuantitySummary(items.find((item) => item.id === editingItem.id)!)
                    .calculation
                }{' '}
                Recipe demand and Pantry stock are separate.
              </p>
              <label>
                Unit
                <input
                  value={editingItem.unit}
                  maxLength={30}
                  onChange={(event) => setEditingItem({ ...editingItem, unit: event.target.value })}
                />
              </label>
              <label>
                Aisle
                <select
                  aria-label="Aisle"
                  value={editingItem.aisleId}
                  onChange={(event) =>
                    setEditingItem({ ...editingItem, aisleId: event.target.value })
                  }
                >
                  <option value="">Unassigned</option>
                  {list.aisles.map((aisle) => (
                    <option key={aisle.id} value={aisle.id}>
                      {aisle.name}
                    </option>
                  ))}
                </select>
              </label>
              {editError && <p role="alert">{editError}</p>}
              {sortMode !== 'position' && (
                <p>
                  Movement uses List order.{' '}
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setSortMode('position')}
                  >
                    Use List order
                  </button>
                </p>
              )}
              <p>
                Movement saves immediately. Cancel keeps that order and discards unsaved field
                edits.
              </p>
              <div className={styles.editActions}>
                {([-1, 1] as const).map((direction) => {
                  const item = items.find((entry) => entry.id === editingItem.id)!;
                  const context = movementContext(item);
                  const index = context.findIndex((entry) => entry.id === item.id);
                  return (
                    <button
                      key={direction}
                      type="button"
                      disabled={sortMode !== 'position' || !!busy || !context[index + direction]}
                      onClick={() => void reorder(item, direction)}
                    >
                      {direction === -1 ? <ArrowUp size={16} /> : <ArrowDown size={16} />} Move{' '}
                      {direction === -1 ? 'up' : 'down'}
                    </button>
                  );
                })}
                <button
                  className="text-button"
                  type="button"
                  disabled={!!busy}
                  onClick={() => {
                    const item = items.find((entry) => entry.id === editingItem.id)!;
                    if (window.confirm(`Remove “${item.item}” from this shopping list?`))
                      void remove(item).then((removed) => {
                        if (removed) setEditingItem(null);
                      });
                  }}
                >
                  <Trash2 size={16} /> Remove item
                </button>
              </div>
            </fieldset>
            <footer>
              <button type="button" disabled={busy === 'edit'} onClick={() => setEditingItem(null)}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={!!busy}>
                {busy === 'edit' ? 'Saving…' : 'Save changes'}
              </button>
            </footer>
          </form>
        </AppDialog>
      )}

      <dialog
        className={`${styles.workflowDialog} ${styles.quantityDialog}`}
        ref={cartQuantityDialogRef}
        aria-labelledby="cart-quantity-title"
        onClose={() => setCartQuantityItem(null)}
      >
        <header>
          <div>
            <span className={styles.dialogIcon}>
              <ShoppingCart />
            </span>
            <div>
              <h2 id="cart-quantity-title">Change quantity in cart</h2>
              <p>{cartQuantityItem?.item}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close quantity editor"
            onClick={() => setCartQuantityItem(null)}
          >
            <X />
          </button>
        </header>
        <form
          className={styles.cartQuantityForm}
          onSubmit={(event) => void saveCartQuantity(event)}
        >
          <label>
            Quantity bought ({cartQuantityItem?.unit || 'units'})
            <input
              type="number"
              min="0"
              max="10000"
              step="any"
              inputMode="decimal"
              value={cartQuantityDraft}
              onChange={(event) => setCartQuantityDraft(event.target.value)}
            />
          </label>
          <p>
            {cartQuantityItem?.quantity !== null && cartQuantityItem?.quantity !== undefined
              ? `Needed: ${formatQuantity(cartQuantityItem.quantity, cartQuantityItem.unit)}. Any amount left stays on the shopping list.`
              : 'Record what you found. The item stays on the list when the quantity is zero.'}
          </p>
          <footer>
            <button type="button" onClick={() => setCartQuantityItem(null)}>
              Cancel
            </button>
            <button type="submit">Save quantity</button>
          </footer>
        </form>
      </dialog>

      {assistantOpen ? (
        <AiAssistantDrawer
          open
          onClose={() => setAssistantOpen(false)}
          startNewThreadOnOpen
          initialDraft={`I’m shopping from “${list.name}” (list ID ${list.id}). Help me manage this list: add, edit, remove, reorder or substitute items; keep cart quantities and remaining amounts accurate; and preserve unrelated notes. Ask me before proposing changes, then prepare reviewed list actions I can confirm.`}
        />
      ) : null}

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
                {unpackMode ? 'Quantity purchased in this scan' : 'Quantity found in this scan'}
                <input
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={scanQuantity}
                  onChange={(event) => setScanQuantity(event.target.value)}
                />
              </label>
              <p className={styles.scanQuantityHint}>
                {scanMatches.length
                  ? 'This amount adds to the quantity already recorded for the matched item.'
                  : 'The scanned product name is saved with this quantity.'}
              </p>
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
                  <div className={styles.scanNoMatch}>
                    <p>
                      Add this product as a new list item. Its generic name stays on the list, and
                      the scanned brand is kept as the item you put in the cart.
                    </p>
                    <button
                      type="button"
                      disabled={busy === 'scan-add'}
                      onClick={() => void addScannedItem()}
                    >
                      {busy === 'scan-add'
                        ? 'Adding…'
                        : unpackMode
                          ? 'Add scanned item for unpacking'
                          : 'Add scanned item to cart'}
                    </button>
                  </div>
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
          {!wholeTrip.toBuy.length && !wholeTrip.cantFind.length ? (
            <section className={styles.reviewComplete}>
              <CheckCircle2 />
              <h3>Everything is accounted for</h3>
              <p>Open unpack mode to record the products you brought home in Pantry.</p>
              <button
                type="button"
                onClick={() => {
                  setReviewOpen(false);
                  setUnpackMode(true);
                }}
              >
                <PackageOpen size={17} /> Unpack groceries
              </button>
              <Link href="/lists">Finish shopping</Link>
            </section>
          ) : (
            <>
              {wholeTrip.toBuy.length ? (
                <section className={styles.reviewGroup}>
                  <h3>
                    Still to buy <span>{wholeTrip.toBuy.length}</span>
                  </h3>
                  <p>These items have not been marked as in your cart.</p>
                  <ul>
                    {wholeTrip.toBuy.map((item) => (
                      <li key={item.id}>
                        <span>{item.item}</span>
                        <button
                          type="button"
                          disabled={pendingItems.includes(item.id)}
                          onClick={() => void setItemState(item, 'in_cart')}
                        >
                          Found it
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {wholeTrip.cantFind.length ? (
                <section className={`${styles.reviewGroup} ${styles.reviewWarning}`}>
                  <h3>
                    Can’t find <span>{wholeTrip.cantFind.length}</span>
                  </h3>
                  <p>
                    Try substitutes now, loop back through the store, or make a list for another
                    supermarket.
                  </p>
                  <ul>
                    {wholeTrip.cantFind.map((item) => (
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
              {wholeTrip.cantFind.length ? (
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
