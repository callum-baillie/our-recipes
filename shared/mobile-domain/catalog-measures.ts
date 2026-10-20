/** Public portion projection: gramWeight belongs to the complete stated source portion. */
export type CatalogMeasure = {
  label: string;
  amount: number | null;
  unit: string | null;
  modifier: string | null;
  description: string | null;
  gramWeight: number | null;
  form: string | null;
  basis: string | null;
};
const text = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : null;
const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function normalizeCatalogMeasure(row: Record<string, unknown>): CatalogMeasure {
  const measureUnit =
    row.measureUnit && typeof row.measureUnit === 'object'
      ? (row.measureUnit as Record<string, unknown>)
      : {};
  const unit = text(row.unit) ?? text(measureUnit.name);
  const amount = number(row.amount);
  const modifier = text(row.modifier);
  const description = text(row.portionDescription) ?? text(row.description) ?? text(row.label);
  const quantity = [amount === null ? null : String(amount), unit]
    .filter((value) => value !== null)
    .join(' ');
  const detail = modifier ?? description;
  const label =
    [quantity || null, detail && detail !== quantity ? detail : null].filter(Boolean).join(' · ') ||
    'Source portion (amount not recorded)';
  return {
    label,
    amount,
    unit,
    modifier,
    description,
    gramWeight: number(row.gramWeight) ?? number(row.gram_weight),
    form: text(row.form),
    basis: text(row.basis),
  };
}
export function sourcePortionAmount(measure: CatalogMeasure) {
  if (
    measure.gramWeight === null ||
    !Number.isFinite(measure.gramWeight) ||
    measure.gramWeight <= 0 ||
    measure.gramWeight > 10000
  )
    return null;
  return { quantity: measure.gramWeight, unit: 'g' as const };
}
export function catalogContextKey(
  reference: {
    source_id: string;
    source_record_id: string;
    source_revision: string;
    catalog_generation: string;
  },
  query: string,
) {
  return JSON.stringify([
    reference.source_id,
    reference.source_record_id,
    reference.source_revision,
    reference.catalog_generation,
    query,
  ]);
}
/** Invalidating a selection makes every prior completion inert, including finally/error callbacks. */
export function createRequestGeneration() {
  let generation = 0;
  return { next: () => ++generation, isCurrent: (token: number) => token === generation };
}
