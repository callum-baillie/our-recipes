/** Native/server boundary: only structured reviewed identity is sent back, never raw provider payloads. */
export type ReviewedCatalogFood = {
  provider: 'usda_fdc' | 'open_food_facts';
  providerRecordId: string;
  canonicalGtin: string | null;
  displayName: string;
  brand: string;
  quantity: string;
  servingSize: string;
  nutrientBasis: 'per_100g' | 'per_100ml' | 'per_serving' | 'per_unit' | null;
  nutrients: Array<{ nutrientCode: string; amount: number; unit: string }>;
  allergens: string[];
  labels: string[];
  citation: string;
  license: string;
  catalogRef?: {
    transport_id: 'bord_food_api';
    source_id: 'usda_fdc' | 'open_food_facts';
    source_record_id: string;
    source_revision: string;
    catalog_generation: string;
    canonical_product_id: string | null;
  };
};
export function catalogConfirmation(
  record: ReviewedCatalogFood,
  operationId: string,
  unit: string,
) {
  if (!record.providerRecordId || !record.displayName.trim())
    throw new Error('Review a complete source food before saving.');
  if (
    record.catalogRef &&
    (record.catalogRef.source_id !== record.provider ||
      record.catalogRef.source_record_id !== record.providerRecordId)
  )
    throw new Error('The reviewed identity changed. Look up the food again.');
  return {
    operationId,
    selection: {
      provider: record.provider,
      recordId: record.providerRecordId,
      expectedCanonicalGtin: record.canonicalGtin,
      ...(record.catalogRef ? { catalogRef: record.catalogRef } : {}),
    },
    product: {
      displayName: record.displayName.slice(0, 160),
      brand: record.brand.slice(0, 120),
      defaultInventoryUnit: unit.trim(),
      allergens: record.allergens,
      dietaryTags: record.labels,
    },
  };
}
export function catalogQuantity(value: string, unit: string) {
  const quantity = Number(value);
  if (
    !value.trim() ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 10000 ||
    !unit.trim() ||
    unit.trim().length > 30
  )
    throw new Error('Enter a positive amount up to 10,000 and its unit.');
  return { quantity, unit: unit.trim() };
}

/** Existing household product identified by a verified barcode. No remote import is needed. */
export type ReviewedLocalProduct = {
  id: string;
  displayName: string;
  brand: string;
  defaultInventoryUnit: string;
  defaultPackageAmount?: number | null;
  defaultPackageUnit?: string;
};
export type BarcodeReviewResult = {
  preferred?: ReviewedCatalogFood | null;
  alternatives?: ReviewedCatalogFood[];
  localProduct?: ReviewedLocalProduct | null;
  providerStatuses?: { provider: string; status: string }[];
};
export function barcodeReviewChoices(result: BarcodeReviewResult) {
  return {
    localProduct: result.localProduct ?? null,
    records: [result.preferred, ...(result.alternatives ?? [])].filter(
      (food): food is ReviewedCatalogFood => Boolean(food),
    ),
  };
}

/** A scan replaces one explicitly reviewed cart amount, or creates a separate entry. */
export function shoppingScanConfirmation(args: {
  operationId: string;
  record: ReviewedCatalogFood | null;
  localProduct: ReviewedLocalProduct | null;
  quantity: string;
  unit: string;
  item?: { id: string; updatedAt: string };
}) {
  const amount = catalogQuantity(args.quantity, args.unit);
  if (!args.localProduct && !args.record) throw new Error('Review a food before confirming.');
  const identity = args.localProduct
    ? { operationId: args.operationId, localProductId: args.localProduct.id }
    : catalogConfirmation(args.record!, args.operationId, amount.unit);
  return {
    ...identity,
    cartIntent: args.item ? ('replace_existing' as const) : ('separate_entry' as const),
    ...(args.item ? { itemId: args.item.id, expectedUpdatedAt: args.item.updatedAt } : {}),
    cartQuantity: amount.quantity,
    cartUnit: amount.unit,
  };
}
