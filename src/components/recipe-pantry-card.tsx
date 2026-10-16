'use client';
import { useRef } from 'react';
import { PackageCheck, X } from 'lucide-react';
import { RecipePantryPanel } from './recipe-pantry-panel';
import { PantryAvailabilityPill } from './pantry-availability-pill';
import type { PantryRecipeAvailability } from '@/lib/domain/pantry-availability';
export function RecipePantryCard({
  initialAvailability,
  products,
}: {
  initialAvailability: PantryRecipeAvailability;
  products: { id: string; displayName: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const mapped = initialAvailability.ingredients.filter((item) => item.productId).length;
  return (
    <section className="recipe-pantry-card">
      <PackageCheck size={22} />
      <h2>Pantry check</h2>
      <PantryAvailabilityPill state={initialAvailability.state} />
      <p>
        {mapped} of {initialAvailability.ingredients.length} ingredients linked to pantry products.
      </p>
      <button className="text-button" onClick={() => dialog.current?.showModal()}>
        Check ingredients & matches
      </button>
      <dialog
        ref={dialog}
        className="pantry-check-dialog"
        aria-label="Check recipe ingredients against your pantry"
      >
        <button
          className="dialog-close"
          aria-label="Close pantry check"
          onClick={() => dialog.current?.close()}
        >
          <X size={22} />
        </button>
        <RecipePantryPanel
          key={JSON.stringify(initialAvailability)}
          initialAvailability={initialAvailability}
          products={products}
        />
      </dialog>
    </section>
  );
}
