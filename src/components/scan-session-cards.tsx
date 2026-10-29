'use client';

import { ChevronDown, Package, Tag, Trash2, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { BatchStepper, QuantityStepper } from './quantity-stepper';
import { ProductImage } from './product-image';
import { ButtonSpinner } from './skeleton';
import { useToast } from './toast-provider';
import {
  moveBatch,
  pantryRequest,
  setBatchBestBefore,
  type BatchInfo,
} from '@/lib/client/pantry-batch';
import { defaultLocation } from '@/lib/client/pantry-locations';
import styles from './scan-session-cards.module.css';

export type Location = { id: string; path: string; storageType: string };

/** One line of a scan session, whether it came from the camera or the handheld scanner. */
export type SessionItem = {
  key: string;
  source: 'camera' | 'handheld';
  title: string;
  brand: string;
  gtin: string | null;
  time: string;
  /** Still being looked up or saved. */
  looking?: boolean;
  batch: BatchInfo | null;
  removed: boolean;
  /** Text shown when there is no editable batch. */
  amountLabel: string;
  /** Size of one stepper tap. */
  step?: number;
  motion?: 'in' | 'bump' | 'void' | undefined;
  /** A removed line that can be reversed from the list. */
  canPutBack?: boolean;
};

export type SavedBarcodeProduct = {
  product: { id: string; displayName: string };
  batch: BatchInfo;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function SessionItemRow({
  item,
  ...props
}: {
  item: SessionItem;
  locations: Location[];
  canEdit: boolean;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <li
      className={styles.item}
      data-removed={item.removed || undefined}
      data-motion={item.motion}
      data-source={item.source}
    >
      <ItemCard item={item} {...props} />
    </li>
  );
}

function ItemCard({
  item,
  locations,
  canEdit,
  expanded,
  pending,
  onToggle,
  onRemove,
  onChanged,
}: {
  item: SessionItem;
  locations: Location[];
  canEdit: boolean;
  expanded: boolean;
  pending: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onChanged: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const { batch, removed } = item;
  const locationId =
    batch?.locationId || locations.find((l) => l.path === batch?.location)?.id || '';
  const detailsId = `scan-details-${item.key}`;
  const editable = canEdit && !!batch && !removed && !item.looking;

  async function run(work: () => Promise<unknown>, success: string) {
    setSaving(true);
    try {
      await work();
      showToast(success, 'success');
      await onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'That could not be saved.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={styles.card} data-looking={item.looking || undefined}>
      <ProductImage
        className={styles.photo}
        gtin={item.gtin}
        fallback={<Package size={20} />}
        eager
      />
      <div className={styles.main}>
        <h4>{item.title}</h4>
        <p>
          <span className={styles.source}>{item.source === 'camera' ? 'Camera' : 'Scanner'}</span>
          <time dateTime={item.time}>{clock(item.time)}</time>
          {item.brand && <span>{item.brand}</span>}
          {batch?.location && <span>{batch.location}</span>}
          {removed && <span className={styles.voided}>Removed</span>}
        </p>
      </div>
      {editable && batch.quantity !== null ? (
        <div className={styles.stepperSlot}>
          <BatchStepper
            batch={{
              id: batch.id,
              version: batch.version,
              quantity: batch.quantity,
              unit: batch.unit,
            }}
            step={item.step}
            label={item.title}
            compact
            onSaved={async () => {
              await onChanged();
            }}
            onError={(message) => showToast(message, 'error')}
          />
        </div>
      ) : (
        <p className={styles.amount}>{item.looking ? 'Adding…' : item.amountLabel}</p>
      )}
      {editable && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`Options for ${item.title}`}
          onClick={onToggle}
        >
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      )}
      {editable && (
        <div className={styles.details} id={detailsId} data-open={expanded || undefined}>
          <div>
            <label>
              <span>Location</span>
              <select
                value={locationId}
                disabled={saving}
                onChange={(event) =>
                  void run(
                    () => moveBatch(batch, event.target.value),
                    `Moved ${item.title} to ${locations.find((l) => l.id === event.target.value)?.path}.`,
                  )
                }
              >
                {!locationId && <option value="">{batch.location}</option>}
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.path}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Best before</span>
              <input
                key={batch.version}
                type="date"
                defaultValue={batch.bestBefore ?? ''}
                disabled={saving}
                onChange={(event) =>
                  void run(
                    () => setBatchBestBefore(batch.id, event.target.value),
                    event.target.value ? 'Best-before date saved.' : 'Best-before date cleared.',
                  )
                }
              />
            </label>
            <button
              type="button"
              className={styles.remove}
              disabled={pending || saving}
              onClick={onRemove}
            >
              {pending ? <ButtonSpinner /> : <Trash2 size={15} aria-hidden="true" />} Remove
            </button>
          </div>
        </div>
      )}
      {canEdit && !batch && !removed && item.canPutBack && (
        <button type="button" className={styles.remove} disabled={pending} onClick={onRemove}>
          <Undo2 size={15} aria-hidden="true" /> Put back
        </button>
      )}
    </article>
  );
}

/** A barcode no food database knows: name it once and every scan of it is added. */
export function UnnamedCard({
  barcode,
  count,
  source,
  locations,
  canEdit,
  onSaved,
}: {
  barcode: string;
  count: number;
  source: 'camera' | 'handheld';
  locations: Location[];
  canEdit: boolean;
  onSaved: (saved: SavedBarcodeProduct) => void;
}) {
  const { showToast } = useToast();
  const home = defaultLocation(locations);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState(count);
  const [locationId, setLocationId] = useState(home?.id ?? '');
  const [bestBefore, setBestBefore] = useState('');
  const [more, setMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // More scans of the same barcode raise the count, until the person starts choosing one.
  const [touched, setTouched] = useState(false);
  const shown = touched ? quantity : count;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const storage = locations.find((l) => l.id === locationId)?.storageType ?? 'pantry';
    setSaving(true);
    setError('');
    try {
      const saved = await pantryRequest<{
        product: { id: string; displayName: string };
        batch: {
          id: string;
          version: number;
          quantityRemaining: number | null;
          unit: string;
          locationId: string;
          bestBeforeDate: string | null;
        };
      }>(
        '/api/v1/pantry/barcode-products',
        'POST',
        {
          barcode,
          product: {
            displayName: name.trim(),
            brand: brand.trim(),
            defaultInventoryUnit: 'package',
            defaultPackageAmount: 1,
            defaultPackageUnit: 'package',
            defaultStorageType: storage,
          },
          batch: {
            quantityRemaining: shown,
            originalQuantity: shown,
            unit: 'package',
            locationId,
            bestBeforeDate: bestBefore,
            expiryPrecision: bestBefore ? 'exact' : 'unknown',
            source: source === 'camera' ? 'camera-scan' : 'barcode-scanner',
          },
        },
        true,
      );
      showToast(
        `Saved ${name.trim()}${shown > 1 ? ` · ${shown} added` : ''}. Next time it is recognised automatically.`,
        'success',
      );
      onSaved({
        product: saved.product,
        batch: {
          id: saved.batch.id,
          version: saved.batch.version,
          quantity: saved.batch.quantityRemaining,
          unit: saved.batch.unit,
          locationId: saved.batch.locationId,
          location: locations.find((l) => l.id === saved.batch.locationId)?.path ?? '',
          bestBefore: saved.batch.bestBeforeDate,
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.unnamed} onSubmit={save}>
      <div className={styles.unnamedHead}>
        <span className={styles.tag} aria-hidden="true">
          <Tag size={18} />
        </span>
        <div>
          <h4>Unrecognised barcode</h4>
          <p>
            <code>{barcode}</code>
            <span>
              scanned {count} {count === 1 ? 'time' : 'times'}
            </span>
          </p>
        </div>
      </div>
      <div className={styles.nameRow}>
        <label>
          <span className="visually-hidden">Product name for barcode {barcode}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="What is this? e.g. Baked beans"
            maxLength={160}
            disabled={!canEdit || saving}
            required
          />
        </label>
        <button type="submit" disabled={!canEdit || saving || !name.trim() || !locationId}>
          {saving ? <ButtonSpinner /> : null}
          {saving ? 'Saving…' : `Add ${shown > 1 ? shown : ''}`.trim()}
        </button>
      </div>
      <button
        type="button"
        className={styles.moreToggle}
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        Customize <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div className={styles.details} data-open={more || undefined}>
        <div>
          <label>
            <span>Brand</span>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={120} />
          </label>
          <label>
            <span>Location</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.path}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Best before</span>
            <input type="date" value={bestBefore} onChange={(e) => setBestBefore(e.target.value)} />
          </label>
          <div className={styles.field}>
            <span>Quantity</span>
            <QuantityStepper
              value={shown}
              unit="packages"
              step={1}
              min={1}
              label="this product"
              compact
              onChange={(next) => {
                setTouched(true);
                setQuantity(next);
              }}
            />
          </div>
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
