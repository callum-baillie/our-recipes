'use client';

import { ChevronDown, Search } from 'lucide-react';
import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import { DecisionAssistance } from './decision-assistance';
import { QuantityStepper } from './quantity-stepper';
import { ButtonSpinner } from './skeleton';
import { useToast } from './toast-provider';
import {
  createPantryAddOperation,
  pantryAddOperationSchema,
  resumePantryAddOperation,
  type PantryAddOperation,
} from '@/lib/client/pantry-add-operation';
import { defaultLocation } from '@/lib/client/pantry-locations';
import styles from './pantry-manual-entry.module.css';

type Location = { id: string; path: string; storageType: string };
type Product = { id: string; displayName: string; brand: string };

const UNITS = [
  'each',
  'package',
  'can',
  'bottle',
  'carton',
  'dozen',
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
const APPROXIMATE = [
  ['full', 'Full'],
  ['three_quarters', 'Three quarters'],
  ['half', 'Half'],
  ['quarter', 'Quarter'],
  ['almost_empty', 'Almost empty'],
] as const;
const STATUSES = ['unopened', 'opened', 'frozen', 'thawed', 'reserved'] as const;

/** `YYYY-MM-DD` in the person's own calendar, `days` from today. */
function inDays(days: number, months = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString('en-CA');
}
const SHORTCUTS = [
  ['Tomorrow', () => inDays(1)],
  ['3 days', () => inDays(3)],
  ['1 week', () => inDays(7)],
  ['2 weeks', () => inDays(14)],
  ['1 month', () => inDays(0, 1)],
  ['3 months', () => inDays(0, 3)],
  ['1 year', () => inDays(0, 12)],
] as const;

function subscribe(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('bord:pantry-add', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('bord:pantry-add', listener);
  };
}

const text = (data: FormData, name: string) => String(data.get(name) ?? '').trim();
const optionalNumber = (data: FormData, name: string) => {
  const value = text(data, name);
  return value ? Number(value) : null;
};

export function PantryManualEntry({
  accountId,
  profileId,
  canEdit,
  locations,
  products,
  onAdded,
  onFindFood,
  tray,
}: {
  accountId: string;
  profileId: string;
  canEdit: boolean;
  locations: Location[];
  products: Product[];
  onAdded: (label: string, count: number) => void;
  /** Switch to the food-data search, keeping what was typed as the query. */
  onFindFood: (query: string) => void;
  /** What has been added so far this visit, shown beside the form. */
  tray?: ReactNode;
}) {
  const { showToast } = useToast();
  const listId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const home = defaultLocation(locations);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState('each');
  const [approximate, setApproximate] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(home?.id ?? '');
  const [bestBefore, setBestBefore] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Fields under "More details" keep their own state in the DOM; this resets them after an add.
  const [formKey, setFormKey] = useState(0);
  const [memory, setMemory] = useState<PantryAddOperation | null>(null);
  const lock = useRef(false);

  const storageKey = `bord:pantry-add:${accountId}:${profileId}`;
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(storageKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let restored: PantryAddOperation | null = null;
  try {
    const parsed = pantryAddOperationSchema.safeParse(saved ? JSON.parse(saved) : null);
    if (parsed.success) restored = parsed.data;
  } catch {
    /* Invalid local metadata never starts a write. */
  }
  const pending = memory ?? restored;

  function remember(operation: PantryAddOperation | null) {
    setMemory(operation);
    try {
      if (operation) sessionStorage.setItem(storageKey, JSON.stringify(operation));
      else sessionStorage.removeItem(storageKey);
      window.dispatchEvent(new Event('bord:pantry-add'));
    } catch {
      setError('Keep this page open; the browser cannot retain this request after navigation.');
    }
  }

  const existing = products.find(
    (product) => product.displayName.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  async function resume(operation: PantryAddOperation) {
    if (lock.current || !canEdit) return;
    lock.current = true;
    setBusy(true);
    setError('');
    let latest = operation;
    try {
      const result = await resumePantryAddOperation(operation, (next) => {
        latest = next;
        remember(next);
      });
      remember(null);
      const count = result.acknowledged.length;
      showToast(
        `${operation.label} added to your pantry${count > 1 ? ` · ${count} batches` : ''}.`,
        'success',
      );
      onAdded(operation.label, count);
      setName('');
      setQuantity(1);
      setApproximate(null);
      setBestBefore('');
      setFormKey((key) => key + 1);
      nameRef.current?.focus();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'This addition could not be confirmed.';
      remember({ ...latest, message });
      setError(message);
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || busy || !canEdit) return;
    const data = new FormData(event.currentTarget);
    const batchCount = Number(data.get('batchCount') ?? 1) || 1;
    if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 20) {
      setError('Choose between 1 and 20 separate batches.');
      return;
    }
    const storage = locations.find((l) => l.id === locationId)?.storageType ?? 'pantry';
    const datesGiven = bestBefore || text(data, 'useByDate') || text(data, 'sellByDate');
    const price = optionalNumber(data, 'price');
    const operation = createPantryAddOperation({
      label: existing?.displayName ?? name.trim(),
      productId: existing?.id ?? '',
      product: existing
        ? null
        : {
            displayName: name.trim(),
            brand: text(data, 'brand'),
            category: text(data, 'category'),
            defaultInventoryUnit: unit,
            defaultPackageUnit: text(data, 'packageUnit'),
            defaultStorageType: storage,
            aliases: [],
            isStaple: data.get('isStaple') === 'on',
            restockMode: 'none',
            restockTrigger: 'below_target',
          },
      batch: {
        quantityRemaining: approximate ? null : quantity,
        originalQuantity: approximate ? null : (optionalNumber(data, 'originalQuantity') ?? null),
        unit,
        packageCount: optionalNumber(data, 'packageCount'),
        amountPerPackage: optionalNumber(data, 'amountPerPackage'),
        packageUnit: text(data, 'packageUnit'),
        approximateState: approximate,
        locationId,
        sublocation: text(data, 'sublocation'),
        purchaseDate: text(data, 'purchaseDate'),
        bestBeforeDate: bestBefore,
        useByDate: text(data, 'useByDate'),
        sellByDate: text(data, 'sellByDate'),
        openedDate: text(data, 'openedDate'),
        frozenDate: text(data, 'frozenDate'),
        thawedDate: text(data, 'thawedDate'),
        preparedDate: text(data, 'preparedDate'),
        expiryPrecision: text(data, 'expiryPrecision') || (datesGiven ? 'exact' : 'unknown'),
        status: text(data, 'status') || 'unopened',
        purchasePriceCents: price === null ? null : Math.round(price * 100),
        source: text(data, 'source'),
        notes: text(data, 'notes'),
        excludeFromGrocery: data.get('excludeFromGrocery') === 'on',
        sourceRecipeId: '',
        sourceMealPlanEntryId: '',
        sourceShoppingListItemId: '',
      },
      batchCount,
    });
    remember(operation);
    await resume(operation);
  }

  if (pending)
    return (
      <section className={styles.recovery} aria-label="Pantry addition recovery">
        <h2>Finish adding {pending.label}</h2>
        <p>
          {pending.acknowledged.length} of {pending.batchKeys.length} batches confirmed.{' '}
          {pending.uncertain ? 'The last request’s outcome is unknown. ' : ''}
          Resuming uses the original amounts, so nothing is added twice.
        </p>
        {pending.message && <p role="status">{pending.message}</p>}
        {error && <p role="alert">{error}</p>}
        <div>
          <button
            type="button"
            className="primary-button"
            disabled={busy || !canEdit}
            onClick={() => void resume(pending)}
          >
            {busy ? <ButtonSpinner /> : null}
            {busy ? 'Checking…' : 'Resume this addition'}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Close this request? ${pending.acknowledged.length} batches are confirmed and stay saved.${pending.uncertain ? ' Another batch may also have been saved, so check your pantry before adding it again.' : ''}`,
                )
              ) {
                remember(null);
                setError('');
              }
            }}
          >
            Close request
          </button>
        </div>
      </section>
    );

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.layout}>
        <div className={styles.steps}>
          <section className={styles.step}>
            <h2>
              <span>1</span> What is it?
            </h2>
            <label className={styles.field}>
              <span>Name</span>
              <input
                ref={nameRef}
                name="productName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                list={listId}
                autoComplete="off"
                maxLength={160}
                placeholder="e.g. Chickpeas"
                required
                autoFocus
              />
              <datalist id={listId}>
                {products.map((product) => (
                  <option key={product.id} value={product.displayName} />
                ))}
              </datalist>
            </label>
            {existing ? (
              <p className={styles.match} role="status">
                Adding to your saved product{existing.brand ? ` · ${existing.brand}` : ''}.
              </p>
            ) : name.trim().length > 1 ? (
              <button
                type="button"
                className={styles.lookup}
                onClick={() => onFindFood(name.trim())}
              >
                <Search size={14} aria-hidden="true" /> Look up “{name.trim()}” in food data instead
              </button>
            ) : null}
            {!existing && (
              <div className={styles.row}>
                <label className={styles.field}>
                  <span>Brand</span>
                  <input name="brand" maxLength={120} placeholder="Optional" />
                </label>
                <label className={styles.field}>
                  <span>Category</span>
                  <input name="category" maxLength={80} placeholder="Canned goods" />
                </label>
              </div>
            )}
          </section>

          <section className={styles.step}>
            <h2>
              <span>2</span> How much?
            </h2>
            {approximate ? (
              <div className={styles.chips} role="radiogroup" aria-label="Approximate amount">
                {APPROXIMATE.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={approximate === value}
                    onClick={() => setApproximate(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.amount}>
                <QuantityStepper
                  value={quantity}
                  unit=""
                  step={1}
                  min={0}
                  label={name.trim() || 'item'}
                  editable
                  onChange={setQuantity}
                />
                <label className={styles.unit}>
                  <span className="visually-hidden">Unit</span>
                  <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                    {UNITS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <button
              type="button"
              className={styles.link}
              onClick={() => setApproximate(approximate ? null : 'half')}
            >
              {approximate ? 'Enter an exact amount' : 'Not sure of the exact amount?'}
            </button>
          </section>

          <section className={styles.step}>
            <h2>
              <span>3</span> Where and until when?
            </h2>
            {locations.length > 8 ? (
              <label className={styles.field}>
                <span>Location</span>
                <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.path}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className={styles.chips} role="radiogroup" aria-label="Storage location">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    role="radio"
                    aria-checked={locationId === location.id}
                    onClick={() => setLocationId(location.id)}
                  >
                    {location.path}
                  </button>
                ))}
              </div>
            )}
            <label className={styles.field}>
              <span>Best before</span>
              <input
                type="date"
                value={bestBefore}
                onChange={(event) => setBestBefore(event.target.value)}
              />
            </label>
            <div className={styles.chips} aria-label="Quick dates">
              {SHORTCUTS.map(([label, date]) => (
                <button
                  key={label}
                  type="button"
                  data-active={bestBefore === date() || undefined}
                  onClick={() => setBestBefore(bestBefore === date() ? '' : date())}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          <details className={styles.more} key={formKey}>
            <summary>
              More details <ChevronDown size={16} aria-hidden="true" />
            </summary>
            <div className={styles.moreGrid}>
              <label className={styles.field}>
                <span>Shelf or spot</span>
                <input name="sublocation" placeholder="Upper shelf" maxLength={120} />
              </label>
              <label className={styles.field}>
                <span>Status</span>
                <select name="status" defaultValue="unopened">
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {value[0]!.toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Separate batches</span>
                <input name="batchCount" type="number" min="1" max="20" defaultValue="1" />
              </label>
              <label className={styles.field}>
                <span>Original quantity</span>
                <input name="originalQuantity" type="number" min="0" step="any" />
              </label>
              <label className={styles.field}>
                <span>Package count</span>
                <input name="packageCount" type="number" min="0" step="any" />
              </label>
              <label className={styles.field}>
                <span>Amount per package</span>
                <input name="amountPerPackage" type="number" min="0" step="any" />
              </label>
              <label className={styles.field}>
                <span>Package unit</span>
                <select name="packageUnit" defaultValue="">
                  <option value="">Not recorded</option>
                  {UNITS.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Date precision</span>
                <select name="expiryPrecision" defaultValue="">
                  <option value="">Automatic</option>
                  <option value="exact">Exact</option>
                  <option value="estimated">Estimated</option>
                  <option value="month_only">Month only</option>
                  <option value="unknown">Unknown</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Use by</span>
                <input name="useByDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Sell by</span>
                <input name="sellByDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Purchased</span>
                <input name="purchaseDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Prepared</span>
                <input name="preparedDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Opened</span>
                <input name="openedDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Frozen</span>
                <input name="frozenDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Thawed</span>
                <input name="thawedDate" type="date" />
              </label>
              <label className={styles.field}>
                <span>Price</span>
                <input name="price" type="number" min="0" step="0.01" placeholder="0.00" />
              </label>
              <label className={styles.field}>
                <span>Store or source</span>
                <input name="source" maxLength={160} />
              </label>
              <label className={`${styles.field} ${styles.wide}`}>
                <span>Notes</span>
                <textarea name="notes" rows={2} maxLength={2000} />
              </label>
              <label className={styles.check}>
                <input name="isStaple" type="checkbox" /> Staple product
              </label>
              <label className={styles.check}>
                <input name="excludeFromGrocery" type="checkbox" /> Leave out of grocery
                calculations
              </label>
            </div>
          </details>

          {name.trim().length > 1 && !existing && (
            <details className={styles.more}>
              <summary>
                Need help identifying this food? <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <DecisionAssistance
                headingLevel={3}
                embedded
                inputQuery={name}
                onChoose={(_card, choice) => {
                  const product = products.find((item) => item.id === choice);
                  if (product) setName(product.displayName);
                }}
                initialTask="pantry_input"
                tasks={['pantry_input', 'clarification', 'nutrition_match']}
                title="Need help identifying this food?"
                description="Compare your entry with existing products or reference nutrition."
              />
            </details>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
        <aside className={styles.side}>
          <div className={styles.summary}>
            <h2>Summary</h2>
            <dl>
              <div>
                <dt>Item</dt>
                <dd>{name.trim() || 'Not named yet'}</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>
                  {approximate
                    ? (APPROXIMATE.find(([value]) => value === approximate)?.[1] ?? approximate)
                    : `${quantity} ${unit}`}
                </dd>
              </div>
              <div>
                <dt>Goes in</dt>
                <dd>{locations.find((l) => l.id === locationId)?.path ?? '—'}</dd>
              </div>
              <div>
                <dt>Best before</dt>
                <dd>
                  {bestBefore
                    ? new Date(`${bestBefore}T00:00:00`).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Not set'}
                </dd>
              </div>
            </dl>
            <button
              className="primary-button"
              type="submit"
              disabled={busy || !canEdit || !locationId || !name.trim()}
            >
              {busy ? <ButtonSpinner /> : null}
              {busy ? 'Adding…' : 'Add to pantry'}
            </button>
            {!canEdit && <p>Choose a household profile to change pantry stock.</p>}
          </div>
          {tray}
        </aside>
      </div>
    </form>
  );
}
