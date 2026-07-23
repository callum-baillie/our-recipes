import { z } from 'zod';

import { NUTRIENT_CODES, type NutrientCode } from '@/lib/domain/nutrition';

export const foodProviderIdSchema = z.enum(['local', 'open_food_facts', 'usda_fdc']);
export type FoodProviderId = z.infer<typeof foodProviderIdSchema>;

export const providerStatusCodeSchema = z.enum([
  'available',
  'not_configured',
  'rate_limited',
  'temporarily_unavailable',
  'authentication_failed',
  'invalid_response',
  'disabled',
]);

export type ProviderStatusCode = z.infer<typeof providerStatusCodeSchema>;

export type FoodProviderCapabilities = {
  exactBarcode: boolean;
  nameSearch: boolean;
  details: boolean;
  images: boolean;
};

export type ProviderStatus = {
  provider: FoodProviderId;
  status: ProviderStatusCode;
  capabilities: FoodProviderCapabilities;
  configured: boolean;
  retryAt: string | null;
  remaining: number | null;
};

export type FoodImage = {
  url: string;
  type: 'front' | 'ingredients' | 'nutrition' | 'packaging';
  language: string;
  width: number | null;
  provider: FoodProviderId;
  attribution: string;
  license: string;
};

export type NormalizedNutrient = {
  nutrientCode: NutrientCode;
  amount: number;
  unit: string;
  basis: 'per_100g' | 'per_100ml' | 'per_serving' | 'per_unit';
  originalId: string;
  originalName: string;
  originalUnit: string;
};

export type FoodRecord = {
  provider: Exclude<FoodProviderId, 'local'>;
  providerRecordId: string;
  canonicalGtin: string | null;
  displayName: string;
  genericName: string;
  brand: string;
  dataType: string;
  quantity: string;
  servingSize: string;
  servingWeightGrams: number | null;
  categories: string[];
  ingredientsText: string;
  ingredientTags: string[];
  allergens: string[];
  traces: string[];
  additives: string[];
  labels: string[];
  countries: string[];
  language: string;
  nutrients: NormalizedNutrient[];
  nutrientBasis: 'per_100g' | 'per_100ml' | 'per_serving' | 'per_unit' | null;
  nutriScore: string;
  novaGroup: number | null;
  images: FoodImage[];
  completeness: number;
  sourceUrl: string;
  citation: string;
  license: string;
  schemaVersion: string;
  retrievedAt: string;
  providerMetadata: Record<string, unknown>;
};

export type FoodResultGroup = {
  preferred: FoodRecord | null;
  alternatives: FoodRecord[];
  providerStatuses: ProviderStatus[];
  cache: { hit: boolean; stale: boolean };
};

const barcodeInputSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform((value) => value.replace(/[\s-]+/gu, ''))
  .refine((value) => /^\d+$/u.test(value), 'Barcode must contain digits only.')
  .refine(
    (value) => [8, 12, 13, 14].includes(value.length),
    'Use GTIN-8, UPC-A, EAN-13, or GTIN-14.',
  );

function gs1CheckDigit(valueWithoutCheckDigit: string): number {
  let sum = 0;
  for (
    let index = valueWithoutCheckDigit.length - 1, position = 1;
    index >= 0;
    index -= 1, position += 1
  ) {
    const digit = Number(valueWithoutCheckDigit[index]);
    sum += digit * (position % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeGtin(raw: string): { value: string; canonicalGtin: string } {
  let value: string;
  try {
    value = barcodeInputSchema.parse(raw);
  } catch {
    throw new FoodDataError(
      'INVALID_BARCODE',
      'Use a checksum-valid GTIN-8, UPC-A, EAN-13, or GTIN-14 barcode.',
    );
  }
  const expected = gs1CheckDigit(value.slice(0, -1));
  if (expected !== Number(value.at(-1)))
    throw new FoodDataError('INVALID_BARCODE', 'Barcode check digit is invalid.');
  return { value, canonicalGtin: value.padStart(14, '0') };
}

export const barcodeLookupInputSchema = z
  .object({
    barcode: z.string().trim().min(1).max(32),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
      .default('en'),
    compareUsda: z.boolean().default(false),
  })
  .strict()
  .transform((input) => ({ ...input, ...normalizeGtin(input.barcode) }));

export const foodSearchInputSchema = z
  .object({
    query: z.string().trim().min(2).max(120),
    context: z.enum(['pantry', 'recipe', 'nutrition']),
    kind: z.enum(['any', 'generic', 'branded']).default('any'),
    page: z.number().int().min(1).max(10).default(1),
  })
  .strict();

export const foodDetailsInputSchema = z
  .object({
    provider: foodProviderIdSchema.exclude(['local']),
    recordId: z.string().trim().min(1).max(160),
    language: z
      .string()
      .trim()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u)
      .default('en'),
  })
  .strict();

const localProductSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(120).default(''),
    variant: z.string().trim().max(120).default(''),
    category: z.string().trim().max(80).default(''),
    defaultInventoryUnit: z.string().trim().min(1).max(30).default('each'),
    defaultPackageAmount: z.number().positive().max(1_000_000).nullable().default(null),
    defaultPackageUnit: z.string().trim().max(30).default(''),
    allergens: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
    dietaryTags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  })
  .strict();

export const foodCatalogImportInputSchema = z
  .object({
    operationId: z.string().uuid(),
    selection: z.object({
      provider: foodProviderIdSchema.exclude(['local']),
      recordId: z.string().trim().min(1).max(160),
      expectedCanonicalGtin: z
        .string()
        .length(14)
        .regex(/^\d{14}$/u)
        .nullable()
        .default(null),
    }),
    product: localProductSchema,
  })
  .strict();

export type FoodCatalogImportInput = z.infer<typeof foodCatalogImportInputSchema>;

export const canonicalNutrientCodeSchema = z.enum(NUTRIENT_CODES);

export class FoodDataError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_BARCODE'
      | 'INVALID_QUERY'
      | 'NOT_FOUND'
      | 'NOT_CONFIGURED'
      | 'AUTH_FAILED'
      | 'RATE_LIMITED'
      | 'UNAVAILABLE'
      | 'TIMEOUT'
      | 'MALFORMED_RESPONSE'
      | 'NORMALIZATION_FAILED',
    message: string,
    public readonly provider: FoodProviderId | null = null,
    public readonly retryAt: Date | null = null,
  ) {
    super(message);
  }
}
