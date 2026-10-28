'use client';
import {
  createPantryAddOperation,
  pantryAddOperationSchema,
  resumePantryAddOperation,
  type PantryAddOperation,
} from '@/lib/client/pantry-add-operation';
import { AppDialog } from './app-dialog';
import { DialogViewport } from './dialog-viewport';
import type { ComponentPropsWithoutRef } from 'react';
import { KitchenPrintDialog } from './kitchen-print-dialog';
import { PageHeader } from '@/components/page-header';
import { DecisionAssistance } from '@/components/decision-assistance';
import { AssistedReviewButton } from './assisted-review-button';
import { SearchFacetBar, ResultsToolbar } from './search-facet-bar';

import {
  ArrowDownUp,
  Box,
  CalendarClock,
  ChevronDown,
  History,
  Leaf,
  MapPin,
  MoreHorizontal,
  Package,
  PackageOpen,
  Plus,
  Search,
  Snowflake,
  Thermometer,
  Undo2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { PageSkeleton } from '@/components/skeleton';
import { FoodCatalogPicker } from '@/components/food-catalog-picker';
import { useToast } from '@/components/toast-provider';
import type { FoodRecord } from '@/lib/domain/food-data';

import { ProductImage, PhotoCredit } from '@/components/product-image';
import { productImageGtin, type ProductIdentifier } from '@/lib/domain/product-image';
import styles from './pantry-manager.module.css';

type Product = {
  id: string;
  identifiers?: ProductIdentifier[];
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
  restockMode: 'none' | 'always_have' | 'always_buy';
  restockTrigger: 'below_target' | 'reorder_point' | 'empty';
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
  productStock: Record<string, { knownQuantity: number; unit: string; uncertain: boolean }>;
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
  ['essentials', 'Essentials'],
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

/** Keep entered management values after recoverable request failures. */
function RetainedForm({
  action,
  children,
  disabled = false,
  ...props
}: Omit<ComponentPropsWithoutRef<'form'>, 'action'> & {
  action: (data: FormData) => unknown;
  disabled?: boolean;
}) {
  return (
    <form
      {...props}
      onInputCapture={(event) => {
        event.currentTarget.dataset.dirty = 'true';
      }}
      onChangeCapture={(event) => {
        event.currentTarget.dataset.dirty = 'true';
      }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const panel = form.closest('dialog');
        const submitLabel = form
          .querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim();
        const restoreFocus = form.contains(document.activeElement);
        form.dataset.submitting = 'true';
        try {
          await action(new FormData(form));
        } finally {
          delete form.dataset.submitting;
          requestAnimationFrame(() => {
            if (!restoreFocus || form.isConnected || !panel?.isConnected) return;
            const replacement = Array.from(
              panel.querySelectorAll<HTMLButtonElement>('button'),
            ).find((button) => button.textContent?.replace(/\s+/g, ' ').trim() === submitLabel);
            replacement?.focus({ preventScroll: true });
          });
        }
      }}
    >
      <fieldset role="presentation" className={styles.formFields} disabled={disabled}>
        {children}
      </fieldset>
    </form>
  );
}

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
      detail: 'batches',
      icon: Package,
      tone: 'olive',
    },
    {
      label: 'Expiring soon',
      value: dashboard.summary.expiringSoon,
      detail: 'batches',
      icon: CalendarClock,
      tone: 'amber',
    },
    {
      label: 'Low stock',
      value: dashboard.summary.lowStockStaples,
      detail: 'products',
      icon: ArrowDownUp,
      tone: 'coral',
    },
    {
      label: 'Opened',
      value: dashboard.summary.openedItems,
      detail: 'batches',
      icon: Leaf,
      tone: 'green',
    },
    {
      label: 'Recent changes',
      value: dashboard.summary.recentlyChanged,
      detail: 'batches · last 7 days',
      icon: History,
      tone: 'slate',
    },
  ] as const;
}

function formatExpiryDate(batch: Batch): string {
  if (!batch.expiry.date) return 'No expiry recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    ...(batch.expiryPrecision === 'month_only' ? {} : { day: '2-digit' as const }),
    year: 'numeric',
  }).format(new Date(`${batch.expiry.date}T00:00:00`));
}

function batchStateLabel(batch: Batch, isLowStock: boolean): string {
  if (isLowStock) return 'Low stock';
  if (batch.expiry.state === 'expired') return 'Date passed';
  if (batch.expiry.state === 'soon') return 'Expiring soon';
  if (batch.status === 'opened') return 'Opened';
  return batch.status.charAt(0).toUpperCase() + batch.status.slice(1).replaceAll('_', ' ');
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
  return `${kind} · ${batch.expiryPrecision === 'month_only' ? batch.expiry.date.slice(0, 7) : batch.expiry.date} · ${precision} · ${timing}`;
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
  const [restockMode, setRestockMode] = useState(product.restockMode ?? 'none');
  const [restockTrigger, setRestockTrigger] = useState(product.restockTrigger ?? 'below_target');
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
      </div>
      <fieldset>
        <legend>Shopping policy</legend>
        <p className={styles.muted}>
          Maintain an essential reserve, or buy a baseline amount on every Next shop.
        </p>
        <div className={styles.formRow}>
          <label>
            <span>Policy</span>
            <select
              name="restockMode"
              value={restockMode}
              onChange={(event) => setRestockMode(event.target.value as Product['restockMode'])}
            >
              <option value="none">Off</option>
              <option value="always_have">Always have</option>
              <option value="always_buy">Always buy</option>
            </select>
          </label>
          {restockMode !== 'none' ? (
            <label>
              <span>Comparison and purchase unit</span>
              <select
                name="stockUnit"
                defaultValue={product.stockUnit || product.defaultInventoryUnit}
              >
                {units.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
          ) : (
            <input name="stockUnit" type="hidden" defaultValue={product.stockUnit} />
          )}
          {restockMode === 'always_have' ? (
            <>
              <label>
                <span>Keep after planned meals</span>
                <input
                  name="targetStock"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue={product.targetStock ?? ''}
                  required
                />
              </label>
              <label>
                <span>Reorder when</span>
                <select
                  name="restockTrigger"
                  value={restockTrigger}
                  onChange={(event) =>
                    setRestockTrigger(event.target.value as Product['restockTrigger'])
                  }
                >
                  <option value="below_target">Below target</option>
                  <option value="reorder_point">At reorder point</option>
                  <option value="empty">Empty</option>
                </select>
              </label>
              {restockTrigger === 'reorder_point' ? (
                <label>
                  <span>Reorder point</span>
                  <input
                    name="reorderThreshold"
                    type="number"
                    min="0"
                    step="any"
                    defaultValue={product.reorderThreshold ?? ''}
                    required
                  />
                </label>
              ) : (
                <input
                  name="reorderThreshold"
                  type="hidden"
                  defaultValue={product.reorderThreshold ?? ''}
                />
              )}
              <label>
                <span>Buy in increments (optional)</span>
                <input
                  name="preferredPurchaseQuantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue={product.preferredPurchaseQuantity ?? ''}
                />
              </label>
            </>
          ) : null}
          {restockMode === 'always_buy' ? (
            <>
              <input name="restockTrigger" type="hidden" value="below_target" />
              <input name="targetStock" type="hidden" defaultValue={product.targetStock ?? ''} />
              <input
                name="reorderThreshold"
                type="hidden"
                defaultValue={product.reorderThreshold ?? ''}
              />
              <label>
                <span>Amount per Next shop</span>
                <input
                  name="preferredPurchaseQuantity"
                  type="number"
                  min="0.000001"
                  step="any"
                  defaultValue={product.preferredPurchaseQuantity ?? ''}
                  required
                />
              </label>
            </>
          ) : null}
          {restockMode === 'none' ? (
            <>
              <input name="restockTrigger" type="hidden" defaultValue={product.restockTrigger} />
              <input name="targetStock" type="hidden" defaultValue={product.targetStock ?? ''} />
              <input
                name="reorderThreshold"
                type="hidden"
                defaultValue={product.reorderThreshold ?? ''}
              />
              <input
                name="preferredPurchaseQuantity"
                type="hidden"
                defaultValue={product.preferredPurchaseQuantity ?? ''}
              />
            </>
          ) : null}
        </div>
        {restockMode === 'always_have' ? (
          <p className={styles.muted}>
            Keep {product.targetStock ?? 'the target'}{' '}
            {product.stockUnit || product.defaultInventoryUnit} after planned meals; reorder{' '}
            {restockTrigger.replaceAll('_', ' ')}.
          </p>
        ) : restockMode === 'always_buy' ? (
          <p className={styles.muted}>
            Buy at least {product.preferredPurchaseQuantity ?? 'the configured amount'}{' '}
            {product.stockUnit || product.defaultInventoryUnit} on every Next shop.
          </p>
        ) : null}
      </fieldset>
      <label>
        <span>Storage instructions</span>
        <textarea name="storageInstructions" defaultValue={product.storageInstructions} rows={2} />
      </label>
      <label className={styles.checkbox}>
        <input name="isStaple" type="checkbox" defaultChecked={product.isStaple} /> Staple product
      </label>
      <input name="minimumStock" type="hidden" defaultValue={product.minimumStock ?? ''} />
      <input name="suggestGroceryRestock" type="hidden" value="off" />
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

function subscribeAddRequest(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('bord:pantry-add', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('bord:pantry-add', listener);
  };
}
function savedAddRequest(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function PantryManager({
  canEdit,
  initialPreferences,
  profileId = 'current-profile',
  accountId = 'current-account',
}: {
  canEdit: boolean;
  profileId?: string;
  accountId?: string;
  initialPreferences: {
    defaultView: string;
    defaultSort: string;
    defaultGroup: 'none' | 'location' | 'category' | 'expiry';
  };
}) {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [q, setQ] = useState('');
  const [view, setView] = useState(initialPreferences.defaultView);
  const [sort, setSort] = useState(initialPreferences.defaultSort);
  const [locationId, setLocationId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [expiry, setExpiry] = useState('');
  const [group, setGroup] = useState<'none' | 'location' | 'category' | 'expiry'>(
    initialPreferences.defaultGroup,
  );
  const [includeInactive, setIncludeInactive] = useState(false);
  const [addProductId, setAddProductId] = useState('');
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [removedBatch, setRemovedBatch] = useState<{
    id: string;
    name: string;
    version: number;
  } | null>(null);
  const [catalogSaving, setCatalogSaving] = useState(false);
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
  const [mutationBusy, setBusy] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const busy = mutationBusy || needsRefresh;
  const [error, setError] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [memoryAddOperation, setMemoryAddOperation] = useState<PantryAddOperation | null>(null);
  const [addOperationError, setAddOperationError] = useState('');
  const addOperationLock = useRef(false);
  const addOperationKey = `bord:pantry-add:${accountId}:${profileId}`;
  const savedAdd = useSyncExternalStore(
    subscribeAddRequest,
    () => savedAddRequest(addOperationKey),
    () => null,
  );
  let restoredAdd: PantryAddOperation | null = null;
  try {
    const parsed = pantryAddOperationSchema.safeParse(savedAdd ? JSON.parse(savedAdd) : null);
    if (parsed.success) restoredAdd = parsed.data;
  } catch {
    /* Invalid local metadata never starts a write. */
  }
  const addOperation = memoryAddOperation ?? restoredAdd;
  function rememberAdd(operation: PantryAddOperation | null) {
    setMemoryAddOperation(operation);
    try {
      if (operation) sessionStorage.setItem(addOperationKey, JSON.stringify(operation));
      else sessionStorage.removeItem(addOperationKey);
      window.dispatchEvent(new Event('bord:pantry-add'));
    } catch {
      setAddOperationError(
        'Keep this page open; the browser cannot retain this request after navigation.',
      );
    }
  }
  const additionRecovery = addOperation ? (
    <section
      className={styles.manualSearchNotice}
      aria-label="Pantry addition recovery"
      tabIndex={-1}
    >
      <strong>Pantry addition · {addOperation.label}</strong>
      <p>
        {addOperation.acknowledged.length} of {addOperation.batchKeys.length} batches confirmed.{' '}
        {addOperation.uncertain ? 'The current request outcome is unknown.' : ''} Resume uses the
        original reviewed amount and request keys; later form edits remain a separate draft.
      </p>
      <p role="status">{addOperation.message}</p>
      {addOperationError && <p role="alert">{addOperationError}</p>}
      {needsRefresh && (
        <div>
          <p role="alert">
            Confirmed batches remain saved. Refresh Pantry before resuming this addition.
          </p>
          <button type="button" disabled={mutationBusy} onClick={() => void load()}>
            Refresh Pantry
          </button>
        </div>
      )}
      <button
        type="button"
        disabled={busy || !canEdit}
        onClick={() => void continueAdding(addOperation, false)}
      >
        {mutationBusy ? 'Adding batches…' : 'Resume this addition'}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (
            window.confirm(
              `Close this request after reviewing Pantry? ${addOperation.acknowledged.length} batches are confirmed and remain saved.${addOperation.uncertain ? ' Another batch may also have been saved. Check the current records before adding it again.' : ''}`,
            )
          ) {
            rememberAdd(null);
            setAddOperationError('');
            void load();
          }
        }}
      >
        Close request after reviewing Pantry
      </button>
    </section>
  ) : null;
  const addItemDialogRef = useRef<HTMLDialogElement>(null);
  const manualEntryRef = useRef<HTMLDivElement>(null);
  const loadRequestRef = useRef(0);
  const manualRequestRef = useRef(0);
  const manualControllerRef = useRef<AbortController | null>(null);

  function openAddItemDialog() {
    setManualEntryOpen(false);
    setAddItemOpen(true);
  }

  function closeAddItemDialog() {
    if (busy || catalogSaving) return;
    resetAddItemDialog();
  }
  function resetAddItemDialog() {
    // Close the native surface before unmounting so it restores the invoking control.
    if (addItemDialogRef.current?.open) addItemDialogRef.current.close();
    manualControllerRef.current?.abort();
    manualRequestRef.current++;
    setManualSearchBusy(false);
    setCatalogSaving(false);
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
      manualEntryRef.current
        ?.querySelector<HTMLElement>('select, input')
        ?.focus({ preventScroll: true });
    });
  }

  useEffect(() => {
    const dialog = addItemDialogRef.current;
    if (addItemOpen && dialog && !dialog.open) dialog.showModal();
  }, [addItemOpen]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const query = new URLSearchParams({
      q,
      view: view === 'essentials' ? 'all' : view,
      sort,
      includeInactive: String(includeInactive),
    });
    if (locationId) query.set('locationId', locationId);
    if (category) query.set('category', category);
    if (status) query.set('status', status);
    if (expiry) query.set('expiry', expiry);
    try {
      const response = await fetch(`/api/v1/pantry/summary?${query.toString()}`, {
        cache: 'no-store',
      });
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok) {
        const message = await messageFor(response, 'Pantry could not be loaded.');
        if (requestId === loadRequestRef.current) setError(message);
        return;
      }
      const body = (await response.json()) as { dashboard: Dashboard };
      if (requestId !== loadRequestRef.current) return;
      setDashboard(body.dashboard);
      setNeedsRefresh(false);
      setError(null);
    } catch {
      if (requestId === loadRequestRef.current) {
        setError('Pantry could not be loaded. Check the server connection and try again.');
      }
    } finally {
      if (requestId === loadRequestRef.current) setInitialLoadComplete(true);
    }
  }, [category, expiry, includeInactive, locationId, q, sort, status, view]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (
      selectedBatchId &&
      dashboard &&
      !dashboard.batches.some((batch) => batch.id === selectedBatchId)
    ) {
      const frame = requestAnimationFrame(() => {
        setSelectedBatchId(null);
        (
          document.querySelector<HTMLElement>(`button.${styles.rowMenu}`) ??
          document.querySelector<HTMLInputElement>('input[aria-label="Search Pantry"]')
        )?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [dashboard, selectedBatchId]);

  useEffect(
    () => () => {
      manualRequestRef.current++;
      manualControllerRef.current?.abort();
    },
    [],
  );

  const defaultLocationId =
    dashboard?.locations.find(
      (location) => location.storageType === 'pantry' && location.depth === 0,
    )?.id ??
    dashboard?.locations.find((location) => location.storageType === 'pantry')?.id ??
    dashboard?.locations[0]?.id ??
    '';
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
  const essentialProducts = useMemo(
    () =>
      (dashboard?.products ?? []).filter(
        (product) =>
          product.restockMode !== 'none' || (product.isStaple && product.suggestGroceryRestock),
      ),
    [dashboard],
  );
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
    manualControllerRef.current?.abort();
    const controller = new AbortController();
    manualControllerRef.current = controller;
    const requestId = ++manualRequestRef.current;
    setManualSearchBusy(true);
    setManualSearchError('');
    setManualSearchNotice('');
    setManualSearchResults([]);
    try {
      const response = await fetch('/api/v1/food-data/searches', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: 'pantry', kind: 'any', page: 1 }),
      });
      if (requestId !== manualRequestRef.current) return;
      if (!response.ok) {
        setManualSearchError(await messageFor(response, 'Food search failed.'));
        return;
      }
      const body = (await response.json()) as { records?: FoodRecord[] };
      if (requestId !== manualRequestRef.current) return;
      const records = body.records ?? [];
      setManualSearchResults(records);
      if (!records.length) setManualSearchNotice('No food-data matches were found.');
    } catch {
      if (controller.signal.aborted || requestId !== manualRequestRef.current) return;
      setManualSearchError('Food search is temporarily unavailable.');
    } finally {
      if (requestId === manualRequestRef.current) setManualSearchBusy(false);
    }
  }

  async function selectManualFood(record: FoodRecord) {
    manualControllerRef.current?.abort();
    const controller = new AbortController();
    manualControllerRef.current = controller;
    const requestId = ++manualRequestRef.current;
    setManualSearchBusy(true);
    setManualSearchError('');
    setManualSearchNotice('');
    try {
      const response = await fetch('/api/v1/food-data/details', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: record.provider,
          recordId: record.providerRecordId,
          catalogRef: record.catalogRef,
          language: navigator.language.slice(0, 2),
        }),
      });
      if (requestId !== manualRequestRef.current) return;
      if (!response.ok) {
        setManualSearchError(await messageFor(response, 'Food details could not be loaded.'));
        return;
      }
      const body = (await response.json()) as { record: FoodRecord };
      if (requestId !== manualRequestRef.current) return;
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
      if (controller.signal.aborted || requestId !== manualRequestRef.current) return;
      setManualSearchError('Food details are temporarily unavailable.');
    } finally {
      if (requestId === manualRequestRef.current) setManualSearchBusy(false);
    }
  }

  async function mutate(
    url: string,
    body: unknown,
    success: string,
    method = 'POST',
    onSaved?: (body: { batch?: { id: string; version: number; status: string } }) => void,
  ) {
    if (busy) return false;
    const panel = document.querySelector<HTMLDialogElement>(`dialog.${styles.batchDialog}[open]`);
    if (
      panel?.querySelector('form[data-dirty="true"]:not([data-submitting="true"])') &&
      !window.confirm(
        'Other batch fields have unsaved edits. Discard those edits and continue with this stock change?',
      )
    )
      return false;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        showToast(await messageFor(response, 'That Pantry change could not be saved.'), 'error');
        return false;
      }
      if (onSaved) {
        const result = await response.json().catch(() => null);
        if (result) onSaved(result);
      }
      showToast(success, 'success');
      setNeedsRefresh(true);
      await load();
      return true;
    } catch {
      showToast(
        'That Pantry change could not be saved. Check the connection and try again.',
        'error',
      );
      return false;
    } finally {
      setBusy(false);
    }
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
      restockMode: formData.get('restockMode'),
      restockTrigger: formData.get('restockTrigger'),
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

  async function continueAdding(operation: PantryAddOperation, closeOnSuccess: boolean) {
    if (busy || addOperationLock.current || !canEdit) return;
    addOperationLock.current = true;
    setBusy(true);
    setAddOperationError('');
    let latest = operation;
    try {
      const result = await resumePantryAddOperation(operation, (next) => {
        latest = next;
        rememberAdd(next);
      });
      rememberAdd(null);
      showToast(
        `${result.acknowledged.length} Pantry ${result.acknowledged.length === 1 ? 'batch' : 'batches'} added.`,
        'success',
      );
      if (closeOnSuccess) resetAddItemDialog();
      setNeedsRefresh(true);
      await load();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'This addition could not be confirmed.';
      rememberAdd({ ...latest, message });
      setAddOperationError(message);
      if (latest.acknowledged.length) {
        setNeedsRefresh(true);
        await load();
      }
      requestAnimationFrame(() => {
        const recovery = addItemDialogRef.current?.querySelector<HTMLElement>(
          '[aria-label="Pantry addition recovery"]',
        );
        recovery?.scrollIntoView({ block: 'nearest' });
        recovery?.focus({ preventScroll: true });
      });
    } finally {
      setBusy(false);
      addOperationLock.current = false;
    }
  }
  async function addItem(formData: FormData) {
    if (addOperation || busy || !canEdit) return;
    const productId = String(formData.get('productId') ?? '');
    const unit = String(formData.get('unit') ?? 'each');
    const batchCount = Number(formData.get('batchCount') ?? 1);
    if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 20) {
      setAddOperationError('Choose between 1 and 20 separate batches.');
      return;
    }
    const operation = createPantryAddOperation({
      label: productId
        ? (dashboard?.products.find((product) => product.id === productId)?.displayName ??
          'Selected product')
        : String(formData.get('productName') ?? ''),
      productId,
      product: productId
        ? null
        : {
            displayName: formData.get('productName'),
            brand: formData.get('brand'),
            category: formData.get('category'),
            defaultInventoryUnit: unit,
            defaultPackageUnit: formData.get('packageUnit'),
            defaultStorageType: formData.get('storageType'),
            aliases: [],
            isStaple: formData.get('isStaple') === 'on',
            restockMode: 'none',
            restockTrigger: 'below_target',
          },
      batch: batchPayload(formData),
      batchCount,
    });
    rememberAdd(operation);
    await continueAdding(operation, true);
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
    if (
      !window.confirm(
        `Add another unopened batch of ${batch.product.displayName}: ${batch.originalQuantity ?? batch.quantityRemaining ?? 'unknown quantity'} ${batch.unit}? This adds stock now. Dates and price will be blank.`,
      )
    )
      return;
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
      'New unopened batch added. Review its dates and quantity.',
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
      'POST',
      (result) => {
        if (body.type === 'undo') setRemovedBatch(null);
        else if (result.batch && ['depleted', 'discarded', 'donated'].includes(result.batch.status))
          setRemovedBatch({
            id: result.batch.id,
            name: batch.product.displayName,
            version: result.batch.version,
          });
      },
    );
  }
  async function undoRemovedBatch() {
    if (!removedBatch) return;
    const restored = await mutate(
      `/api/v1/pantry/batches/${removedBatch.id}/actions`,
      { type: 'undo', expectedVersion: removedBatch.version, note: '' },
      'Last stock change undone.',
    );
    if (restored) {
      setRemovedBatch(null);
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>('input[aria-label="Search Pantry"]')?.focus(),
      );
    }
  }

  if (!dashboard && !initialLoadComplete) {
    return <PageSkeleton as="div" variant="workspace" label="Loading pantry inventory" />;
  }

  if (!dashboard) {
    return (
      <div className="route-state-page">
        <section className="route-state-card" aria-labelledby="pantry-load-error">
          <p className="eyebrow">PANTRY UNAVAILABLE</p>
          <h1 id="pantry-load-error">Your Pantry could not be loaded.</h1>
          <p>{error ?? 'Check the server connection and try again.'}</p>
          <div className="route-state-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setInitialLoadComplete(false);
                void load();
              }}
            >
              Try again
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <DialogViewport />
      <PageHeader
        title="Pantry"
        eyebrow="HOUSEHOLD INVENTORY"
        description="Track stock, dates and storage."
        actions={
          <>
            <button className="primary-button" type="button" onClick={openAddItemDialog}>
              <Plus size={20} aria-hidden="true" /> Add item
            </button>
            <Link className="text-button" href="/pantry/inventory">
              Count stock
            </Link>
            <KitchenPrintDialog kind="pantry" />
            <a className="text-button" href="#pantry-management">
              Manage pantry
            </a>
          </>
        }
      />
      {addItemOpen ? (
        <dialog
          ref={addItemDialogRef}
          className={styles.addDialog}
          aria-labelledby="add-pantry-item-title"
          onCancel={(event) => {
            if (busy || catalogSaving) event.preventDefault();
            else closeAddItemDialog();
          }}
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
                disabled={busy || catalogSaving}
                onClick={closeAddItemDialog}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </header>
            <div className={styles.addPanelBody}>
              {additionRecovery}
              <FoodCatalogPicker
                context="pantry"
                onSavingChange={setCatalogSaving}
                locations={dashboard.locations.map(({ id, path }) => ({ id, path }))}
                disabled={!canEdit || !defaultLocationId}
                embedded
                initialTab="scan"
                searchSuggestions={productOptions.map((product) => product.displayName)}
                onManualRequest={showManualEntry}
                onImported={(_product, options) => {
                  showToast('Reviewed food data and Pantry batch added.', 'success');
                  if (!options?.keepOpen) resetAddItemDialog();
                  void load();
                }}
              />
              {manualEntryOpen ? (
                <div ref={manualEntryRef} className={styles.manualEntry}>
                  <div className={styles.manualEntryHeading}>
                    <strong>Enter details manually</strong>
                    <span>Use this when a product is not available from food data providers.</span>
                  </div>
                  <RetainedForm disabled={busy} action={addItem} className={styles.form}>
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
                    {manualProductName.trim().length > 1 && (
                      <DecisionAssistance
                        headingLevel={3}
                        embedded
                        inputQuery={manualProductName}
                        onChoose={(_card, choice) => {
                          const product = productOptions.find((item) => item.id === choice);
                          if (product) {
                            setAddProductId(product.id);
                            setManualSearchNotice(
                              `Selected ${product.displayName}. Check quantity and storage, then add the item.`,
                            );
                          }
                        }}
                        initialTask="pantry_input"
                        tasks={['pantry_input', 'clarification', 'nutrition_match']}
                        title="Need help identifying this food?"
                        description="Compare your entry with existing products or reference nutrition, using the name you entered."
                      />
                    )}
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
                      <div className={styles.manualSearchResults} aria-label="Food search results">
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
                        <input name="batchCount" type="number" min="1" max="20" defaultValue="1" />
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
                    {!addOperation && addOperationError ? (
                      <p role="alert">{addOperationError}</p>
                    ) : null}
                    <button
                      disabled={busy || !canEdit || !defaultLocationId || Boolean(addOperation)}
                      type="submit"
                    >
                      {busy ? 'Saving…' : 'Add item'}
                    </button>
                  </RetainedForm>
                </div>
              ) : null}
            </div>
          </div>
        </dialog>
      ) : null}

      {removedBatch && (
        <div className={styles.batchUndoNotice} role="status">
          <span>
            {removedBatch.name} changed to inactive stock. You can undo its last stock change.
          </span>
          <button type="button" disabled={busy || !canEdit} onClick={() => void undoRemovedBatch()}>
            <Undo2 size={16} /> Undo stock change
          </button>
          <button
            type="button"
            aria-label="Dismiss stock undo"
            onClick={() => setRemovedBatch(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {!canEdit ? (
        <p className={styles.profilePrompt}>Choose a household profile to change Pantry stock.</p>
      ) : null}
      {!addItemOpen && additionRecovery}
      {needsRefresh ? (
        <div className={styles.error} role="alert">
          <p>
            The stock change was saved. Current Pantry values could not yet be refreshed. Stock
            actions are paused to protect their versions.
          </p>
          <button type="button" onClick={() => void load()} disabled={mutationBusy}>
            Refresh Pantry
          </button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <section className={styles.summary} aria-label="Pantry summary">
        {summaryCards(dashboard)
          .filter((card) => card.value > 0 || card.label === 'On hand')
          .map(({ detail, icon: Icon, label, tone, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                clearPantryFilters();
                if (label === 'Expiring soon') setExpiry('soon');
                else if (label === 'Low stock') setView('low_stock');
                else if (label === 'Opened') setView('opened');
                else if (label === 'Recent changes') setView('recent');
              }}
              aria-label={`Show ${label.toLowerCase()}: ${value} ${detail}`}
            >
              <span className={`${styles.summaryIcon} ${styles[tone]}`} aria-hidden="true">
                <Icon size={26} />
              </span>
              <span className={styles.summaryCopy}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </span>
            </button>
          ))}
      </section>

      <div className={styles.mobileToolbar}>
        <SearchFacetBar
          label="Search Pantry"
          placeholder="Search pantry items"
          query={q}
          onQueryChange={setQ}
          onSearch={() => void load()}
          onAdvanced={() => setFilterOpen(true)}
          advancedActive={hasActivePantryFilters}
          advancedLabel="Pantry filters"
          facets={[
            ...views.slice(0, 6).map(([value, label]) => ({
              key: `view:${value}`,
              label: label === 'Refrigerator' ? 'Fridge' : label,
              active: view === value && !expiry,
            })),
            { key: 'soon', label: 'Expiring soon', active: expiry === 'soon' },
            ...categories.map((value) => ({
              key: `category:${value}`,
              label: value,
              active: category === value,
            })),
          ]}
          onFacet={(key) => {
            if (key === 'soon') {
              setView('all');
              setExpiry(expiry === 'soon' ? '' : 'soon');
            } else if (key.startsWith('category:')) {
              const value = key.slice(9);
              setCategory(category === value ? '' : value);
            } else {
              const value = key.slice(5);
              setView(value);
              setExpiry('');
              if (value === 'all') setCategory('');
              if (['depleted', 'discarded', 'donated'].includes(value)) setIncludeInactive(true);
            }
          }}
        />
        <AppDialog
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          aria-labelledby="pantry-filter-dialog-title"
          className={styles.filterDialog}
        >
          <header className={styles.filterDialogHeader}>
            <div>
              <h2 id="pantry-filter-dialog-title">Filters</h2>
            </div>
            <button
              aria-label="Close filters"
              className={styles.filterDialogClose}
              onClick={() => setFilterOpen(false)}
              type="button"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          <div className={styles.filterBody}>
            <p className={styles.muted}>
              Filters update stock immediately. Clear filters keeps your group and sort choices;
              Done closes this view.
            </p>
            <div className={styles.advancedGrid}>
              <label>
                <span>Location</span>
                <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  <option value="">All locations</option>
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
                  <option value="">All categories</option>
                  {categories.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Item status</span>
                <select
                  aria-label="Item status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    if (['depleted', 'discarded', 'donated'].includes(event.target.value))
                      setIncludeInactive(true);
                  }}
                >
                  <option value="">All item statuses</option>
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
                <span>Date status</span>
                <select value={expiry} onChange={(event) => setExpiry(event.target.value)}>
                  <option value="">All date statuses</option>
                  <option value="soon">Expiring soon</option>
                  <option value="expired">Recorded date passed</option>
                  <option value="unknown">Unknown expiry</option>
                </select>
              </label>

              <label className={styles.checkbox}>
                <input
                  checked={includeInactive}
                  onChange={(event) => {
                    setIncludeInactive(event.target.checked);
                    if (!event.target.checked) {
                      if (['depleted', 'discarded', 'donated'].includes(status)) setStatus('');
                      if (['depleted', 'discarded', 'donated'].includes(view)) setView('all');
                    }
                  }}
                  type="checkbox"
                />
                Show inactive and archived
              </label>
            </div>
            <fieldset className={styles.arrangement}>
              <legend>Arrange stock</legend>
              <label>
                <span>Group items</span>
                <select
                  aria-label="Group items"
                  value={group}
                  onChange={(event) => setGroup(event.target.value as typeof group)}
                >
                  <option value="none">No grouping</option>
                  <option value="location">Group by location</option>
                  <option value="category">Group by category</option>
                  <option value="expiry">Group by expiry</option>
                </select>
              </label>
              <label className={`${styles.sortControl} ${styles.filterDialogSort}`}>
                <span>Sort:</span>
                <select value={sort} onChange={(event) => setSort(event.target.value)}>
                  {sortOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>
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
              onClick={() => setFilterOpen(false)}
              type="button"
            >
              Done
            </button>
          </footer>
        </AppDialog>
        {hasActivePantryFilters && (
          <p className={styles.filterSummary}>
            Showing:{' '}
            {view !== 'all'
              ? `view: ${views.find(([value]) => value === view)?.[1] ?? view}; `
              : ''}
            {q ? `search: ${q}; ` : ''}
            {category ? `category: ${category}; ` : ''}
            {status ? `status: ${status}; ` : ''}
            {expiry ? `date: ${expiry}; ` : ''}
            {locationId
              ? `location: ${dashboard.locations.find((location) => location.id === locationId)?.path}; `
              : ''}
            {includeInactive ? 'includes inactive batches and archived products/locations' : ''}
            <button className="text-button" type="button" onClick={clearPantryFilters}>
              Clear filters
            </button>
          </p>
        )}
        <ResultsToolbar
          density="compact"
          summary={
            <>
              <strong>
                {view === 'essentials' ? essentialProducts.length : dashboard.batches.length}
              </strong>{' '}
              {view === 'essentials'
                ? essentialProducts.length === 1
                  ? 'product'
                  : 'products'
                : dashboard.batches.length === 1
                  ? 'batch'
                  : 'batches'}
            </>
          }
          sort={sort}
          onSortChange={setSort}
          options={sortOptions.map(([value, label]) => ({ value, label }))}
          actions={
            <AssistedReviewButton
              task={view === 'essentials' ? 'restock' : 'pantry_review'}
              tasks={['pantry_review', 'restock', 'pantry_input', 'clarification']}
              title="Review pantry"
              onApplied={() => void load()}
            />
          }
        />
      </div>

      <div className={styles.layout}>
        <section aria-labelledby="stock-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>
                {view === 'essentials' ? 'SHOPPING POLICIES' : 'ON HAND'}
              </p>
              <h2 id="stock-title" tabIndex={-1}>
                {view === 'essentials'
                  ? `${essentialProducts.length} ${essentialProducts.length === 1 ? 'essential' : 'essentials'}`
                  : `${dashboard.batches.length} ${dashboard.batches.length === 1 ? 'batch' : 'batches'}`}
              </h2>
            </div>
          </div>

          {view === 'essentials' ? (
            essentialProducts.length ? (
              <div className={styles.grid}>
                {essentialProducts.map((product) => {
                  const needsSetup = product.restockMode === 'none';
                  const stockSummary = dashboard.productStock?.[product.id];
                  const uncertain = !stockSummary || stockSummary.uncertain;
                  const stock = stockSummary?.knownQuantity ?? 0;
                  const stockUnit =
                    stockSummary?.unit || product.stockUnit || product.defaultInventoryUnit;
                  const due =
                    needsSetup ||
                    product.restockMode === 'always_buy' ||
                    (product.restockTrigger === 'empty'
                      ? stock <= 0
                      : product.restockTrigger === 'reorder_point'
                        ? stock <= (product.reorderThreshold ?? 0)
                        : stock < (product.targetStock ?? 0));
                  return (
                    <article className={styles.card} key={product.id}>
                      <div className={styles.rowMain}>
                        <div className={styles.productCell}>
                          <ProductImage
                            className={styles.productIcon}
                            gtin={productImageGtin(product.identifiers)}
                            fallback={<Package size={18} />}
                          />
                          <div>
                            <h3>{product.displayName}</h3>
                            <p className={styles.productMeta}>
                              {needsSetup
                                ? 'Legacy restock · needs setup'
                                : product.restockMode === 'always_have'
                                  ? 'Always have'
                                  : 'Always buy'}
                            </p>
                          </div>
                        </div>
                        <p className={styles.quantity}>
                          {uncertain
                            ? `Known subtotal: ${stock} ${stockUnit} · other stock needs review`
                            : `${stock} ${stockUnit}`}
                        </p>
                        <span className={styles.statusChip}>
                          {needsSetup
                            ? 'Needs setup'
                            : uncertain
                              ? 'Review'
                              : due
                                ? 'Due'
                                : 'At target'}
                        </span>
                      </div>
                      <p className={styles.muted}>
                        {needsSetup
                          ? 'This legacy restock preference is incomplete. Choose Always have or Always buy to activate it.'
                          : product.restockMode === 'always_have'
                            ? `Keep ${product.targetStock} ${product.stockUnit} after planned meals; reorder ${product.restockTrigger.replaceAll('_', ' ')}${product.preferredPurchaseQuantity ? `; buy in ${product.preferredPurchaseQuantity} ${product.stockUnit} increments` : ''}.`
                            : `Buy at least ${product.preferredPurchaseQuantity} ${product.stockUnit} on every Next shop; recipe demand is included, not duplicated.`}
                      </p>
                      <details>
                        <summary className="recipe-disclosure-summary">
                          <span>Quick edit</span>
                          <ChevronDown size={18} aria-hidden="true" />
                        </summary>
                        <RetainedForm
                          disabled={busy}
                          action={(formData) => editProduct(product, formData)}
                          className={styles.form}
                        >
                          <ProductEditFields product={product} />
                          <button disabled={busy || !canEdit}>Save policy</button>
                        </RetainedForm>
                      </details>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <h2>No essentials yet</h2>
                <p>
                  <a
                    className="inline-link"
                    href="#pantry-products"
                    onClick={() => {
                      const panel = document.getElementById(
                        'pantry-products',
                      ) as HTMLDetailsElement | null;
                      if (panel) panel.open = true;
                    }}
                  >
                    Manage products
                  </a>{' '}
                  to choose Always have or Always buy.
                </p>
              </div>
            )
          ) : dashboard.batches.length ? (
            <div className={styles.groups}>
              {groupedBatches.map(([groupLabel, batches]) => (
                <section className={styles.batchGroup} key={groupLabel}>
                  <div className={styles.groupHeader}>
                    <span>
                      <LocationGlyph storageType={batches[0]?.location.storageType ?? 'pantry'} />
                      <strong>{groupLabel}</strong>
                      <small>
                        {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
                      </small>
                    </span>
                  </div>
                  <div className={styles.grid}>
                    {batches.map((batch) => (
                      <article className={styles.card} key={batch.id}>
                        <div className={styles.rowMain}>
                          <div className={styles.productCell}>
                            <ProductImage
                              className={styles.productIcon}
                              gtin={productImageGtin(batch.product.identifiers)}
                              fallback={<Package size={18} />}
                            />
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
                            {batch.expiry.date && (
                              <small className={styles.dateContext}>{expiryLabel(batch)}</small>
                            )}
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
                          <button
                            className={styles.rowMenu}
                            type="button"
                            aria-label={`Manage ${batch.product.displayName}`}
                            onClick={() => setSelectedBatchId(batch.id)}
                          >
                            <MoreHorizontal size={20} aria-hidden="true" />
                          </button>
                          {selectedBatchId === batch.id && (
                            <AppDialog
                              className={styles.batchDialog}
                              onClose={() => {
                                if (!busy) setSelectedBatchId(null);
                              }}
                              aria-labelledby={`batch-title-${batch.id}`}
                            >
                              <header className={styles.filterDialogHeader}>
                                <div>
                                  <h2 id={`batch-title-${batch.id}`}>
                                    {batch.product.displayName}
                                  </h2>
                                  <p>
                                    {batch.quantityLabel} remaining · {batch.location.path}
                                  </p>
                                </div>
                                <button
                                  className={styles.addDialogClose}
                                  type="button"
                                  disabled={busy}
                                  aria-label="Close batch management"
                                  onClick={() => setSelectedBatchId(null)}
                                >
                                  <X size={20} />
                                </button>
                              </header>
                              <div className={styles.rowMenuPanel}>
                                <div className={styles.tags}>
                                  <span>{batch.status.replaceAll('_', ' ')}</span>
                                  <span>{batch.expiryPrecision.replaceAll('_', ' ')} date</span>
                                  <span>
                                    {batch.quantityRemaining !== null && !batch.approximateState
                                      ? 'Known stock'
                                      : batch.approximateState &&
                                          batch.approximateState !== 'unknown'
                                        ? 'Approximate stock'
                                        : 'Unknown stock'}
                                  </span>
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
                                      <PackageOpen size={15} /> Open package
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
                                      Use 1 {batch.unit}
                                    </button>
                                  ) : null}
                                  <button
                                    disabled={busy || !canEdit}
                                    onClick={() =>
                                      action(batch, { type: 'mark_empty' }, 'Item marked empty.')
                                    }
                                    type="button"
                                  >
                                    Mark empty
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
                                  <RetainedForm
                                    key={`consume:${batch.version}`}
                                    disabled={busy}
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
                                    <label>
                                      <span>Amount to use</span>
                                      <input
                                        aria-label={`Amount of ${batch.product.displayName} consumed`}
                                        name="quantity"
                                        type="number"
                                        min="0.000001"
                                        step="any"
                                        required
                                      />
                                    </label>
                                    <label>
                                      <span>Unit</span>
                                      <select
                                        aria-label="Consumption unit"
                                        name="unit"
                                        defaultValue={batch.unit}
                                      >
                                        {units.map((unit) => (
                                          <option key={unit}>{unit}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <button disabled={busy || !canEdit} type="submit">
                                      Use amount
                                    </button>
                                  </RetainedForm>
                                ) : null}
                                <details className={styles.management}>
                                  <summary>Manage batch</summary>
                                  <RetainedForm
                                    key={`details:${batch.version}`}
                                    disabled={busy}
                                    className={styles.form}
                                    action={(formData) => editBatch(batch, formData)}
                                  >
                                    <BatchEditFields batch={batch} dashboard={dashboard} />
                                    <button disabled={busy || !canEdit} type="submit">
                                      Save batch details
                                    </button>
                                  </RetainedForm>
                                  <div className={styles.actionGrid}>
                                    <RetainedForm
                                      key={`move:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`freeze:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`thaw:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`correct:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`split:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`combine:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`discard:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    <RetainedForm
                                      key={`donate:${batch.version}`}
                                      disabled={busy}
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
                                    </RetainedForm>
                                    {['depleted', 'discarded', 'donated'].includes(batch.status) ? (
                                      <RetainedForm
                                        key={`restore:${batch.version}`}
                                        disabled={busy}
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
                                            <option key={value}>
                                              {value.replaceAll('_', ' ')}
                                            </option>
                                          ))}
                                        </select>
                                        <button disabled={busy || !canEdit}>Restore batch</button>
                                      </RetainedForm>
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
                                            <time>
                                              {new Date(event.createdAt).toLocaleString()}
                                            </time>
                                          </li>
                                        ))}
                                    </ol>
                                  </details>
                                </details>
                              </div>
                            </AppDialog>
                          )}
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

        <aside id="pantry-management" className={styles.sidebar}>
          <div className={styles.kitchenActions}>
            <span>
              <strong>Use what you have</strong>
            </span>
            <Link href="/recipes?pantry=ready">Find recipes to cook</Link>
            <Link href="/lists">Open shopping lists</Link>
          </div>

          <details className={styles.locationPanel}>
            <summary className="recipe-disclosure-summary">
              <span>Recent activity</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>

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
          </details>
          <details className={styles.locationPanel}>
            <summary className="recipe-disclosure-summary">
              <span>
                <MapPin size={18} /> Manage locations
              </span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className={styles.managementList}>
              {dashboard.locations.map((location) => (
                <details key={location.id}>
                  <summary className="recipe-disclosure-summary">
                    <span>
                      <LocationGlyph storageType={location.storageType} /> {location.path}
                    </span>
                    <small>
                      {dashboard.batches.filter((batch) => batch.locationId === location.id).length}{' '}
                      {dashboard.batches.filter((batch) => batch.locationId === location.id)
                        .length === 1
                        ? 'batch'
                        : 'batches'}
                    </small>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <RetainedForm
                    disabled={busy}
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
                  </RetainedForm>
                </details>
              ))}
            </div>
            <RetainedForm disabled={busy} action={addLocation} className={styles.form}>
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
            </RetainedForm>
          </details>
          <details id="pantry-products" className={styles.locationPanel}>
            <summary className="recipe-disclosure-summary">
              <span>Manage products and staples</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <div className={styles.managementList}>
              {dashboard.products.map((product) => (
                <details key={product.id}>
                  <summary className="recipe-disclosure-summary">
                    <span>{product.displayName}</span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </summary>
                  <RetainedForm
                    disabled={busy}
                    action={(formData) => editProduct(product, formData)}
                    className={styles.form}
                  >
                    <ProductEditFields product={product} />
                    <button disabled={busy || !canEdit}>Save product</button>
                  </RetainedForm>
                </details>
              ))}
            </div>
          </details>
        </aside>
      </div>
      {dashboard.batches.some((batch) => productImageGtin(batch.product.identifiers)) && (
        <PhotoCredit />
      )}
    </div>
  );
}
