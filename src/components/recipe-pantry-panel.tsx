'use client';

import { ToastMessage } from './toast-message';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ButtonSpinner } from '@/components/skeleton';
import { PantryAvailabilityPill } from '@/components/pantry-availability-pill';
import type { PantryRecipeAvailability } from '@/lib/domain/pantry-availability';

import styles from './recipe-pantry-panel.module.css';

type PantryProductOption = { id: string; displayName: string };

function quantity(value: number | null, unit: string): string {
  return value === null ? 'not exact' : `${Number(value.toFixed(2))} ${unit}`.trim();
}

export function RecipePantryPanel({
  initialAvailability,
  products,
  allowMapping = true,
  targetServings,
  onAvailabilityChange,
  compact = false,
}: {
  initialAvailability: PantryRecipeAvailability;
  products: PantryProductOption[];
  allowMapping?: boolean;
  targetServings?: number;
  onAvailabilityChange?: (availability: PantryRecipeAvailability) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [availability, setAvailability] = useState(initialAvailability);
  const [ownServings, setServings] = useState(String(initialAvailability.targetServings ?? ''));
  const [pendingIngredientId, setPendingIngredientId] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [message, setMessage] = useState('');
  const servings = targetServings === undefined ? ownServings : String(targetServings);
  const checkedServings = availability.targetServings ?? availability.baseServings;
  const stale = checkedServings !== null && Number(servings) !== checkedServings;

  async function refreshForServings() {
    const value = Number(servings);
    if (!Number.isFinite(value) || value <= 0) return;
    setRecalculating(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/v1/pantry/recipes/${availability.recipeId}/availability?servings=${encodeURIComponent(value)}`,
      );
      const body = (await response.json().catch(() => null)) as {
        availability?: PantryRecipeAvailability;
        error?: { message?: string };
      } | null;
      if (response.ok && body?.availability) {
        setAvailability(body.availability);
        onAvailabilityChange?.(body.availability);
      } else setMessage(body?.error?.message ?? 'Pantry availability could not be recalculated.');
    } catch {
      setMessage('Pantry availability could not be recalculated. Check your connection and retry.');
    } finally {
      setRecalculating(false);
    }
  }

  async function changeMapping(ingredientId: string, productId: string, isOptional: boolean) {
    setPendingIngredientId(ingredientId);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/pantry/mappings/${ingredientId}`, {
        method: productId ? 'PUT' : 'DELETE',
        headers: productId ? { 'Content-Type': 'application/json' } : undefined,
        body: productId
          ? JSON.stringify({ productId, compatibleVariant: false, isOptional })
          : null,
      });
      if (response.ok) {
        await refreshForServings();
        setMessage('Pantry mapping saved.');
        router.refresh();
      } else {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setMessage(body?.error?.message ?? 'The Pantry mapping could not be saved.');
      }
    } catch {
      setMessage('Could not save the pantry match. Please try again.');
    } finally {
      setPendingIngredientId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={`pantry-${availability.recipeId}`}>
      <header className={styles.header}>
        <div>
          {!compact && <p className={styles.eyebrow}>PANTRY CHECK</p>}
          <h3 id={`pantry-${availability.recipeId}`}>What you have on hand</h3>
        </div>
        <PantryAvailabilityPill state={availability.state} />
      </header>
      <p role="status">
        Checked for {checkedServings ?? 'original'} servings.
        {stale ? ` Batch changed to ${servings}; recheck availability.` : ''}
      </p>
      <p className={styles.explainer}>
        Only compatible exact quantities count. Approximate, unmapped, and incompatible stock stays
        visibly unknown.
      </p>
      {availability.baseServings && (
        <div className={styles.servings}>
          <label htmlFor={`pantry-servings-${availability.recipeId}`}>Check servings</label>
          <input
            id={`pantry-servings-${availability.recipeId}`}
            type="number"
            min="0.25"
            max="1000"
            step="0.25"
            value={servings}
            readOnly={targetServings !== undefined}
            onChange={(event) => setServings(event.target.value)}
          />
          <button
            type="button"
            disabled={recalculating}
            aria-busy={recalculating}
            onClick={() => void refreshForServings()}
          >
            {recalculating ? <ButtonSpinner /> : null}
            {recalculating ? 'Recalculating…' : 'Recalculate'}
          </button>
        </div>
      )}
      <ul className={styles.list}>
        {availability.ingredients.map((ingredient) => (
          <li key={ingredient.id} className={styles.item}>
            <div className={styles.itemHeading}>
              <strong>{ingredient.item}</strong>
              <PantryAvailabilityPill state={ingredient.state} />
            </div>
            {ingredient.isOptional && <span className={styles.optional}>Optional</span>}
            <p>
              Need {quantity(ingredient.requiredQuantity, ingredient.unit)} · exact available{' '}
              {quantity(ingredient.availableQuantity, ingredient.unit)}
              {ingredient.shortageQuantity !== null && ingredient.shortageQuantity > 0
                ? ` · short ${quantity(ingredient.shortageQuantity, ingredient.unit)}`
                : ''}
            </p>
            <p>
              Planned commitments {quantity(ingredient.plannedCommittedQuantity, ingredient.unit)} ·
              projected remainder {quantity(ingredient.projectedRemainderQuantity, ingredient.unit)}
            </p>
            {ingredient.earliestExpiryDate && (
              <small>Earliest recorded batch date: {ingredient.earliestExpiryDate}.</small>
            )}
            {ingredient.matchingBatches.length > 0 && (
              <details>
                <summary>{ingredient.matchingBatches.length} matching Pantry batches</summary>
                <ul>
                  {ingredient.matchingBatches.map((batch) => (
                    <li key={batch.batchId}>
                      {quantity(batch.quantity, batch.unit)} ·{' '}
                      {batch.locationName ?? 'Location unknown'}
                      {batch.expiryDate
                        ? ` · recorded date ${batch.expiryDate}`
                        : ' · no expiry recorded'}
                      {batch.exact ? '' : ' · not counted exactly'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <small>{ingredient.reason}</small>
            {allowMapping && !ingredient.productId && (
              <div className="pantry-match-suggestions">
                {suggestProducts(ingredient.item, products).map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    disabled={pendingIngredientId !== null}
                    onClick={() =>
                      void changeMapping(ingredient.id, product.id, ingredient.isOptional)
                    }
                  >
                    Suggested: {product.displayName} · Use match
                  </button>
                ))}
              </div>
            )}
            {allowMapping && (
              <label className={styles.mapping}>
                <span>Pantry product</span>
                <select
                  value={ingredient.productId ?? ''}
                  disabled={pendingIngredientId === ingredient.id}
                  onChange={(event) =>
                    void changeMapping(ingredient.id, event.target.value, ingredient.isOptional)
                  }
                >
                  <option value="">Not mapped</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
      {message && <ToastMessage message={message} tone="info" />}
    </section>
  );
}

function suggestProducts(item: string, products: PantryProductOption[]) {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 2)
        .map((word) => word.replace(/s$/, '')),
    );
  const wanted = tokens(item);
  return products
    .map((product) => {
      const actual = tokens(product.displayName);
      const common = [...wanted].filter((word) => actual.has(word)).length;
      return { product, score: common / Math.max(wanted.size, actual.size, 1) };
    })
    .filter((match) => match.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((match) => match.product);
}
