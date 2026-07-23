'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Barcode, Camera, Database, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

import styles from '@/components/food-catalog-picker.module.css';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { FoodRecord, ProviderStatus } from '@/lib/domain/food-data';

const BarcodeScanner = dynamic(
  () => import('@/components/barcode-scanner').then((module) => module.BarcodeScanner),
  { ssr: false },
);

type LocalProduct = { id: string; displayName: string; brand: string; variant?: string };
type PickerContext = 'pantry' | 'recipe' | 'nutrition';
type PickerTab = 'scan' | 'barcode' | 'search';

function message(body: unknown, fallback: string) {
  const parsed = body as { error?: { message?: string } } | null;
  return parsed?.error?.message ?? fallback;
}

function ProviderNotice({ statuses }: { statuses: ProviderStatus[] }) {
  const unavailable = statuses.filter((status) => status.status !== 'available');
  return unavailable.length ? (
    <p className={styles.providerNotice} role="status">
      {unavailable
        .map((item) => `${item.provider.replaceAll('_', ' ')}: ${item.status.replaceAll('_', ' ')}`)
        .join(' · ')}
    </p>
  ) : null;
}

export function FoodCatalogPicker({
  context,
  defaultQuery = '',
  locations = [],
  disabled = false,
  launchLabel = 'Scan or search food data',
  embedded = false,
  initialTab = 'barcode',
  searchSuggestions = [],
  onManualRequest,
  onImported,
}: {
  context: PickerContext;
  defaultQuery?: string;
  locations?: Array<{ id: string; path: string }>;
  disabled?: boolean;
  launchLabel?: string;
  embedded?: boolean;
  initialTab?: PickerTab;
  searchSuggestions?: string[];
  onManualRequest?: () => void;
  onImported?: (product: { id: string; displayName: string }) => void;
}) {
  const titleId = useId();
  const searchSuggestionsId = useId();
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>(initialTab);
  const [barcode, setBarcode] = useState('');
  const [query, setQuery] = useState(defaultQuery);
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [localProducts, setLocalProducts] = useState<LocalProduct[]>([]);
  const [selectedLocal, setSelectedLocal] = useState<LocalProduct | null>(null);
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [selected, setSelected] = useState<FoodRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (embedded) return;
    if (open) {
      wasOpenRef.current = true;
      closeButtonRef.current?.focus();
      return;
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      launchButtonRef.current?.focus();
    }
  }, [embedded, open]);

  function close() {
    if (busy) return;
    setOpen(false);
    setTab(initialTab);
    setBarcode('');
    setRecords([]);
    setLocalProducts([]);
    setStatuses([]);
    setSelected(null);
    setSelectedLocal(null);
    setError('');
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function post(url: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(message(parsed, 'Food data could not complete this request.'));
    return parsed;
  }

  async function lookup(value: string) {
    setBusy(true);
    setError('');
    setRecords([]);
    setLocalProducts([]);
    setSelectedLocal(null);
    try {
      const result = (await post('/api/v1/food-data/barcode-lookups', {
        barcode: value,
        language: navigator.language.slice(0, 2),
        compareUsda: false,
      })) as {
        preferred?: FoodRecord | null;
        alternatives?: FoodRecord[];
        providerStatuses?: ProviderStatus[];
        localProduct?: LocalProduct | null;
      };
      setStatuses(result.providerStatuses ?? []);
      setLocalProducts(result.localProduct ? [result.localProduct] : []);
      setSelectedLocal(result.localProduct ?? null);
      const next = [result.preferred, ...(result.alternatives ?? [])].filter(
        Boolean,
      ) as FoodRecord[];
      setRecords(next);
      if (next.length === 1 && !result.localProduct) setSelected(next[0]);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Barcode lookup failed.');
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSelected(null);
    setSelectedLocal(null);
    try {
      const result = (await post('/api/v1/food-data/searches', {
        query,
        context,
        kind: 'any',
        page: 1,
      })) as {
        records?: FoodRecord[];
        localProducts?: LocalProduct[];
        providerStatuses?: ProviderStatus[];
      };
      setRecords(result.records ?? []);
      setLocalProducts(result.localProducts ?? []);
      setStatuses(result.providerStatuses ?? []);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Food search failed.');
    } finally {
      setBusy(false);
    }
  }

  async function selectSearchResult(record: FoodRecord) {
    setBusy(true);
    setError('');
    try {
      const result = (await post('/api/v1/food-data/details', {
        provider: record.provider,
        recordId: record.providerRecordId,
        language: navigator.language.slice(0, 2),
      })) as { record: FoodRecord };
      setSelected(result.record);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Food details could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  async function importRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const base = {
      operationId: createClientUuid(),
      selection: {
        provider: selected.provider,
        recordId: selected.providerRecordId,
        expectedCanonicalGtin: selected.canonicalGtin,
      },
      product: {
        displayName: String(data.get('displayName') ?? ''),
        brand: String(data.get('brand') ?? ''),
        variant: '',
        category: String(data.get('category') ?? ''),
        defaultInventoryUnit: String(data.get('defaultInventoryUnit') ?? 'each'),
        defaultPackageAmount: data.get('defaultPackageAmount')
          ? Number(data.get('defaultPackageAmount'))
          : null,
        defaultPackageUnit: String(data.get('defaultPackageUnit') ?? ''),
        allergens: selected.allergens,
        dietaryTags: selected.labels,
      },
    };
    const pantry = context === 'pantry';
    const payload = pantry
      ? {
          ...base,
          batches: [
            {
              locationId: String(data.get('locationId') ?? ''),
              quantityRemaining: Number(data.get('quantityRemaining') ?? 1),
              originalQuantity: Number(data.get('quantityRemaining') ?? 1),
              unit: String(data.get('unit') ?? 'each'),
              packageCount: null,
              amountPerPackage: null,
              packageUnit: '',
              approximateState: null,
              sublocation: '',
              purchaseDate: '',
              bestBeforeDate: String(data.get('bestBeforeDate') ?? ''),
              useByDate: '',
              sellByDate: '',
              openedDate: '',
              frozenDate: '',
              thawedDate: '',
              preparedDate: '',
              expiryPrecision: data.get('bestBeforeDate') ? 'exact' : 'unknown',
              status: 'unopened',
              purchasePriceCents: null,
              source:
                selected.provider === 'open_food_facts'
                  ? 'Open Food Facts'
                  : 'USDA FoodData Central',
              notes: '',
              excludeFromGrocery: false,
              sourceRecipeId: '',
              sourceMealPlanEntryId: '',
              sourceShoppingListItemId: '',
            },
          ],
        }
      : base;
    try {
      const result = (await post(
        pantry ? '/api/v1/pantry/catalog-imports' : '/api/v1/food-data/imports',
        payload,
      )) as { product?: { id: string; displayName: string }; productId?: string };
      const product = result.product ?? {
        id: result.productId ?? '',
        displayName: base.product.displayName,
      };
      onImported?.(product);
      setOpen(false);
      setSelected(null);
      setRecords([]);
      setLocalProducts([]);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The reviewed food could not be imported.');
    } finally {
      setBusy(false);
    }
  }

  async function useLocalProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLocal) return;
    if (context !== 'pantry') {
      onImported?.(selectedLocal);
      close();
      return;
    }
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      await post('/api/v1/pantry/batches', {
        productId: selectedLocal.id,
        quantityRemaining: Number(data.get('quantityRemaining') ?? 1),
        originalQuantity: Number(data.get('quantityRemaining') ?? 1),
        unit: String(data.get('unit') ?? 'each'),
        packageCount: null,
        amountPerPackage: null,
        packageUnit: '',
        approximateState: null,
        locationId: String(data.get('locationId') ?? ''),
        sublocation: '',
        purchaseDate: '',
        bestBeforeDate: String(data.get('bestBeforeDate') ?? ''),
        useByDate: '',
        sellByDate: '',
        openedDate: '',
        frozenDate: '',
        thawedDate: '',
        preparedDate: '',
        expiryPrecision: data.get('bestBeforeDate') ? 'exact' : 'unknown',
        status: 'unopened',
        purchasePriceCents: null,
        source: 'Existing Pantry product',
        notes: '',
        excludeFromGrocery: false,
        sourceRecipeId: '',
        sourceMealPlanEntryId: '',
        sourceShoppingListItemId: '',
      });
      onImported?.(selectedLocal);
      setOpen(false);
      setSelectedLocal(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'The Pantry batch could not be added.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!embedded ? (
        <button
          ref={launchButtonRef}
          className={styles.launchButton}
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <Barcode size={17} /> {launchLabel}
        </button>
      ) : null}
      {embedded || open ? (
        <div
          className={embedded ? styles.embeddedHost : styles.backdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (!embedded && event.target === event.currentTarget) close();
          }}
        >
          <section
            className={embedded ? styles.embedded : styles.dialog}
            role={embedded ? 'region' : 'dialog'}
            aria-modal={embedded ? undefined : true}
            aria-label={embedded ? 'Find a pantry product' : undefined}
            aria-labelledby={embedded ? undefined : titleId}
            onKeyDown={embedded ? undefined : handleDialogKeyDown}
          >
            {!embedded ? (
              <header className={styles.dialogHeader}>
                <div>
                  <h2 id={titleId}>Find food data</h2>
                  <p>Review provider data before adding it to Bòrd.</p>
                </div>
                <button
                  ref={closeButtonRef}
                  type="button"
                  className={styles.closeButton}
                  onClick={close}
                  aria-label="Close food data picker"
                >
                  <X />
                </button>
              </header>
            ) : null}
            {!selected && !selectedLocal ? (
              <>
                <div className={styles.tabs} role="tablist" aria-label="Food lookup method">
                  {(
                    [
                      ['scan', Camera, 'Scan'],
                      ['barcode', Barcode, embedded ? 'Barcode' : 'Enter barcode'],
                      ['search', Search, embedded ? 'Search/Manual' : 'Search'],
                    ] as const
                  ).map(([value, Icon, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={tab === value}
                      onClick={() => setTab(value)}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                {tab === 'scan' ? (
                  <BarcodeScanner
                    onDetected={(value) => {
                      setBarcode(value);
                      setTab('barcode');
                      void lookup(value);
                    }}
                  />
                ) : null}
                {tab === 'barcode' ? (
                  <form
                    className={styles.lookupForm}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void lookup(barcode);
                    }}
                  >
                    <label>
                      Barcode
                      <input
                        value={barcode}
                        onChange={(event) => setBarcode(event.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="UPC, EAN, or GTIN"
                        required
                      />
                    </label>
                    <button disabled={busy}>{busy ? 'Looking up…' : 'Look up'}</button>
                  </form>
                ) : null}
                {tab === 'search' ? (
                  <form className={styles.lookupForm} onSubmit={search}>
                    <label>
                      {embedded ? 'Product name' : 'Food or product name'}
                      <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        autoComplete="off"
                        list={searchSuggestions.length ? searchSuggestionsId : undefined}
                        minLength={2}
                        maxLength={120}
                        placeholder={embedded ? 'Search by product name' : 'e.g. rolled oats'}
                        required
                      />
                      {searchSuggestions.length ? (
                        <datalist id={searchSuggestionsId}>
                          {searchSuggestions.map((suggestion) => (
                            <option key={suggestion} value={suggestion} />
                          ))}
                        </datalist>
                      ) : null}
                    </label>
                    <button disabled={busy}>{busy ? 'Searching…' : 'Search USDA'}</button>
                  </form>
                ) : null}
                <ProviderNotice statuses={statuses} />
                {localProducts.length ? (
                  <div className={styles.localResults}>
                    <h3>Already in Pantry</h3>
                    {localProducts.map((product) => (
                      <button
                        type="button"
                        className={styles.localResult}
                        key={product.id}
                        onClick={() => setSelectedLocal(product)}
                      >
                        <Database size={15} />
                        <strong>{product.displayName}</strong>
                        {product.brand ? ` · ${product.brand}` : ''}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={styles.results}>
                  {records.map((record) => (
                    <button
                      type="button"
                      className={styles.result}
                      key={`${record.provider}:${record.providerRecordId}`}
                      onClick={() => void selectSearchResult(record)}
                    >
                      {record.images[0] ? (
                        <Image src={record.images[0].url} alt="" width={72} height={72} />
                      ) : (
                        <span className={styles.placeholder}>
                          <Barcode />
                        </span>
                      )}
                      <span>
                        <strong>{record.displayName}</strong>
                        <small>
                          {[record.brand, record.quantity, record.dataType]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                        <small>
                          {record.provider === 'open_food_facts'
                            ? 'Open Food Facts'
                            : 'USDA FoodData Central'}{' '}
                          · {Math.round(record.completeness * 100)}% coverage
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {embedded && tab === 'search' && onManualRequest ? (
                  <div className={styles.embeddedFooter}>
                    <button type="button" onClick={onManualRequest}>
                      Enter details manually
                    </button>
                  </div>
                ) : null}
              </>
            ) : selectedLocal ? (
              <form className={styles.review} onSubmit={useLocalProduct}>
                <button
                  className={styles.backButton}
                  type="button"
                  onClick={() => setSelectedLocal(null)}
                >
                  ← Back to results
                </button>
                <div className={styles.localReviewHeading}>
                  <Database aria-hidden="true" />
                  <div>
                    <h3>{selectedLocal.displayName}</h3>
                    <p>{selectedLocal.brand || 'Existing Pantry product'}</p>
                  </div>
                </div>
                {context === 'pantry' ? (
                  <div className={styles.reviewGrid}>
                    <label>
                      Quantity
                      <input
                        name="quantityRemaining"
                        type="number"
                        min="0"
                        step="any"
                        defaultValue="1"
                        required
                      />
                    </label>
                    <label>
                      Unit
                      <select name="unit" defaultValue="each">
                        <option>each</option>
                        <option>g</option>
                        <option>kg</option>
                        <option>ml</option>
                        <option>l</option>
                        <option>package</option>
                      </select>
                    </label>
                    <label>
                      Location
                      <select name="locationId" required>
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.path}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Best before
                      <input name="bestBeforeDate" type="date" />
                    </label>
                  </div>
                ) : (
                  <p className={styles.provenance}>
                    This uses the existing local product and does not add Pantry stock or Food Diary
                    intake.
                  </p>
                )}
                <button className={styles.confirmButton} disabled={busy}>
                  {busy
                    ? 'Adding…'
                    : context === 'pantry'
                      ? 'Add batch for this product'
                      : 'Use this product'}
                </button>
              </form>
            ) : selected ? (
              <form className={styles.review} onSubmit={importRecord}>
                <button
                  className={styles.backButton}
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  ← Back to results
                </button>
                <div className={styles.reviewHeading}>
                  {selected.images[0] ? (
                    <Image src={selected.images[0].url} alt="" width={112} height={112} />
                  ) : (
                    <span className={styles.largePlaceholder}>
                      <Barcode />
                    </span>
                  )}
                  <div>
                    <h3>{selected.displayName}</h3>
                    <p>
                      {selected.brand || 'No brand supplied'} ·{' '}
                      {selected.provider === 'open_food_facts'
                        ? 'Open Food Facts'
                        : 'USDA FoodData Central'}
                    </p>
                    <small>{selected.license}</small>
                  </div>
                </div>
                <div className={styles.reviewGrid}>
                  <label>
                    Name
                    <input
                      name="displayName"
                      defaultValue={selected.displayName}
                      maxLength={160}
                      required
                    />
                  </label>
                  <label>
                    Brand
                    <input name="brand" defaultValue={selected.brand} maxLength={120} />
                  </label>
                  <label>
                    Category
                    <input
                      name="category"
                      defaultValue={selected.categories[0] ?? ''}
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Inventory unit
                    <select name="defaultInventoryUnit" defaultValue="each">
                      <option>each</option>
                      <option>g</option>
                      <option>kg</option>
                      <option>ml</option>
                      <option>l</option>
                      <option>package</option>
                    </select>
                  </label>
                  <label>
                    Package amount
                    <input name="defaultPackageAmount" type="number" min="0.000001" step="any" />
                  </label>
                  <label>
                    Package unit
                    <input name="defaultPackageUnit" maxLength={30} />
                  </label>
                  {context === 'pantry' ? (
                    <>
                      <label>
                        Quantity
                        <input
                          name="quantityRemaining"
                          type="number"
                          min="0"
                          step="any"
                          defaultValue="1"
                          required
                        />
                      </label>
                      <label>
                        Unit
                        <select name="unit" defaultValue="each">
                          <option>each</option>
                          <option>g</option>
                          <option>kg</option>
                          <option>ml</option>
                          <option>l</option>
                          <option>package</option>
                        </select>
                      </label>
                      <label>
                        Location
                        <select name="locationId" required>
                          {locations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.path}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Best before
                        <input name="bestBeforeDate" type="date" />
                      </label>
                    </>
                  ) : null}
                </div>
                {selected.allergens.length ? (
                  <p className={styles.warning}>
                    <strong>Allergens:</strong> {selected.allergens.join(', ')}
                  </p>
                ) : null}
                <p className={styles.provenance}>
                  {selected.nutrients.length} mapped nutrients · retrieved{' '}
                  {new Date(selected.retrievedAt).toLocaleDateString()} · provider data remains
                  attributed and immutable.
                </p>
                <button className={styles.confirmButton} disabled={busy}>
                  {busy ? 'Adding…' : context === 'pantry' ? 'Add Item' : 'Create and link product'}
                </button>
              </form>
            ) : null}
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
