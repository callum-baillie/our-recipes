import type { ReviewedCatalogFood } from './catalog';
import { catalogContextKey, sourcePortionAmount, type CatalogMeasure } from './catalog-measures';

/** The server selects the saved record and computes allowed conversions from its frozen basis. */
export type NutritionSourceRecord = {
  id: string;
  revision: number;
  basisType: 'per_100g' | 'per_100ml' | 'per_serving' | 'per_unit';
  basisAmount: number;
  basisUnit: string;
  sourceName: string;
  catalogRef: NonNullable<ReviewedCatalogFood['catalogRef']> | null;
  supportedUnits: string[];
};

export function nutritionSourceContextKey(productId: string, record: NutritionSourceRecord) {
  return JSON.stringify([
    productId,
    record.id,
    record.revision,
    record.basisType,
    record.basisAmount,
    record.basisUnit,
    record.supportedUnits,
    record.catalogRef ? catalogContextKey(record.catalogRef, productId) : null,
  ]);
}

/** Explicit selection only: reading a measure never replaces the caller's quantity/unit draft. */
export function selectNutritionSourcePortion({
  productId,
  record,
  reviewedContextKey,
  measure,
  locked,
}: {
  productId: string;
  record: NutritionSourceRecord;
  reviewedContextKey: string;
  measure: CatalogMeasure;
  locked: boolean;
}) {
  if (
    locked ||
    !record.catalogRef ||
    !record.supportedUnits.includes('g') ||
    reviewedContextKey !== nutritionSourceContextKey(productId, record)
  )
    return null;
  const amount = sourcePortionAmount(measure);
  return amount ? { ...amount, expectedFoodNutritionRecordId: record.id } : null;
}
