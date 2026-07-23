'use client';

import {
  ArrowDownUp,
  Bolt,
  Box,
  CalendarClock,
  ChevronDown,
  Clock3,
  History,
  Leaf,
  MapPin,
  MoreHorizontal,
  Package,
  PackageOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Snowflake,
  Thermometer,
  Undo2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PageSkeleton } from '@/components/skeleton';
import { FoodCatalogPicker } from '@/components/food-catalog-picker';
import type { FoodRecord } from '@/lib/domain/food-data';

import styles from './pantry-manager.module.css';

type Product = {
  id: string;
  displayName: string;
  brand: string;
  variant: string;
  category: string;
  subcategory: string;
  aliases: string[];
  defaultInventoryUnit: string;
  defaultPackageAmount: number | null;
  defaultPackageUnit: string;
  defaultStorageType: string;
  dietaryTags: string;
  allergens: string;
  storageInstructions: string;
  defaultShelfLifeDays: number | null;
  shelfLifeAfterOpeningDays: number | null;
  isStaple: boolean;
  preferredBrand: string;
  preferredStore: string;
  minimumStock: number | null;
  targetStock: number | null;
  reorderThreshold: number | null;
  preferredPurchaseQuantity: number | null;
  stockUnit: string;
  suggestGroceryRestock: boolean;
  archivedAt: string | null;
};

type Location = {
  id: string;
  name: string;
  path: string;
  storageType: string;
  depth: number;
  parentId: string | null;
  description: string;
  position: number;
  archivedAt: string | null;
};

type Batch = {
  id: string;
  productId: string;
  quantityRemaining: number | null;
  originalQuantity: number | null;
  unit: string;
  packageCount: number | null;
  amountPerPackage: number | null;
  packageUnit: string;
  approximateState: string | null;
  locationId: string;
  sublocation: string;
  purchaseDate: string | null;
  bestBeforeDate: string | null;
  useByDate: string | null;
  sellByDate: string | null;
  openedDate: string | null;
  frozenDate: string | null;
  thawedDate: string | null;
  preparedDate: string | null;
  expiryPrecision: 'exact' | 'estimated' | 'month_only' | 'unknown';
  status: string;
  purchasePriceCents: number | null;
  source: string;
  version: number;
  notes: string;
  excludeFromGrocery: boolean;
  sourceRecipeId: string | null;
  sourceMealPlanEntryId: string | null;
  sourceShoppingListItemId: string | null;
  createdAt: string;
  updatedAt: string;
  product: Product;
  location: Location;
  expiry: {
    state: 'fresh' | 'soon' | 'expired' | 'unknown';
    kind: 'use_by' | 'best_before' | 'sell_by' | 'opened_shelf_life' | 'unknown';
    date: string | null;
    days: number | null;
  };
  quantityLabel: string;
};

type PantryEvent = {
  id: string;
  batchId: string;
  productId: string;
  productName: string;
  eventType: string;
  reason: string;
  createdAt: string;
};

type Dashboard = {
  summary: {
    activeItems: number;
    expiringSoon: number;
    expired: number;
    lowStockStaples: number;
    openedItems: number;
    recentlyChanged: number;
  };
  products: Product[];
  locations: Location[];
  batches: Batch[];
  recentEvents: PantryEvent[];
  lowStockProductIds: string[];
};

type ErrorBody = { error?: { message?: string } };

const units = [
  'each',
  'dozen',
  'package',
  'can',
  'bottle',
  'carton',
  'g',
  'kg',
  'oz',
  'lb',
  'ml',
  'l',
  'tsp',
  'tbsp',
  'cup',
  'gallon',
];
const views = [
  ['all', 'All'],
  ['pantry', 'Pantry'],
  ['refrigerator', 'Refrigerator'],
  ['freezer', 'Freezer'],
  ['low_stock', 'Low stock'],
  ['opened', 'Opened'],
  ['unopened', 'Unopened'],
  ['frozen', 'Frozen'],
  ['depleted', 'Depleted'],
  ['discarded', 'Discarded'],
  ['donated', 'Donated'],
  ['recent', 'Recent'],
] as const;
const sortOptions = [
  ['expiry', 'Expiry date'],
  ['name', 'Product name'],
  ['quantity', 'Quantity'],
  ['location', 'Location'],
  ['updated', 'Recently updated'],
  ['added', 'Recently added'],
] as const;

function foodProviderLabel(provider: FoodRecord['provider']) {
  return provider === 'usda_fdc' ? 'USDA FoodData Central' : 'Open Food Facts';
}

function suggestedInventoryUnit(record: FoodRecord) {
  const amount = `${record.quantity} ${record.servingSize}`.toLocaleLowerCase();
  const match = amount.match(/\d\s*(kg|ml|lb|oz|g|l)\b/u);
  return match?.[1] ?? 'each';
}

async function messageFor(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorBody | null;
  return body?.error?.message ?? fallback;
}

function summaryCards(dashboard: Dashboard) {
  return [
    {
      label: 'On hand',
      value: dashboard.summary.activeItems,
      detail: 'items',
      icon: Package,
      tone: 'olive',
    },
    {
      label: 'Expiring soon',
      value: dashboard.summary.expiringSoon,
      detail: 'items',
      icon: CalendarClock,
      tone: 'amber',
    },
    {
      label: 'Low stock',
      value: dashboard.summary.lowStockStaples,
      detail: 'items',
      icon: ArrowDownUp,
      tone: 'coral',
    },
    {
      label: 'Opened',
      value: dashboard.summary.openedItems,
      detail: 'items',
      icon: Leaf,
      tone: 'green',
    },
    {
      label: 'Recent changes',
      value: dashboard.summary.recentlyChanged,
      detail: 'in the last 7 days',
      icon: History,
      tone: 'slate',
    },
  ] as const;
}

function formatExpiryDate(batch: Batch): string {
  if (!batch.expiry.date) return 'No date';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(`${batch.expiry.date}T00:00:00`));
}

function batchStateLabel(batch: Batch, isLowStock: boolean): string {
  if (isLowStock) return 'Low stock';
  if (batch.expiry.state === 'expired') return 'Date passed';
  if (batch.expiry.state === 'soon') return 'Expiring soon';
  if (batch.status === 'opened') return 'Opened';
  return 'Good';
}

function LocationGlyph({ storageType }: { storageType: string }) {
  const Icon =
    storageType === 'freezer' ? Snowflake : storageType === 'refrigerator' ? Thermometer : Box;
  return <Icon size={16} aria-hidden="true" />;
}

function expiryLabel(batch: Batch): string {
  if (!batch.expiry.date) return 'Expiry unknown';
  const kind = {
    use_by: 'Use-by recorded',
    best_before: 'Best-before quality date',
    sell_by: 'Sell-by recorded',
    opened_shelf_life: 'Opened shelf-life estimate',
    unknown: 'Recorded date',
  }[batch.expiry.kind];
  const precision = batch.expiryPrecision.replaceAll('_', ' ');
  const timing =
    batch.expiry.state === 'expired'
      ? 'date passed'
      : batch.expiry.state === 'soon'
        ? 'approaching'
        : 'recorded';
  return `${kind} · ${batch.expiry.date} · ${precision} · ${timing}`;
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

function jsonList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function ProductEditFields({ product }: { product: Product }) {
  return (
    <>
      <div className={styles.formRow}>
        <label>
          <span>Name</span>
          <input name="displayName" defaultValue={product.displayName} required />
        </label>
        <label>
          <span>Aliases (comma separated)</span>
          <input name="aliases" defaultValue={product.aliases.join(', ')} />
        </label>
        <label>
          <span>Brand</span>
          <input name="brand" defaultValue={product.brand} />
        </label>
        <label>
          <span>Variant</span>
          <input name="variant" defaultValue={product.variant} />
        </label>
        <label>
          <span>Category</span>
          <input name="category" defaultValue={product.category} />
        </label>
        <label>
          <span>Subcategory</span>
          <input name="subcategory" defaultValue={product.subcategory} />
        </label>
        <label>
          <span>Inventory unit</span>
          <select name="defaultInventoryUnit" defaultValue={product.defaultInventoryUnit}>
            {units.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Default package amount</span>
          <input
            name="defaultPackageAmount"
            type="number"
            min="0.000001"
            step="any"
            defaultValue={product.defaultPackageAmount ?? ''}
          />
        </label>
        <label>
          <span>Default package unit</span>
          <input name="defaultPackageUnit" defaultValue={product.defaultPackageUnit} />
        </label>
        <label>
          <span>Default storage</span>
          <select name="defaultStorageType" defaultValue={product.defaultStorageType}>
            {['pantry', 'refrigerator', 'freezer', 'counter', 'other'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Dietary tags</span>
          <input name="dietaryTags" defaultValue={jsonList(product.dietaryTags).join(', ')} />
        </label>
        <label>
          <span>Allergens</span>
          <input name="allergens" defaultValue={jsonList(product.allergens).join(', ')} />
        </label>
        <label>
          <span>Default shelf life (days)</span>
          <input
            name="defaultShelfLifeDays"
            type="number"
            min="1"
            defaultValue={product.defaultShelfLifeDays ?? ''}
          />
        </label>
        <label>
          <span>After opening (days)</span>
          <input
            name="shelfLifeAfterOpeningDays"
            type="number"
            min="1"
            defaultValue={product.shelfLifeAfterOpeningDays ?? ''}
          />
        </label>
        <label>
          <span>Preferred brand</span>
          <input name="preferredBrand" defaultValue={product.preferredBrand} />
        </label>
        <label>
          <span>Preferred store</span>
          <input name="preferredStore" defaultValue={product.preferredStore} />
        </label>
        <label>
          <span>Minimum stock</span>
          <input
            name="minimumStock"
            type="number"
            min="0"
            step="any"
            defaultValue={product.minimumStock ?? ''}
          />
        </label>
        <label>
          <span>Target stock</span>
          <input
            name="targetStock"
            type="number"
            min="0"
            step="any"
            defaultValue={product.targetStock ?? ''}
          />
        </label>
        <label>
          <span>Reorder threshold</span>
          <input
            name="reorderThreshold"
            type="number"
            min="0"
            step="any"
            defaultValue={product.reorderThreshold ?? ''}
          />
        </label>
        <label>
          <span>Purchase quantity</span>
          <input
            name="preferredPurchaseQuantity"
            type="number"
            min="0.000001"
            step="any"
            defaultValue={product.preferredPurchaseQuantity ?? ''}
          />
        </label>
        <label>
          <span>Stock unit</span>
          <input name="stockUnit" defaultValue={product.stockUnit} />
        </label>
      </div>
      <label>
        <span>Storage instructions</span>
        <textarea name="storageInstructions" defaultValue={product.storageInstructions} rows={2} />
      </label>
      <label className={styles.checkbox}>
        <input name="isStaple" type="checkbox" defaultChecked={product.isStaple} /> Staple product
      </label>
      <label className={styles.checkbox}>
        <input
          name="suggestGroceryRestock"
          type="checkbox"
          defaultChecked={product.suggestGroceryRestock}
        />{' '}
        Suggest grocery restock
      </label>
      <label className={styles.checkbox}>
        <input name="archived" type="checkbox" defaultChecked={Boolean(product.archivedAt)} />{' '}
        Archive product
      </label>
    </>
  );
}

function BatchEditFields({ batch, dashboard }: { batch: Batch; dashboard: Dashboard }) {
  return (
    <>
      <label>
        <span>Product</span>
        <select name="productId" defaultValue={batch.productId}>
          {dashboard.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.displayName}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.formRow}>
        <label>
          <span>Remaining</span>
          <input
            name="quantityRemaining"
            type="number"
            min="0"
            step="any"
            defaultValue={batch.quantityRemaining ?? ''}
          />
        </label>
        <label>
          <span>Original</span>
          <input
            name="originalQuantity"
            type="number"
            min="0"
            step="any"
            defaultValue={batch.originalQuantity ?? ''}
          />
        </label>
      </div>
      <div className={styles.formRow}>
        <label>
          <span>Unit</span>
          <select name="unit" defaultValue={batch.unit}>
            {units.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Approximate amount</span>
          <select name="approximateState" defaultValue={batch.approximateState ?? 'unknown'}>
            {['full', 'three_quarters', 'half', 'quarter', 'almost_empty', 'unknown'].map(
              (value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className={styles.formRow}>
        <label>
          <span>Package count</span>
          <input
            name="packageCount"
            type="number"
            min="0"
            step="any"
            defaultValue={batch.packageCount ?? ''}
          />
        </label>
        <label>
          <span>Amount per package</span>
          <input
            name="amountPerPackage"
            type="number"
            min="0"
            step="any"
            defaultValue={batch.amountPerPackage ?? ''}
          />
        </label>
      </div>
      <label>
        <span>Package unit</span>
        <select name="packageUnit" defaultValue={batch.packageUnit}>
          <option value="">Not recorded</option>
          {units.map((unit) => (
            <option key={unit}>{unit}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Location</span>
        <select name="locationId" defaultValue={batch.locationId}>
          {dashboard.locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.path}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Shelf or sub-location</span>
        <input name="sublocation" defaultValue={batch.sublocation} />
      </label>
      <div className={styles.dateGrid}>
        {[
          ['purchaseDate', 'Purchased', batch.purchaseDate],
          ['bestBeforeDate', 'Best before', batch.bestBeforeDate],
          ['useByDate', 'Use by', batch.useByDate],
          ['sellByDate', 'Sell by', batch.sellByDate],
          ['openedDate', 'Opened', batch.openedDate],
          ['frozenDate', 'Frozen', batch.frozenDate],
          ['thawedDate', 'Thawed', batch.thawedDate],
          ['preparedDate', 'Prepared', batch.preparedDate],
        ].map(([name, label, value]) => (
          <label key={String(name)}>
            <span>{label}</span>
            <input name={String(name)} type="date" defaultValue={value ?? ''} />
          </label>
        ))}
      </div>
      <div className={styles.formRow}>
        <label>
          <span>Date precision</span>
          <select name="expiryPrecision" defaultValue={batch.expiryPrecision}>
            <option value="exact">Exact</option>
            <option value="estimated">Estimated</option>
            <option value="month_only">Month only</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select name="status" defaultValue={batch.status}>
            {[
              'unopened',
              'opened',
              'frozen',
              'thawed',
              'reserved',
              'depleted',
              'discarded',
              'donated',
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.formRow}>
        <label>
          <span>Price in cents</span>
          <input
            name="purchasePriceCents"
            type="number"
            min="0"
            defaultValue={batch.purchasePriceCents ?? ''}
          />
        </label>
        <label>
          <span>Store or source</span>
          <input name="source" defaultValue={batch.source} />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea name="notes" rows={2} defaultValue={batch.notes} />
      </label>
      <label className={styles.checkbox}>
        <input
          name="excludeFromGrocery"
          type="checkbox"
          defaultChecked={batch.excludeFromGrocery}
        />
        Exclude from grocery calculations
      </label>
    </>
  );
}

export function PantryManager({
  canEdit,
  initialPreferences,
}: {
  canEdit: boolean;
  initialPreferences: {
    defaultView: string;
    defaultSort: string;
    defaultGroup: 'none' | 'location' | 'category' | 'expiry';
  };
}) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState(initialPreferences.defaultView);
  const [sort, setSort] = useState(initialPreferences.defaultSort);
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [expiry, setExpiry] = useState('');
  const [group, setGroup] = useState<'none' | 'location' | 'category' | 'expiry'>(
    initialPreferences.defaultGroup === 'none' ? 'location' : initialPreferences.defaultGroup,
  );
  const [includeInactive, setIncludeInactive] = useState(false);
  const [addProductId, setAddProductId] = useState('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualProductName, setManualProductName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualCategory, setManualCategory] = useState('');
  const [manualUnit, setManualUnit] = useState('each');
  const [manualPackageUnit, setManualPackageUnit] = useState('');
  const [manualSource, setManualSource] = useState('');
  const [manualSearchResults, setManualSearchResults] = useState<FoodRecord[]>([]);
  const [manualSearchBusy, setManualSearchBusy] = useState(false);
  const [manualSearchError, setManualSearchError] = useState('');
  const [manualSearchNotice, setManualSearchNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const addItemDialogRef = useRef<HTMLDialogElement>(null);
  const filterDialogRef = useRef<HTMLDialogElement>(null);
  const manualEntryRef = useRef<HTMLDivElement>(null);

  function openAddItemDialog() {
    setManualEntryOpen(false);
    setAddItemOpen(true);
  }

  function closeAddItemDialog() {
    setManualEntryOpen(false);
    setAddItemOpen(false);
    setAddProductId('');
    setManualProductName('');
    setManualBrand('');
    setManualCategory('');
    setManualUnit('each');
    setManualPackageUnit('');
    setManualSource('');
    setManualSearchResults([]);
    setManualSearchError('');
    setManualSearchNotice('');
  }

  function showManualEntry() {
    setManualEntryOpen(true);
    window.requestAnimationFrame(() => {
      manualEntryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  useEffect(() => {
    const dialog = addItemDialogRef.current;
    if (addItemOpen && dialog && !dialog.open) dialog.showModal();
  }, [addItemOpen]);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      q,
      view,
      sort,
      includeInactive: String(includeInactive),
    });
    if (locationId) query.set('locationId', locationId);
    if (category) query.set('category', category);
    if (status) query.set('status', status);
    if (expiry) query.set('expiry', expiry);
    const response = await fetch(`/api/v1/pantry/summary?${query.toString()}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      setError(await messageFor(response, 'Pantry could not be loaded.'));
      return;
    }
    const body = (await response.json()) as { dashboard: Dashboard };
    setDashboard(body.dashboard);
  }, [category, expiry, includeInactive, locationId, q, sort, status, view]);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams({
      q,
      view,
      sort,
      includeInactive: String(includeInactive),
    });
    if (locationId) query.set('locationId', locationId);
    if (category) query.set('category', category);
    if (status) query.set('status', status);
    if (expiry) query.set('expiry', expiry);
    void fetch(`/api/v1/pantry/summary?${query.toString()}`, { cache: 'no-store' }).then(
      async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setError(await messageFor(response, 'Pantry could not be loaded.'));
          return;
        }
        const body = (await response.json()) as { dashboard: Dashboard };
        if (!cancelled) setDashboard(body.dashboard);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [category, expiry, includeInactive, locationId, q, sort, status, view]);

  const defaultLocationId = dashboard?.locations[0]?.id ?? '';
  const productOptions = useMemo(() => dashboard?.products ?? [], [dashboard]);
  const categories = useMemo(
    () =>
      [
        ...new Set((dashboard?.products ?? []).map((product) => product.category).filter(Boolean)),
      ].sort((left, right) => left.localeCompare(right)),
    [dashboard],
  );
  const groupedBatches = useMemo(() => {
    const groups = new Map<string, Batch[]>();
    for (const batch of dashboard?.batches ?? []) {
      const key =
        group === 'location'
          ? batch.location.path
          : group === 'category'
            ? batch.product.category || 'Uncategorized'
            : group === 'expiry'
              ? `${batch.expiry.state.replaceAll('_', ' ')} · ${batch.expiry.kind.replaceAll('_', ' ')}`
              : 'Inventory';
      groups.set(key, [...(groups.get(key) ?? []), batch]);
    }
    return [...groups.entries()];
  }, [dashboard, group]);
  const useFirstIds = useMemo(() => {
    const byProduct = new Map<string, Batch[]>();
    for (const batch of dashboard?.batches ?? [])
      byProduct.set(batch.productId, [...(byProduct.get(batch.productId) ?? []), batch]);
    return new Set(
      [...byProduct.values()].flatMap((batches) =>
        batches
          .filter((batch) => batch.expiry.date)
          .sort((left, right) => left.expiry.date!.localeCompare(right.expiry.date!))
          .slice(0, 1)
          .map((batch) => batch.id),
      ),
    );
  }, [dashboard]);
  const hasActivePantryFilters = Boolean(
    q || view !== 'all' || locationId || category || status || expiry || includeInactive,
  );

  function clearPantryFilters() {
    setQ('');
    setView('all');
    setLocationId('');
    setCategory('');
    setStatus('');
    setExpiry('');
    setIncludeInactive(false);
  }

  async function searchManualFood() {
    const query = manualProductName.trim();
    if (query.length < 2) {
      setManualSearchError('Enter at least two characters to search food data.');
      return;
    }
    setManualSearchBusy(true);
    setManualSearchError('');
    setManualSearchNotice('');
    setManualSearchResults([]);
    try {
      const response = await fetch('/api/v1/food-data/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: 'pantry', kind: 'any', page: 1 }),
      });
      if (!response.ok) {
        setManualSearchError(await messageFor(response, 'Food search failed.'));
        return;
      }
      const body = (await response.json()) as { records?: FoodRecord[] };
      const records = body.records ?? [];
      setManualSearchResults(records);
      if (!records.length) setManualSearchNotice('No food-data matches were found.');
    } catch {
      setManualSearchError('Food search is temporarily unavailable.');
    } finally {
      setManualSearchBusy(false);
    }
  }

  async function selectManualFood(record: FoodRecord) {
    setManualSearchBusy(true);
    setManualSearchError('');
    setManualSearchNotice('');
    try {
      const response = await fetch('/api/v1/food-data/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: record.provider,
          recordId: record.providerRecordId,
          language: navigator.language.slice(0, 2),
        }),
      });
      if (!response.ok) {
        setManualSearchError(await messageFor(response, 'Food details could not be loaded.'));
        return;
      }
      const body = (await response.json()) as { record: FoodRecord };
      const detail = body.record;
      const nextUnit = suggestedInventoryUnit(detail);
      setManualProductName(detail.displayName);
      setManualBrand(detail.brand);
      setManualCategory(detail.categories[0] ?? '');
      setManualUnit(nextUnit);
      setManualPackageUnit(nextUnit === 'each' ? '' : nextUnit);
      setManualSource(foodProviderLabel(detail.provider));
      setManualSearchResults([]);
      setManualSearchNotice(
        `Filled from ${foodProviderLabel(detail.provider)}. Review before adding.`,
      );
    } catch {
      setManualSearchError('Food details are temporarily unavailable.');
    } finally {
      setManualSearchBusy(false);
    }
  }

  async function mutate(url: string, body: unknown, success: string, method = 'POST') {
    setBusy(true);
    setError(null);
    setNotice(null);
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!response.ok) {
      setError(await messageFor(response, 'That Pantry change could not be saved.'));
      return false;
    }
    setNotice(success);
    await load();
    return true;
  }

  function productPayload(product: Product, formData: FormData) {
    return {
      displayName: formData.get('displayName'),
      brand: formData.get('brand'),
      variant: formData.get('variant'),
      category: formData.get('category'),
      subcategory: formData.get('subcategory'),
      aliases: String(formData.get('aliases') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      defaultInventoryUnit: formData.get('defaultInventoryUnit'),
      defaultPackageAmount: nullableNumber(formData.get('defaultPackageAmount')),
      defaultPackageUnit: formData.get('defaultPackageUnit'),
      defaultStorageType: formData.get('defaultStorageType'),
      dietaryTags: String(formData.get('dietaryTags') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      allergens: String(formData.get('allergens') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      storageInstructions: formData.get('storageInstructions'),
      defaultShelfLifeDays: nullableNumber(formData.get('defaultShelfLifeDays')),
      shelfLifeAfterOpeningDays: nullableNumber(formData.get('shelfLifeAfterOpeningDays')),
      isStaple: formData.get('isStaple') === 'on',
      preferredBrand: formData.get('preferredBrand'),
      preferredStore: formData.get('preferredStore'),
      minimumStock: nullableNumber(formData.get('minimumStock')),
      targetStock: nullableNumber(formData.get('targetStock')),
      reorderThreshold: nullableNumber(formData.get('reorderThreshold')),
      preferredPurchaseQuantity: nullableNumber(formData.get('preferredPurchaseQuantity')),
      stockUnit: formData.get('stockUnit'),
      suggestGroceryRestock: formData.get('suggestGroceryRestock') === 'on',
      archived: formData.get('archived') === 'on',
      productId: product.id,
    };
  }

  function batchPayload(formData: FormData, batch?: Batch) {
    const quantityRemaining = nullableNumber(formData.get('quantityRemaining'));
    const approximateState = quantityRemaining === null ? formData.get('approximateState') : null;
    return {
      productId: formData.get('productId') ?? batch?.productId,
      quantityRemaining,
      originalQuantity: nullableNumber(formData.get('originalQuantity')),
      unit: formData.get('unit'),
      packageCount: nullableNumber(formData.get('packageCount')),
      amountPerPackage: nullableNumber(formData.get('amountPerPackage')),
      packageUnit: formData.get('packageUnit'),
      approximateState,
      locationId: formData.get('locationId'),
      sublocation: formData.get('sublocation'),
      purchaseDate: formData.get('purchaseDate'),
      bestBeforeDate: formData.get('bestBeforeDate'),
      useByDate: formData.get('useByDate'),
      sellByDate: formData.get('sellByDate'),
      openedDate: formData.get('openedDate'),
      frozenDate: formData.get('frozenDate'),
      thawedDate: formData.get('thawedDate'),
      preparedDate: formData.get('preparedDate'),
      expiryPrecision: formData.get('expiryPrecision'),
      status: formData.get('status'),
      purchasePriceCents: nullableNumber(formData.get('purchasePriceCents')),
      source: formData.get('source'),
      notes: formData.get('notes'),
      excludeFromGrocery: formData.get('excludeFromGrocery') === 'on',
      sourceRecipeId: batch?.sourceRecipeId ?? '',
      sourceMealPlanEntryId: batch?.sourceMealPlanEntryId ?? '',
      sourceShoppingListItemId: batch?.sourceShoppingListItemId ?? '',
      ...(batch ? { expectedVersion: batch.version } : {}),
    };
  }

  async function addItem(formData: FormData) {
    const selectedProductId = String(formData.get('productId') ?? '');
    let productId = selectedProductId;
    const unit = String(formData.get('unit') ?? 'each');
    setBusy(true);
    setError(null);
    setNotice(null);
    if (!productId) {
      const productResponse = await fetch('/api/v1/pantry/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: formData.get('productName'),
          brand: formData.get('brand'),
          category: formData.get('category'),
          defaultInventoryUnit: unit,
          defaultPackageUnit: formData.get('packageUnit'),
          defaultStorageType: formData.get('storageType'),
          aliases: [],
          isStaple: formData.get('isStaple') === 'on',
        }),
      });
      if (!productResponse.ok) {
        setBusy(false);
        setError(await messageFor(productResponse, 'That product could not be created.'));
        return;
      }
      const productBody = (await productResponse.json()) as { product: Product };
      productId = productBody.product.id;
    }
    const batchCount = Math.min(20, Math.max(1, Number(formData.get('batchCount') ?? 1)));
    for (let index = 0; index < batchCount; index += 1) {
      const batchResponse = await fetch('/api/v1/pantry/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...batchPayload(formData), productId }),
      });
      if (!batchResponse.ok) {
        setBusy(false);
        setError(await messageFor(batchResponse, 'The stock amount could not be added.'));
        return;
      }
    }
    setBusy(false);
    setNotice(batchCount > 1 ? `${batchCount} Pantry batches added.` : 'Pantry item added.');
    closeAddItemDialog();
    await load();
  }

  async function quickAddItem(formData: FormData) {
    const productName = String(formData.get('productName') ?? '').trim();
    const existingProduct = productOptions.find(
      (product) => product.displayName.toLocaleLowerCase() === productName.toLocaleLowerCase(),
    );
    if (existingProduct) formData.set('productId', existingProduct.id);
    formData.set('category', '');
    formData.set('originalQuantity', '');
    formData.set('approximateState', 'unknown');
    formData.set('batchCount', '1');
    formData.set('expiryPrecision', formData.get('bestBeforeDate') ? 'exact' : 'unknown');
    formData.set('status', 'unopened');
    formData.set(
      'storageType',
      dashboard?.locations.find((location) => location.id === formData.get('locationId'))
        ?.storageType ?? 'pantry',
    );
    for (const field of [
      'packageUnit',
      'sublocation',
      'purchaseDate',
      'useByDate',
      'sellByDate',
      'openedDate',
      'frozenDate',
      'thawedDate',
      'preparedDate',
      'source',
      'notes',
    ]) {
      if (!formData.has(field)) formData.set(field, '');
    }
    await addItem(formData);
  }

  async function editProduct(product: Product, formData: FormData) {
    await mutate(
      `/api/v1/pantry/products/${product.id}`,
      productPayload(product, formData),
      'Product details saved.',
      'PATCH',
    );
  }

  async function editBatch(batch: Batch, formData: FormData) {
    await mutate(
      `/api/v1/pantry/batches/${batch.id}`,
      batchPayload(formData, batch),
      'Batch details saved.',
      'PATCH',
    );
  }

  async function duplicateBatch(batch: Batch) {
    await mutate(
      '/api/v1/pantry/batches',
      {
        productId: batch.productId,
        quantityRemaining: batch.originalQuantity ?? batch.quantityRemaining,
        originalQuantity: batch.originalQuantity ?? batch.quantityRemaining,
        unit: batch.unit,
        packageCount: batch.packageCount,
        amountPerPackage: batch.amountPerPackage,
        packageUnit: batch.packageUnit,
        approximateState: batch.quantityRemaining === null ? batch.approximateState : null,
        locationId: batch.locationId,
        sublocation: batch.sublocation,
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
        source: batch.source,
        notes: batch.notes,
        excludeFromGrocery: batch.excludeFromGrocery,
      },
      'Recent batch duplicated for unpacking.',
    );
  }

  async function addLocation(formData: FormData) {
    await mutate(
      '/api/v1/pantry/locations',
      {
        name: formData.get('name'),
        parentId: formData.get('parentId'),
        storageType: formData.get('storageType'),
        description: formData.get('description'),
      },
      'Storage location added.',
    );
  }

  async function editLocation(location: Location, formData: FormData) {
    await mutate(
      `/api/v1/pantry/locations/${location.id}`,
      {
        name: formData.get('name'),
        parentId: formData.get('parentId'),
        storageType: formData.get('storageType'),
        description: formData.get('description'),
        position: formData.get('position'),
        archived: formData.get('archived') === 'on',
      },
      'Storage location saved.',
      'PATCH',
    );
  }

  async function action(batch: Batch, body: Record<string, unknown>, success: string) {
    await mutate(
      `/api/v1/pantry/batches/${batch.id}/actions`,
      { ...body, expectedVersion: batch.version, note: '' },
      success,
    );
  }

  if (!dashboard) {
    return <PageSkeleton as="div" variant="workspace" />;
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>HOUSEHOLD INVENTORY</p>
          <h1>Pantry</h1>
          <p>Know what is on hand, what needs using, and where every batch lives.</p>
        </div>
        <button className={styles.addPanel} type="button" onClick={openAddItemDialog}>
          <Plus size={22} aria-hidden="true" /> Add item
        </button>
        {addItemOpen ? (
          <dialog
            ref={addItemDialogRef}
            className={styles.addDialog}
            aria-labelledby="add-pantry-item-title"
            onCancel={closeAddItemDialog}
            onClose={closeAddItemDialog}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeAddItemDialog();
            }}
          >
            <div className={styles.addDialogShell}>
              <header className={styles.addDialogHeader}>
                <div>
                  <h2 id="add-pantry-item-title">Add pantry item</h2>
                  <p>Find a food or enter the item details manually.</p>
                </div>
                <button
                  className={styles.addDialogClose}
                  type="button"
                  aria-label="Close add item dialog"
                  onClick={closeAddItemDialog}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </header>
              <div className={styles.addPanelBody}>
                <FoodCatalogPicker
                  context="pantry"
                  locations={dashboard.locations.map(({ id, path }) => ({ id, path }))}
                  disabled={!canEdit || !defaultLocationId}
                  embedded
                  initialTab="scan"
                  searchSuggestions={productOptions.map((product) => product.displayName)}
                  onManualRequest={showManualEntry}
                  onImported={() => {
                    setNotice('Reviewed food data and Pantry batch added.');
                    closeAddItemDialog();
                    void load();
                  }}
                />
                {manualEntryOpen ? (
                  <div ref={manualEntryRef} className={styles.manualEntry}>
                    <div className={styles.manualEntryHeading}>
                      <strong>Enter details manually</strong>
                      <span>
                        Use this when a product is not available from food data providers.
                      </span>
                    </div>
                    <form action={addItem} className={styles.form}>
                      <label>
                        <span>Existing product</span>
                        <select
                          name="productId"
                          value={addProductId}
                          onChange={(event) => setAddProductId(event.target.value)}
                        >
                          <option value="">Create a new product</option>
                          {productOptions.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.manualSearchField}>
                        <label htmlFor="manual-product-name">New product name</label>
                        <div className={styles.manualSearchControl}>
                          <input
                            autoComplete="off"
                            id="manual-product-name"
                            list="add-item-product-options"
                            name="productName"
                            onChange={(event) => {
                              setManualProductName(event.target.value);
                              setManualSearchNotice('');
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              void searchManualFood();
                            }}
                            placeholder="e.g. Chickpeas"
                            value={manualProductName}
                          />
                          <button
                            aria-label="Search food data for this product"
                            disabled={manualSearchBusy || manualProductName.trim().length < 2}
                            onClick={() => void searchManualFood()}
                            title="Search USDA FoodData Central"
                            type="button"
                          >
                            <Search size={18} aria-hidden="true" />
                          </button>
                        </div>
                        <datalist id="add-item-product-options">
                          {productOptions.map((product) => (
                            <option key={product.id} value={product.displayName} />
                          ))}
                        </datalist>
                      </div>
                      {manualSearchError ? (
                        <p className={styles.manualSearchError} role="alert">
                          {manualSearchError}
                        </p>
                      ) : null}
                      {manualSearchNotice ? (
                        <p className={styles.manualSearchNotice} role="status">
                          {manualSearchNotice}
                        </p>
                      ) : null}
                      {manualSearchResults.length ? (
                        <div
                          className={styles.manualSearchResults}
                          aria-label="Food search results"
                        >
                          <span>Choose a result to fill the form</span>
                          {manualSearchResults.map((record) => (
                            <button
                              key={`${record.provider}:${record.providerRecordId}`}
                              onClick={() => void selectManualFood(record)}
                              type="button"
                            >
                              <strong>{record.displayName}</strong>
                              <small>
                                {[record.brand, foodProviderLabel(record.provider)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <label>
                        <span>Brand</span>
                        <input
                          name="brand"
                          onChange={(event) => setManualBrand(event.target.value)}
                          value={manualBrand}
                        />
                      </label>
                      <div className={styles.formRow}>
                        <label>
                          <span>Quantity</span>
                          <input
                            name="quantityRemaining"
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Exact"
                          />
                        </label>
                        <label>
                          <span>Unit</span>
                          <select
                            name="unit"
                            onChange={(event) => setManualUnit(event.target.value)}
                            value={manualUnit}
                          >
                            {units.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.formRow}>
                        <label>
                          <span>Original quantity</span>
                          <input name="originalQuantity" type="number" min="0" step="any" />
                        </label>
                        <label>
                          <span>Separate batches</span>
                          <input
                            name="batchCount"
                            type="number"
                            min="1"
                            max="20"
                            defaultValue="1"
                          />
                        </label>
                      </div>
                      <label>
                        <span>Or approximate amount</span>
                        <select name="approximateState" defaultValue="unknown">
                          <option value="full">Full</option>
                          <option value="three_quarters">Three quarters</option>
                          <option value="half">Half</option>
                          <option value="quarter">Quarter</option>
                          <option value="almost_empty">Almost empty</option>
                          <option value="unknown">Unknown</option>
                        </select>
                      </label>
                      <label>
                        <span>Location</span>
                        <select name="locationId" defaultValue={defaultLocationId} required>
                          {dashboard.locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.path}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Shelf or sub-location</span>
                        <input name="sublocation" placeholder="Upper shelf" />
                      </label>
                      <div className={styles.formRow}>
                        <label>
                          <span>Package count</span>
                          <input name="packageCount" type="number" min="0" step="any" />
                        </label>
                        <label>
                          <span>Amount per package</span>
                          <input name="amountPerPackage" type="number" min="0" step="any" />
                        </label>
                      </div>
                      <label>
                        <span>Package unit</span>
                        <select
                          name="packageUnit"
                          onChange={(event) => setManualPackageUnit(event.target.value)}
                          value={manualPackageUnit}
                        >
                          <option value="">Not recorded</option>
                          {units.map((unit) => (
                            <option key={unit}>{unit}</option>
                          ))}
                        </select>
                      </label>
                      <div className={styles.formRow}>
                        <label>
                          <span>Best before</span>
                          <input name="bestBeforeDate" type="date" />
                        </label>
                        <label>
                          <span>Category</span>
                          <input
                            name="category"
                            onChange={(event) => setManualCategory(event.target.value)}
                            placeholder="Canned goods"
                            value={manualCategory}
                          />
                        </label>
                      </div>
                      <div className={styles.formRow}>
                        <label>
                          <span>Use by</span>
                          <input name="useByDate" type="date" />
                        </label>
                        <label>
                          <span>Sell by</span>
                          <input name="sellByDate" type="date" />
                        </label>
                      </div>
                      <div className={styles.formRow}>
                        <label>
                          <span>Purchased</span>
                          <input name="purchaseDate" type="date" />
                        </label>
                        <label>
                          <span>Prepared</span>
                          <input name="preparedDate" type="date" />
                        </label>
                      </div>
                      <div className={styles.formRow}>
                        <label>
                          <span>Date precision</span>
                          <select name="expiryPrecision" defaultValue="unknown">
                            <option value="exact">Exact</option>
                            <option value="estimated">Estimated</option>
                            <option value="month_only">Month only</option>
                            <option value="unknown">Unknown</option>
                          </select>
                        </label>
                        <label>
                          <span>Status</span>
                          <select name="status" defaultValue="unopened">
                            <option value="unopened">Unopened</option>
                            <option value="opened">Opened</option>
                            <option value="frozen">Frozen</option>
                            <option value="thawed">Thawed</option>
                            <option value="reserved">Reserved</option>
                          </select>
                        </label>
                      </div>
                      <div className={styles.formRow}>
                        <label>
                          <span>Opened</span>
                          <input name="openedDate" type="date" />
                        </label>
                        <label>
                          <span>Frozen</span>
                          <input name="frozenDate" type="date" />
                        </label>
                      </div>
                      <label>
                        <span>Thawed</span>
                        <input name="thawedDate" type="date" />
                      </label>
                      <div className={styles.formRow}>
                        <label>
                          <span>Price in cents</span>
                          <input name="purchasePriceCents" type="number" min="0" step="1" />
                        </label>
                        <label>
                          <span>Store or source</span>
                          <input
                            name="source"
                            onChange={(event) => setManualSource(event.target.value)}
                            value={manualSource}
                          />
                        </label>
                      </div>
                      <input name="storageType" type="hidden" value="pantry" />
                      <label>
                        <span>Notes</span>
                        <textarea name="notes" rows={2} />
                      </label>
                      <label className={styles.checkbox}>
                        <input name="isStaple" type="checkbox" /> Staple product
                      </label>
                      <label className={styles.checkbox}>
                        <input name="excludeFromGrocery" type="checkbox" /> Exclude this batch from
                        grocery calculations
                      </label>
                      <button disabled={busy || !canEdit || !defaultLocationId} type="submit">
                        {busy ? 'Saving…' : 'Add item'}
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          </dialog>
        ) : null}
      </header>

      <section className={styles.quickAdd} aria-labelledby="quick-add-title">
        <div className={styles.quickAddIntro}>
          <Bolt size={20} aria-hidden="true" />
          <div>
            <h2 id="quick-add-title">Quick add</h2>
            <p>Add items in seconds.</p>
          </div>
        </div>
        <form action={quickAddItem} className={styles.quickAddForm}>
          <label className={styles.quickName}>
            <span>Item name</span>
            <input
              autoComplete="off"
              list="pantry-product-options"
              name="productName"
              placeholder="e.g. Brown rice"
              required
            />
            <datalist id="pantry-product-options">
              {productOptions.map((product) => (
                <option key={product.id} value={product.displayName} />
              ))}
            </datalist>
          </label>
          <div className={styles.quickQuantity}>
            <label>
              <span>Quantity</span>
              <input
                name="quantityRemaining"
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 1"
                required
              />
            </label>
            <label>
              <span className={styles.srOnly}>Unit</span>
              <select name="unit" defaultValue="each" aria-label="Unit">
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            <span>Location</span>
            <select name="locationId" defaultValue={defaultLocationId} required>
              {dashboard.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.path}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Expires</span>
            <input name="bestBeforeDate" type="date" />
          </label>
          <button disabled={busy || !canEdit || !defaultLocationId} type="submit">
            {busy ? 'Saving…' : 'Add item'}
          </button>
        </form>
      </section>

      {!canEdit ? (
        <p className={styles.profilePrompt}>Choose a household profile to change Pantry stock.</p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}

      <section className={styles.summary} aria-label="Pantry summary">
        {summaryCards(dashboard).map(({ detail, icon: Icon, label, tone, value }) => (
          <article key={label}>
            <span className={`${styles.summaryIcon} ${styles[tone]}`} aria-hidden="true">
              <Icon size={26} />
            </span>
            <span className={styles.summaryCopy}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{detail}</small>
            </span>
          </article>
        ))}
      </section>

      <div className={styles.mobileToolbar}>
        <section className={styles.toolbar} aria-label="Pantry filters">
          <label className={styles.search}>
            <Search size={18} aria-hidden="true" />
            <span className={styles.srOnly}>Search Pantry</span>
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Search products, brands, or locations"
            />
          </label>
          <button
            aria-haspopup="dialog"
            className={styles.filterTrigger}
            onClick={() => filterDialogRef.current?.showModal()}
            type="button"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            <span className={styles.filterTriggerDesktop}>Advanced search</span>
            <span className={styles.filterTriggerMobile}>Filters</span>
          </button>
          <dialog
            aria-labelledby="pantry-filter-dialog-title"
            className={styles.filterDialog}
            ref={filterDialogRef}
          >
            <header className={styles.filterDialogHeader}>
              <div>
                <p className={styles.eyebrow}>PANTRY VIEW</p>
                <h2 id="pantry-filter-dialog-title">Filters</h2>
              </div>
              <button
                aria-label="Close filters"
                className={styles.filterDialogClose}
                onClick={() => filterDialogRef.current?.close()}
                type="button"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.advancedGrid}>
              <label>
                <span>Location</span>
                <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">Every location</option>
                  {dashboard.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Category</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Every category</option>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">Every status</option>
                  {[
                    'unopened',
                    'opened',
                    'frozen',
                    'thawed',
                    'reserved',
                    'depleted',
                    'discarded',
                    'donated',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Expiry</span>
                <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
                  <option value="">Every expiry state</option>
                  <option value="soon">Expiring soon</option>
                  <option value="expired">Recorded date passed</option>
                  <option value="unknown">Unknown expiry</option>
                </select>
              </label>
              <label>
                <span>Group items</span>
                <select
                  value={group}
                  onChange={(event) => setGroup(event.target.value as typeof group)}
                >
                  <option value="none">No grouping</option>
                  <option value="location">Group by location</option>
                  <option value="category">Group by category</option>
                  <option value="expiry">Group by expiry</option>
                </select>
              </label>
              <label className={styles.checkbox}>
                <input
                  checked={includeInactive}
                  onChange={(event) => setIncludeInactive(event.target.checked)}
                  type="checkbox"
                />
                Show inactive and archived
              </label>
            </div>
            <label className={`${styles.sortControl} ${styles.filterDialogSort}`}>
              <span>Sort:</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                {sortOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <ArrowDownUp size={17} aria-hidden="true" />
            </label>
            <footer className={styles.filterDialogActions}>
              {hasActivePantryFilters ? (
                <button
                  className={styles.filterClearButton}
                  onClick={clearPantryFilters}
                  type="button"
                >
                  Clear filters
                </button>
              ) : null}
              <button
                className={styles.filterDoneButton}
                onClick={() => filterDialogRef.current?.close()}
                type="button"
              >
                Done
              </button>
            </footer>
          </dialog>
        </section>
        <div className={styles.filterRow}>
          <nav className={styles.views} aria-label="Pantry views">
            {views.slice(0, 6).map(([value, label]) => (
              <button
                aria-pressed={view === value && !expiry}
                key={value}
                onClick={() => {
                  setView(value);
                  setExpiry('');
                  if (['depleted', 'discarded', 'donated'].includes(value))
                    setIncludeInactive(true);
                }}
                type="button"
              >
                {label === 'Refrigerator' ? 'Fridge' : label}
              </button>
            ))}
            <button
              aria-pressed={expiry === 'soon'}
              onClick={() => {
                setView('all');
                setExpiry('soon');
              }}
              type="button"
            >
              Expiring soon
            </button>
          </nav>
          <label className={styles.sortControl}>
            <span>Sort by:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {sortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <ArrowDownUp size={17} aria-hidden="true" />
          </label>
        </div>
      </div>

      <div
        className={`${styles.layout} ${dashboard.batches.length ? '' : styles.layoutEmpty}`.trim()}
      >
        <section aria-labelledby="stock-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>ON HAND</p>
              <h2 id="stock-title">{dashboard.batches.length} batches</h2>
            </div>
          </div>
          {dashboard.batches.length ? (
            <div className={styles.groups}>
              {groupedBatches.map(([groupLabel, batches]) => (
                <section className={styles.batchGroup} key={groupLabel}>
                  <div className={styles.groupHeader}>
                    <span>
                      <LocationGlyph storageType={batches[0]?.location.storageType ?? 'pantry'} />
                      <strong>{groupLabel}</strong>
                      <small>{batches.length} items</small>
                    </span>
                    <ChevronDown size={17} aria-hidden="true" />
                  </div>
                  <div className={styles.grid}>
                    {batches.map((batch) => (
                      <article className={styles.card} key={batch.id}>
                        <div className={styles.rowMain}>
                          <div className={styles.productCell}>
                            <span className={styles.productIcon} aria-hidden="true">
                              <Package size={18} />
                            </span>
                            <div>
                              <h3>{batch.product.displayName}</h3>
                              {batch.product.brand || batch.product.variant ? (
                                <p className={styles.productMeta}>
                                  {[batch.product.brand, batch.product.variant]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <p className={styles.quantity}>{batch.quantityLabel}</p>
                          <p className={styles.location}>
                            <MapPin size={15} aria-hidden="true" /> {batch.location.path}
                          </p>
                          <time
                            className={`${styles.expiryDate} ${styles[batch.expiry.state]}`}
                            title={expiryLabel(batch)}
                            dateTime={batch.expiry.date ?? undefined}
                          >
                            {formatExpiryDate(batch)}
                          </time>
                          <span
                            className={`${styles.statusChip} ${
                              styles[
                                dashboard.lowStockProductIds.includes(batch.productId)
                                  ? 'lowStock'
                                  : batch.expiry.state
                              ]
                            }`}
                          >
                            {batchStateLabel(
                              batch,
                              dashboard.lowStockProductIds.includes(batch.productId),
                            )}
                          </span>
                          <details className={styles.rowMenu}>
                            <summary aria-label={`Manage ${batch.product.displayName}`}>
                              <MoreHorizontal size={20} aria-hidden="true" />
                            </summary>
                            <div className={styles.rowMenuPanel}>
                              <div className={styles.tags}>
                                <span>{batch.status.replaceAll('_', ' ')}</span>
                                <span>{batch.expiryPrecision.replaceAll('_', ' ')} date</span>
                                {batch.approximateState ? (
                                  <span>Approximate stock</span>
                                ) : (
                                  <span>Exact stock</span>
                                )}
                                {useFirstIds.has(batch.id) ? (
                                  <span>Use this batch first</span>
                                ) : null}
                                {dashboard.lowStockProductIds.includes(batch.productId) ? (
                                  <span>Low stock</span>
                                ) : null}
                              </div>
                              {batch.notes ? <p className={styles.notes}>{batch.notes}</p> : null}
                              <dl className={styles.facts}>
                                {batch.sublocation ? (
                                  <>
                                    <dt>Shelf</dt>
                                    <dd>{batch.sublocation}</dd>
                                  </>
                                ) : null}
                                {batch.openedDate ? (
                                  <>
                                    <dt>Opened</dt>
                                    <dd>{batch.openedDate}</dd>
                                  </>
                                ) : null}
                                {batch.frozenDate ? (
                                  <>
                                    <dt>Frozen</dt>
                                    <dd>{batch.frozenDate}</dd>
                                  </>
                                ) : null}
                                {batch.thawedDate ? (
                                  <>
                                    <dt>Thawed</dt>
                                    <dd>{batch.thawedDate}</dd>
                                  </>
                                ) : null}
                                {batch.packageCount ? (
                                  <>
                                    <dt>Packages</dt>
                                    <dd>
                                      {batch.packageCount} × {batch.amountPerPackage ?? '?'}{' '}
                                      {batch.packageUnit}
                                    </dd>
                                  </>
                                ) : null}
                              </dl>
                              <div className={styles.actions}>
                                {batch.status === 'unopened' ? (
                                  <button
                                    disabled={busy || !canEdit}
                                    onClick={() =>
                                      action(
                                        batch,
                                        { type: 'open', openedDate: '' },
                                        'Package opened.',
                                      )
                                    }
                                    type="button"
                                  >
                                    <PackageOpen size={15} /> Open
                                  </button>
                                ) : null}
                                {batch.quantityRemaining !== null ? (
                                  <button
                                    disabled={busy || !canEdit || batch.quantityRemaining < 1}
                                    onClick={() =>
                                      action(batch, { type: 'consume_one' }, 'One item consumed.')
                                    }
                                    type="button"
                                  >
                                    −1
                                  </button>
                                ) : null}
                                <button
                                  disabled={busy || !canEdit}
                                  onClick={() =>
                                    action(batch, { type: 'mark_empty' }, 'Item marked empty.')
                                  }
                                  type="button"
                                >
                                  Empty
                                </button>
                                <button
                                  disabled={busy || !canEdit}
                                  onClick={() =>
                                    action(batch, { type: 'undo' }, 'Last action undone.')
                                  }
                                  type="button"
                                >
                                  <Undo2 size={15} /> Undo
                                </button>
                                <button
                                  disabled={busy || !canEdit}
                                  onClick={() => void duplicateBatch(batch)}
                                  type="button"
                                >
                                  Add another batch
                                </button>
                              </div>
                              {batch.quantityRemaining !== null ? (
                                <form
                                  className={styles.consume}
                                  action={async (formData) => {
                                    await action(
                                      batch,
                                      {
                                        type: 'consume',
                                        quantity: formData.get('quantity'),
                                        unit: formData.get('unit'),
                                        reason: 'Manual consumption',
                                      },
                                      'Stock consumed.',
                                    );
                                  }}
                                >
                                  <input
                                    aria-label={`Amount of ${batch.product.displayName} consumed`}
                                    name="quantity"
                                    type="number"
                                    min="0.000001"
                                    step="any"
                                    required
                                  />
                                  <select
                                    aria-label="Consumption unit"
                                    name="unit"
                                    defaultValue={batch.unit}
                                  >
                                    {units.map((unit) => (
                                      <option key={unit}>{unit}</option>
                                    ))}
                                  </select>
                                  <button disabled={busy || !canEdit} type="submit">
                                    Use amount
                                  </button>
                                </form>
                              ) : null}
                              <details className={styles.management}>
                                <summary>Manage batch</summary>
                                <form
                                  className={styles.form}
                                  action={(formData) => editBatch(batch, formData)}
                                >
                                  <BatchEditFields batch={batch} dashboard={dashboard} />
                                  <button disabled={busy || !canEdit} type="submit">
                                    Save batch details
                                  </button>
                                </form>
                                <div className={styles.actionGrid}>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        { type: 'move', locationId: formData.get('locationId') },
                                        'Batch moved.',
                                      );
                                    }}
                                  >
                                    <strong>Move</strong>
                                    <select
                                      aria-label={`Move ${batch.product.displayName} to`}
                                      name="locationId"
                                      defaultValue={batch.locationId}
                                    >
                                      {dashboard.locations.map((location) => (
                                        <option key={location.id} value={location.id}>
                                          {location.path}
                                        </option>
                                      ))}
                                    </select>
                                    <button disabled={busy || !canEdit}>Move batch</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        {
                                          type: 'freeze',
                                          frozenDate: formData.get('frozenDate'),
                                          locationId: formData.get('locationId'),
                                        },
                                        'Batch frozen.',
                                      );
                                    }}
                                  >
                                    <strong>Freeze</strong>
                                    <input
                                      aria-label={`Frozen date for ${batch.product.displayName}`}
                                      name="frozenDate"
                                      type="date"
                                    />
                                    <select
                                      aria-label={`Freezer location for ${batch.product.displayName}`}
                                      name="locationId"
                                      defaultValue=""
                                    >
                                      <option value="">Keep current location</option>
                                      {dashboard.locations
                                        .filter((location) => location.storageType === 'freezer')
                                        .map((location) => (
                                          <option key={location.id} value={location.id}>
                                            {location.path}
                                          </option>
                                        ))}
                                    </select>
                                    <button disabled={busy || !canEdit}>Freeze batch</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        { type: 'thaw', thawedDate: formData.get('thawedDate') },
                                        'Batch thawed.',
                                      );
                                    }}
                                  >
                                    <strong>Thaw</strong>
                                    <input
                                      aria-label={`Thawed date for ${batch.product.displayName}`}
                                      name="thawedDate"
                                      type="date"
                                    />
                                    <button disabled={busy || !canEdit}>Thaw batch</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      const quantityRemaining = nullableNumber(
                                        formData.get('quantityRemaining'),
                                      );
                                      await action(
                                        batch,
                                        {
                                          type: 'correct',
                                          quantityRemaining,
                                          unit: formData.get('unit'),
                                          approximateState:
                                            quantityRemaining === null
                                              ? formData.get('approximateState')
                                              : null,
                                          reason: formData.get('reason'),
                                        },
                                        'Quantity corrected.',
                                      );
                                    }}
                                  >
                                    <strong>Correct quantity</strong>
                                    <input
                                      aria-label={`Corrected amount for ${batch.product.displayName}`}
                                      name="quantityRemaining"
                                      type="number"
                                      min="0"
                                      step="any"
                                    />
                                    <select
                                      aria-label={`Corrected unit for ${batch.product.displayName}`}
                                      name="unit"
                                      defaultValue={batch.unit}
                                    >
                                      {units.map((unit) => (
                                        <option key={unit}>{unit}</option>
                                      ))}
                                    </select>
                                    <select
                                      aria-label={`Corrected approximate amount for ${batch.product.displayName}`}
                                      name="approximateState"
                                      defaultValue="unknown"
                                    >
                                      {[
                                        'full',
                                        'three_quarters',
                                        'half',
                                        'quarter',
                                        'almost_empty',
                                        'unknown',
                                      ].map((value) => (
                                        <option key={value}>{value.replaceAll('_', ' ')}</option>
                                      ))}
                                    </select>
                                    <input
                                      aria-label={`Correction reason for ${batch.product.displayName}`}
                                      name="reason"
                                      defaultValue="Inventory recount"
                                      required
                                    />
                                    <button disabled={busy || !canEdit}>Correct quantity</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        {
                                          type: 'split',
                                          quantity: formData.get('quantity'),
                                          unit: formData.get('unit'),
                                          locationId: formData.get('locationId'),
                                        },
                                        'Batch split.',
                                      );
                                    }}
                                  >
                                    <strong>Split batch</strong>
                                    <input
                                      aria-label={`Split amount for ${batch.product.displayName}`}
                                      name="quantity"
                                      type="number"
                                      min="0.000001"
                                      step="any"
                                      required
                                    />
                                    <select
                                      aria-label={`Split unit for ${batch.product.displayName}`}
                                      name="unit"
                                      defaultValue={batch.unit}
                                    >
                                      {units.map((unit) => (
                                        <option key={unit}>{unit}</option>
                                      ))}
                                    </select>
                                    <select
                                      aria-label={`Split destination for ${batch.product.displayName}`}
                                      name="locationId"
                                      defaultValue=""
                                    >
                                      <option value="">Keep current location</option>
                                      {dashboard.locations.map((location) => (
                                        <option key={location.id} value={location.id}>
                                          {location.path}
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      disabled={
                                        busy || !canEdit || batch.quantityRemaining === null
                                      }
                                    >
                                      Split batch
                                    </button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      const target = dashboard.batches.find(
                                        (candidate) =>
                                          candidate.id === formData.get('targetBatchId'),
                                      )!;
                                      await action(
                                        batch,
                                        {
                                          type: 'combine',
                                          targetBatchId: target.id,
                                          targetExpectedVersion: target.version,
                                        },
                                        'Batches combined.',
                                      );
                                    }}
                                  >
                                    <strong>Combine compatible batch</strong>
                                    <select
                                      aria-label={`Combine ${batch.product.displayName} with`}
                                      name="targetBatchId"
                                      defaultValue=""
                                      required
                                    >
                                      <option value="">Choose another batch</option>
                                      {dashboard.batches
                                        .filter(
                                          (candidate) =>
                                            candidate.id !== batch.id &&
                                            candidate.productId === batch.productId,
                                        )
                                        .map((candidate) => (
                                          <option key={candidate.id} value={candidate.id}>
                                            {candidate.quantityLabel} · {candidate.location.path}
                                          </option>
                                        ))}
                                    </select>
                                    <button disabled={busy || !canEdit}>Combine batches</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        { type: 'discard', reason: formData.get('reason') },
                                        'Batch discarded.',
                                      );
                                    }}
                                  >
                                    <strong>Discard</strong>
                                    <input
                                      aria-label={`Discard reason for ${batch.product.displayName}`}
                                      name="reason"
                                      placeholder="Reason"
                                    />
                                    <button disabled={busy || !canEdit}>Discard batch</button>
                                  </form>
                                  <form
                                    className={styles.form}
                                    action={async (formData) => {
                                      await action(
                                        batch,
                                        { type: 'donate', reason: formData.get('reason') },
                                        'Batch donated.',
                                      );
                                    }}
                                  >
                                    <strong>Donate</strong>
                                    <input
                                      aria-label={`Donation reason for ${batch.product.displayName}`}
                                      name="reason"
                                      placeholder="Reason"
                                    />
                                    <button disabled={busy || !canEdit}>Donate batch</button>
                                  </form>
                                  {['depleted', 'discarded', 'donated'].includes(batch.status) ? (
                                    <form
                                      className={styles.form}
                                      action={async (formData) => {
                                        const quantityRemaining = nullableNumber(
                                          formData.get('quantityRemaining'),
                                        );
                                        await action(
                                          batch,
                                          {
                                            type: 'restore',
                                            quantityRemaining,
                                            unit: formData.get('unit'),
                                            approximateState:
                                              quantityRemaining === null
                                                ? formData.get('approximateState')
                                                : null,
                                          },
                                          'Batch restored.',
                                        );
                                      }}
                                    >
                                      <strong>Restore</strong>
                                      <input
                                        aria-label={`Restored amount for ${batch.product.displayName}`}
                                        name="quantityRemaining"
                                        type="number"
                                        min="0"
                                        step="any"
                                      />
                                      <select
                                        aria-label={`Restore unit for ${batch.product.displayName}`}
                                        name="unit"
                                        defaultValue={batch.unit}
                                      >
                                        {units.map((unit) => (
                                          <option key={unit}>{unit}</option>
                                        ))}
                                      </select>
                                      <select
                                        aria-label={`Restored approximate amount for ${batch.product.displayName}`}
                                        name="approximateState"
                                        defaultValue="unknown"
                                      >
                                        {[
                                          'full',
                                          'three_quarters',
                                          'half',
                                          'quarter',
                                          'almost_empty',
                                          'unknown',
                                        ].map((value) => (
                                          <option key={value}>{value.replaceAll('_', ' ')}</option>
                                        ))}
                                      </select>
                                      <button disabled={busy || !canEdit}>Restore batch</button>
                                    </form>
                                  ) : null}
                                </div>
                                <details>
                                  <summary>Storage and adjustment history</summary>
                                  <ol className={styles.timeline}>
                                    {dashboard.recentEvents
                                      .filter((event) => event.batchId === batch.id)
                                      .map((event) => (
                                        <li key={event.id}>
                                          <strong>
                                            {event.reason || event.eventType.replaceAll('_', ' ')}
                                          </strong>
                                          <time>{new Date(event.createdAt).toLocaleString()}</time>
                                        </li>
                                      ))}
                                  </ol>
                                </details>
                              </details>
                            </div>
                          </details>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <h2>
                {hasActivePantryFilters
                  ? 'Nothing matched those filters.'
                  : 'There are no items in your pantry'}
              </h2>
              <p>
                {hasActivePantryFilters
                  ? 'Try a broader search or reset the filters.'
                  : 'Add the first item to start tracking what your household has on hand.'}
              </p>
              {hasActivePantryFilters ? (
                <button
                  className={styles.emptySecondaryAction}
                  type="button"
                  onClick={clearPantryFilters}
                >
                  Clear filters
                </button>
              ) : (
                <button type="button" onClick={openAddItemDialog}>
                  <Plus size={18} aria-hidden="true" /> Add an item
                </button>
              )}
            </div>
          )}
        </section>

        <aside className={styles.sidebar}>
          <section>
            <div className={styles.asideTitle}>
              <Clock3 size={18} />
              <h2>Recent activity</h2>
            </div>
            {dashboard.recentEvents.length ? (
              <ol className={styles.timeline}>
                {dashboard.recentEvents.slice(0, 4).map((event) => (
                  <li key={event.id}>
                    <span className={styles.activityIcon} aria-hidden="true">
                      <Package size={15} />
                    </span>
                    <span className={styles.activityCopy}>
                      <strong>{event.productName}</strong>
                      <span>{event.reason || event.eventType.replaceAll('_', ' ')}</span>
                      <time>{new Date(event.createdAt).toLocaleString()}</time>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>Changes will appear here.</p>
            )}
          </section>
          <details className={styles.locationPanel}>
            <summary>
              <MapPin size={18} /> Manage locations
            </summary>
            <div className={styles.managementList}>
              {dashboard.locations.map((location) => (
                <details key={location.id}>
                  <summary>
                    <span>
                      <LocationGlyph storageType={location.storageType} /> {location.path}
                    </span>
                    <small>
                      {dashboard.batches.filter((batch) => batch.locationId === location.id).length}{' '}
                      items
                    </small>
                  </summary>
                  <form
                    action={(formData) => editLocation(location, formData)}
                    className={styles.form}
                  >
                    <label>
                      <span>Name</span>
                      <input name="name" defaultValue={location.name} required />
                    </label>
                    <label>
                      <span>Inside</span>
                      <select name="parentId" defaultValue={location.parentId ?? ''}>
                        <option value="">Top level</option>
                        {dashboard.locations
                          .filter((candidate) => candidate.id !== location.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.path}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      <span>Storage type</span>
                      <select name="storageType" defaultValue={location.storageType}>
                        {['pantry', 'refrigerator', 'freezer', 'counter', 'other'].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Description</span>
                      <textarea name="description" defaultValue={location.description} />
                    </label>
                    <label>
                      <span>Order</span>
                      <input
                        name="position"
                        type="number"
                        min="0"
                        max="10000"
                        defaultValue={location.position}
                      />
                    </label>
                    <label className={styles.checkbox}>
                      <input
                        name="archived"
                        type="checkbox"
                        defaultChecked={Boolean(location.archivedAt)}
                      />{' '}
                      Archive location
                    </label>
                    <button disabled={busy || !canEdit}>Save location</button>
                  </form>
                </details>
              ))}
            </div>
            <form action={addLocation} className={styles.form}>
              <label>
                <span>Name</span>
                <input name="name" required />
              </label>
              <label>
                <span>Inside</span>
                <select name="parentId" defaultValue="">
                  <option value="">Top level</option>
                  {dashboard.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Storage type</span>
                <select name="storageType" defaultValue="pantry">
                  <option value="pantry">Pantry</option>
                  <option value="refrigerator">Refrigerator</option>
                  <option value="freezer">Freezer</option>
                  <option value="counter">Counter</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                <span>Description</span>
                <textarea name="description" />
              </label>
              <button disabled={busy || !canEdit} type="submit">
                Add location
              </button>
            </form>
          </details>
          <details className={styles.locationPanel}>
            <summary>Manage products and staples</summary>
            <div className={styles.managementList}>
              {dashboard.products.map((product) => (
                <details key={product.id}>
                  <summary>{product.displayName}</summary>
                  <form
                    action={(formData) => editProduct(product, formData)}
                    className={styles.form}
                  >
                    <ProductEditFields product={product} />
                    <button disabled={busy || !canEdit}>Save product</button>
                  </form>
                </details>
              ))}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
