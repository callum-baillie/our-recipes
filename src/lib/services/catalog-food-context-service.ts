import 'server-only';

import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import { FoodDataError } from '@/lib/domain/food-data';
import {
  catalogEnrichmentInputSchema,
  catalogMeasuresInputSchema,
  storageGuidanceInputSchema,
  type CatalogMeasure,
} from '@/lib/domain/bord-catalog';
import { getCatalogFoodDetails, isNativeCatalogEnabled } from './bord-catalog-service';

function client() {
  if (!isNativeCatalogEnabled())
    throw new FoodDataError(
      'DISABLED',
      'Native catalog context is disabled. Manual food records remain available.',
    );
  return new BordCatalogClient();
}
const text = (value: unknown, maximum = 300) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
const positive = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export async function readCatalogMeasures(input: unknown) {
  const { reference, form, basis } = catalogMeasuresInputSchema.parse(input);
  const api = client();
  // Validate source identity and exact revision before displaying revision-bound evidence.
  await getCatalogFoodDetails(reference.source_id, reference.source_record_id, 'en', reference);
  const result = await api.measures(
    reference.source_id,
    reference.source_record_id,
    reference.source_revision,
    { ...(form ? { form } : {}), ...(basis ? { basis } : {}) },
  );
  const measures: CatalogMeasure[] = result.data.map((row) => {
    const measureUnit =
      row.measureUnit && typeof row.measureUnit === 'object'
        ? (row.measureUnit as Record<string, unknown>)
        : {};
    const unit = text(row.unit) ?? text(measureUnit.name);
    const amount = positive(row.amount);
    return {
      label:
        text(row.modifier) ??
        text(row.portionDescription) ??
        text(row.label) ??
        ([amount, unit].filter((part) => part !== null).join(' ') || 'Source measure'),
      amount,
      unit,
      gramWeight: positive(row.gramWeight) ?? positive(row.gram_weight),
      form: text(row.form),
      basis: text(row.basis),
    };
  });
  return {
    reference,
    measures,
    generation: result.meta.catalog_generation,
    warnings: result.meta.warnings,
  };
}

export async function searchStorageGuidance(input: unknown) {
  const parsed = storageGuidanceInputSchema.parse(input);
  const params = new URLSearchParams({ query: parsed.query, limit: '20' });
  if (parsed.form) params.set('form', parsed.form);
  if (parsed.storageState) params.set('storage_state', parsed.storageState);
  if (parsed.cursor) params.set('cursor', parsed.cursor);
  const result = await client().storageGuidance(params);
  // Only the attributed guidance projection is public; source workbooks/raw payloads stay private.
  return {
    guidance: result.data.map((row) => ({
      id: row.id,
      name: row.name,
      revision: row.content_revision,
      form: row.form ?? null,
      storageState: row.storage_state ?? null,
      details: row.storage_guidance,
      attribution: row.attribution,
      license: row.license,
      sourceRefs: row.source_refs,
      preciseExpiry: row.precise_expiry,
    })),
    generation: result.meta.catalog_generation,
    nextCursor: result.meta.next_cursor,
    warnings: result.meta.warnings,
  };
}

export async function enrichCatalogProducts(input: unknown) {
  const parsed = catalogEnrichmentInputSchema.parse(input);
  const result = await client().enrich(
    parsed.lines.map((line) => ({
      line_id: line.lineId,
      product_id: line.productId,
      ...(line.storeId ? { store_id: line.storeId } : {}),
    })),
  );
  const returned = new Set<string>();
  for (const line of result.data) {
    const requested = parsed.lines.find((request) => request.lineId === line.line_id);
    if (
      !requested ||
      returned.has(line.line_id) ||
      (line.product && line.product.id !== requested.productId) ||
      (line.retail_evidence &&
        (line.retail_evidence.product_id !== requested.productId ||
          line.retail_evidence.store_id !== (requested.storeId ?? null)))
    )
      throw new FoodDataError(
        'MALFORMED_RESPONSE',
        'Catalog enrichment did not match the requested products.',
      );
    returned.add(line.line_id);
  }
  if (returned.size !== parsed.lines.length)
    throw new FoodDataError('MALFORMED_RESPONSE', 'Catalog enrichment omitted a requested line.');
  return {
    lines: result.data.map((line) => ({
      lineId: line.line_id,
      product: line.product
        ? {
            id: line.product.id,
            revision: line.product.content_revision,
            name: text(line.product.name) ?? text(line.product.display_name),
            sourceRefs: line.product.source_refs,
          }
        : null,
      evidence: line.retail_evidence,
    })),
    generation: result.meta.catalog_generation,
    warnings: result.meta.warnings,
  };
}
