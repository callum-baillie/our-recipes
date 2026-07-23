'use client';

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CircleHelp,
  Lightbulb,
  ListFilter,
  PackageOpen,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  StickyNote,
  Store,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import { useToast } from '@/components/toast-provider';
import type { ShoppingListDetail } from '@/lib/services/planning-service';

import styles from './shopping-list-editor.module.css';

type Item = ShoppingListDetail['items'][number];
type ShoppingState = Item['shoppingState'];
type Filter = 'all' | 'to_buy' | 'in_cart' | 'sourced';

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
  return item.checked ? 'sourced' : item.shoppingState === 'sourced' ? 'to_buy' : item.shoppingState;
}

function itemAmount(item: Item): string {
  return [item.quantity ?? '', item.unit].filter((value) => value !== '').join(' ') || 'Quantity not set';
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
  const [pantryOptions, setPantryOptions] = useState<PantryOptions>({ products: [], locations: [] });
  const [intakeDrafts, setIntakeDrafts] = useState<Record<string, IntakeDraft>>({});
  const [operationTracker] = useState(() =>
    createIntakeOperationTracker(() => crypto.randomUUID()),
  );

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

  const aisleById = useMemo(() => new Map(list.aisles.map((aisle) => [aisle.id, aisle.name])), [list.aisles]);
  const searched = items.filter((item) => item.item.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const itemsByState = (state: ShoppingState) =>
    searched.filter((item) => normalizedState(item) === state);
  const toBuy = itemsByState('to_buy');
  const inCart = itemsByState('in_cart');
  const cantFind = itemsByState('cant_find');
  const sourced = itemsByState('sourced');
  const total = items.length;
  const progressCount = items.filter((item) => ['in_cart', 'sourced'].includes(normalizedState(item))).length;
  const remaining = items.filter((item) => ['to_buy', 'cant_find'].includes(normalizedState(item))).length;
  const progress = total ? Math.round((progressCount / total) * 100) : 0;

  const updateLocal = (id: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const save = async (item: Item) => {
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
  };

  const setItemState = async (item: Item, state: ShoppingState) => {
    const changed = { ...item, shoppingState: state, checked: state === 'sourced' };
    updateLocal(item.id, changed);
    if (!(await save(changed))) updateLocal(item.id, item);
  };

  const add = async () => {
    if (!newItem.trim()) return;
    setBusy('add');
    const response = await fetch(`/api/v1/shopping-lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quantity: '', unit: '', item: newItem, note: '', checked: false, shoppingState: 'to_buy',
      }),
    });
    const body = (await response.json().catch(() => null)) as { item?: Item } | null;
    if (!response.ok || !body?.item) showToast('Could not add that shopping item.', 'error');
    else {
      setItems((current) => [...current, body.item!]);
      setNewItem('');
      setMobileAddOpen(false);
      showToast(`${body.item.item} added.`, 'success');
    }
    setBusy('');
  };

  const remove = async (item: Item) => {
    const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, { method: 'DELETE' });
    if (!response.ok) showToast(`Could not remove ${item.item}.`, 'error');
    else setItems((current) => current.filter((entry) => entry.id !== item.id));
  };

  const reorder = async (item: Item, direction: -1 | 1) => {
    const index = items.findIndex((entry) => entry.id === item.id);
    const swap = index + direction;
    if (index < 0 || swap < 0 || swap >= items.length) return;
    const next = [...items];
    [next[index], next[swap]] = [next[swap], next[index]];
    setItems(next);
    const response = await fetch(`/api/v1/shopping-lists/${list.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: next.map((entry) => entry.id) }),
    });
    if (!response.ok) {
      setItems(items);
      showToast('Could not save that item order.', 'error');
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
    const body = (await response.json().catch(() => null)) as { list?: { id: string }; error?: { message?: string } } | null;
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

  const intake = async (item: Item) => {
    const draft = intakeDrafts[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id);
    const productId = item.pantry?.productId ?? draft.productId;
    const locationId = draft.locationId || pantryOptions.locations[0]?.id;
    if (!productId || !locationId || !draft.quantity || !draft.unit) {
      const message = 'Enter an exact quantity, unit, product, and location.';
      updateIntakeDraft(item, { productId: productId ?? '', locationId: locationId ?? '', status: message });
      showToast(message, 'error');
      return;
    }
    const operationKey = operationTracker.begin(item.id);
    updateIntakeDraft(item, { operationKey, status: 'Adding to Pantry…' });
    const result = await runTrackedIntakeOperation(operationTracker, item.id, async (key) => {
      const response = await fetch(`/api/v1/shopping-lists/${list.id}/items/${item.id}/pantry-intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          operationKey: key,
          productId,
          locationId,
          ...(draft.purchasePriceCents ? { purchasePriceCents: draft.purchasePriceCents } : {}),
          notes: draft.notes || `Purchased from ${list.name}`,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { confirmed: response.ok, value: body };
    });
    if (result.outcome === 'confirmed') {
      updateIntakeDraft(item, { operationKey: result.nextOperationKey, status: 'Added to Pantry. A later purchase can be added separately.' });
      showToast(`${item.item} added to Pantry.`, 'success');
    } else {
      const message = result.outcome === 'unknown' ? 'The result is unknown. Retry to safely check the same Pantry operation.' : (result.value?.error?.message ?? 'Could not add to Pantry.');
      updateIntakeDraft(item, { status: message });
      showToast(message, 'error');
    }
  };

  const renderItem = (item: Item) => {
    const state = normalizedState(item);
    const intakeDraft = intakeDrafts[item.id] ?? emptyIntakeDraft(item, pantryOptions.locations[0]?.id);
    const aisleName = item.aisleId ? aisleById.get(item.aisleId) : undefined;
    return (
      <article className={`${styles.item} ${state === 'sourced' ? styles.sourcedItem : ''}`} key={item.id}>
        <label className={`${styles.sourceToggle} ${state === 'sourced' ? styles.sourceToggleActive : ''}`}>
          <input
            type="checkbox"
            checked={state === 'sourced'}
            aria-label={`Mark ${item.item} complete`}
            onChange={() => void setItemState(item, state === 'sourced' ? 'to_buy' : 'sourced')}
          />
          {state === 'sourced' ? <Check size={18} /> : null}
        </label>
        <span className={styles.itemThumb}><PackageOpen size={24} aria-hidden="true" /></span>
        <div className={styles.itemIdentity}>
          <strong>{item.item}</strong>
          <span>{itemAmount(item)}</span>
          <span className={`${styles.aisleBadge} ${!aisleName ? styles.unassignedBadge : ''}`}>{aisleName ?? 'Unassigned'}</span>
        </div>
        <button
          className={`${styles.stateButton} ${state === 'in_cart' ? styles.stateButtonActive : ''}`}
          type="button"
          onClick={() => void setItemState(item, state === 'in_cart' ? 'to_buy' : 'in_cart')}
        >
          <ShoppingCart size={19} /> <span>In Cart</span>
        </button>
        <button
          className={`${styles.stateButton} ${styles.cantFindButton} ${state === 'cant_find' ? styles.cantFindActive : ''}`}
          type="button"
          onClick={() => void setItemState(item, state === 'cant_find' ? 'to_buy' : 'cant_find')}
        >
          <CircleHelp size={19} /> <span>Cant Find</span>
        </button>
        <details className={styles.itemMenu}>
          <summary aria-label={`Edit ${item.item}`}>•••</summary>
          <div className={styles.itemEditor}>
            <input aria-label={`Shopping item ${items.findIndex((entry) => entry.id === item.id) + 1}`} value={item.item} onChange={(event) => updateLocal(item.id, { item: event.target.value })} onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)} />
            <input aria-label={`${item.item} quantity`} inputMode="decimal" value={item.quantity ?? ''} onChange={(event) => updateLocal(item.id, { quantity: event.target.value === '' ? null : Number(event.target.value) })} onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)} />
            <input aria-label={`${item.item} unit`} value={item.unit} onChange={(event) => updateLocal(item.id, { unit: event.target.value })} onBlur={() => void save(items.find((entry) => entry.id === item.id) ?? item)} />
            <select aria-label={`Aisle for ${item.item}`} value={item.aisleId ?? ''} onChange={(event) => { const changed = { ...item, aisleId: event.target.value || null }; updateLocal(item.id, changed); void save(changed); }}>
              <option value="">Unassigned</option>
              {list.aisles.map((aisle) => <option key={aisle.id} value={aisle.id}>{aisle.name}</option>)}
            </select>
            <button type="button" onClick={() => void reorder(item, -1)}><ArrowUp size={15} /> Move up</button>
            <button type="button" onClick={() => void reorder(item, 1)}><ArrowDown size={15} /> Move down</button>
            <button type="button" onClick={() => void remove(item)}><Trash2 size={15} /> Remove</button>
          </div>
        </details>
        {item.pantry ? (
          <details className={styles.provenance}>
            <summary>{pantryStateLabel(item)}</summary>
            {pantryContributions(item).length ? <ul>{pantryContributions(item).map((entry) => <li key={`${entry.mealPlanEntryId}:${entry.ingredientId}`}>{entry.recipeTitle} · {entry.plannedFor} · {entry.servings} servings</li>)}</ul> : null}
          </details>
        ) : null}
        {state === 'sourced' && item.pantry ? (
          <details className={styles.intake} open={list.settings.openPantryPurchaseOnCheck}>
            <summary>Record an actual Pantry purchase</summary>
            <div className={styles.intakeGrid}>
              {!item.pantry.productId ? <select aria-label={`Pantry product for ${item.item}`} value={intakeDraft.productId} onChange={(event) => updateIntakeDraft(item, { productId: event.target.value, status: '' })}><option value="">Choose Pantry product</option>{pantryOptions.products.map((product) => <option key={product.id} value={product.id}>{product.displayName}</option>)}</select> : null}
              <select aria-label={`Pantry location for ${item.item}`} value={intakeDraft.locationId} onChange={(event) => updateIntakeDraft(item, { locationId: event.target.value, status: '' })}><option value="">Choose Pantry location</option>{pantryOptions.locations.map((location) => <option key={location.id} value={location.id}>{location.path}</option>)}</select>
              <input aria-label={`Purchased quantity for ${item.item}`} value={intakeDraft.quantity} onChange={(event) => updateIntakeDraft(item, { quantity: event.target.value, status: '' })} placeholder="Actual quantity" />
              <input aria-label={`Purchased unit for ${item.item}`} value={intakeDraft.unit} onChange={(event) => updateIntakeDraft(item, { unit: event.target.value, status: '' })} placeholder="Unit" />
              <select aria-label={`Coverage mode for ${item.item}`} value={intakeDraft.intakeMode} onChange={(event) => updateIntakeDraft(item, { intakeMode: event.target.value as 'partial' | 'complete' })}><option value="partial">Partial purchase</option><option value="complete">Complete item</option></select>
              {([['packageCount','Package count'],['amountPerPackage','Amount per package'],['packageUnit','Package unit'],['sublocation','Shelf or sublocation'],['purchasePriceCents','Purchase price in cents'],['store','Store'],['source','Source']] as const).map(([field,label]) => <input key={field} aria-label={`${label} for ${item.item}`} value={intakeDraft[field]} onChange={(event) => updateIntakeDraft(item, { [field]: event.target.value })} placeholder={label} />)}
              {([['purchaseDate','Purchase date'],['bestBeforeDate','Best-before date'],['useByDate','Use-by date'],['sellByDate','Sell-by date']] as const).map(([field,label]) => <label key={field}>{label}<input type="date" aria-label={label} value={intakeDraft[field]} onChange={(event) => updateIntakeDraft(item, { [field]: event.target.value })} /></label>)}
              <textarea aria-label={`Purchase notes for ${item.item}`} value={intakeDraft.notes} onChange={(event) => updateIntakeDraft(item, { notes: event.target.value })} placeholder="Purchase notes" />
              <button type="button" aria-label="Add purchased to Pantry · Confirm and add to Pantry" onClick={() => void intake(item)}>Confirm and add to Pantry</button>
              {intakeDrafts[item.id]?.status ? <span role="status">{intakeDrafts[item.id]!.status}</span> : null}
            </div>
          </details>
        ) : null}
      </article>
    );
  };

  const section = (state: ShoppingState, title: string, sectionItems: Item[], className = '') => {
    if (filter !== 'all' && (state === 'cant_find' || filter !== state)) return null;
    if (!sectionItems.length && state !== 'to_buy') return null;
    return (
      <details className={`${styles.listSection} ${className}`} open key={state}>
        <summary><span>{state === 'to_buy' ? <><span className={styles.desktopSectionTitle}>Items to buy</span><span className={styles.mobileSectionTitle}>To buy</span></> : title} <small>· {sectionItems.length}</small></span><ChevronDown size={18} /></summary>
        <div className={styles.items}>{sectionItems.length ? sectionItems.map(renderItem) : <p className={styles.emptyState}>Nothing here yet.</p>}</div>
      </details>
    );
  };

  return (
    <section className={styles.shoppingMode}>
      <div className={styles.mobileSummary}>
        <div className={styles.mobileProgressCard}>
          <span className={styles.progressRing} style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties} />
          <span><strong>{remaining} of {total} remaining</strong><small>{progress}% complete</small></span>
        </div>
        <Link className={styles.mobileSettings} href="/settings/lists"><ListFilter /><Settings size={20} /><span>List settings</span><ChevronDown /></Link>
      </div>

      <div className={styles.topGrid}>
        <form className={styles.addItem} onSubmit={(event) => { event.preventDefault(); void add(); }}>
          <input value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Add an item..." aria-label="New shopping item" />
          <button type="submit" disabled={busy === 'add' || !newItem.trim()}><Plus size={18} /> Add item</button>
        </form>
        <section className={styles.storePanel} aria-label="Supermarket for this list">
          <label><span>Shopping at</span><select value={selectedSupermarketId} disabled={busy === 'store'} onChange={(event) => void switchSupermarket(event.target.value)}><option value="">No supermarket profile</option>{list.supermarketProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.locationLabel ? ` · ${profile.locationLabel}` : ''}</option>)}</select></label>
          <Link href="/settings/lists"><Settings size={17} /> List settings</Link>
        </section>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search items..." /></label>
        <div className={styles.filters} aria-label="Filter shopping items">{([['all','All'],['to_buy','To buy'],['in_cart','In cart'],['sourced','Sourced']] as const).map(([value,label]) => <button key={value} className={filter === value ? styles.activeFilter : ''} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div>
        <div className={styles.desktopSort}><button type="button">Sort: <strong>A → Z</strong><ChevronDown size={16} /></button><button type="button">Group: <strong>Aisle</strong><ChevronDown size={16} /></button></div>
      </div>

      <div className={styles.contentGrid}>
        <div className={styles.listColumn}>
          {section('to_buy', 'Items to buy', toBuy)}
          {section('in_cart', 'In cart', inCart, styles.inCartSection)}
          {section('sourced', 'Sourced', sourced, styles.sourcedSection)}
          {section('cant_find', 'Can’t find', cantFind, styles.cantFindSection)}
          {cantFind.length ? (
            <section className={styles.retryPanel}>
              <div><Store size={21} /><span><strong>Try another store</strong><small>Move these items into a new list, ordered for that store.</small></span></div>
              {alternativeProfiles.length ? <div className={styles.retryControls}><select aria-label="Choose another supermarket" value={retrySupermarketId} onChange={(event) => setRetrySupermarketId(event.target.value)}>{alternativeProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.locationLabel ? ` · ${profile.locationLabel}` : ''}</option>)}</select><button type="button" disabled={busy === 'retry'} onClick={() => void retryAtAnotherStore()}>Try other store</button></div> : <Link href="/settings/lists">Add another supermarket profile</Link>}
            </section>
          ) : null}
        </div>

        <aside className={styles.sideRail}>
          <section><h2><Settings size={19} /> List progress</h2><div className={styles.railProgress}><span className={styles.progressRing} style={{ '--progress': `${progress * 3.6}deg` } as CSSProperties} /><strong>{remaining} of {total}<small>remaining</small></strong></div><div className={styles.progressBar}><span style={{ width: `${progress}%` }} /></div><footer><span>{sourced.length} sourced</span><span>{inCart.length} in cart</span></footer></section>
          <section><h2><Store size={19} /> Shopping at</h2><strong>{list.supermarketProfile?.name ?? 'No supermarket profile'}</strong><p>{list.supermarketProfile ? (list.supermarketProfile.locationLabel || 'Aisles are ordered for this store.') : 'Choose a store profile to see aisles and prices.'}</p><Link href="/settings/lists">Manage profiles →</Link></section>
          <section><h2><StickyNote size={19} /> Notes</h2><p>Add a note for this list...</p></section>
          <section><h2><Lightbulb size={19} /> Tips</h2><p>Group by aisle to shop faster and avoid backtracking.</p></section>
        </aside>
      </div>

      {mobileAddOpen ? <form className={styles.mobileAddPanel} onSubmit={(event) => { event.preventDefault(); void add(); }}><input autoFocus value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Add an item..." aria-label="New shopping item mobile" /><button type="submit" disabled={!newItem.trim()}>Add</button></form> : null}
      <nav className={styles.mobileDock} aria-label="Shopping list totals"><span><ShoppingCart /><strong>{inCart.length}</strong><small>In cart</small></span><span><Check /><strong>{sourced.length}</strong><small>Sourced</small></span><button type="button" onClick={() => setMobileAddOpen((current) => !current)}><Plus /> Add item</button></nav>
    </section>
  );
}
