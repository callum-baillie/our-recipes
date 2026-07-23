import { z } from 'zod';

import { getRuntimeConfig } from '@/lib/config';
import {
  FoodDataError,
  normalizeGtin,
  type FoodRecord,
  type NormalizedNutrient,
} from '@/lib/domain/food-data';
import type { NutrientCode } from '@/lib/domain/nutrition';
import type { FoodDataProvider, ProviderResponse } from '@/lib/providers/food-data-provider';

const productSchema = z.object({
  code: z.union([z.string(), z.number()]).optional(),
  product_name: z.string().optional(),
  generic_name: z.string().optional(),
  brands: z.string().optional(),
  quantity: z.string().optional(),
  serving_size: z.string().optional(),
  serving_quantity: z.number().optional(),
  categories_tags: z.array(z.string()).optional(),
  ingredients_text: z.string().optional(),
  ingredients_tags: z.array(z.string()).optional(),
  allergens_tags: z.array(z.string()).optional(),
  traces_tags: z.array(z.string()).optional(),
  additives_tags: z.array(z.string()).optional(),
  labels_tags: z.array(z.string()).optional(),
  countries_tags: z.array(z.string()).optional(),
  lang: z.string().optional(),
  nutriments: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  nutrition_data_per: z.string().optional(),
  nutriscore_grade: z.string().optional(),
  nova_group: z.number().optional(),
  completeness: z.number().optional(),
  image_front_url: z.string().url().optional(),
  image_front_small_url: z.string().url().optional(),
  image_front_thumb_url: z.string().url().optional(),
  image_ingredients_url: z.string().url().optional(),
  image_nutrition_url: z.string().url().optional(),
  image_packaging_url: z.string().url().optional(),
});

const responseSchema = z.object({
  status: z.union([z.number(), z.string()]).optional(),
  product: productSchema.optional(),
});

const fields = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'categories_tags',
  'ingredients_text',
  'ingredients_tags',
  'allergens_tags',
  'traces_tags',
  'additives_tags',
  'labels_tags',
  'countries_tags',
  'lang',
  'nutriments',
  'nutrition_data_per',
  'nutriscore_grade',
  'nova_group',
  'completeness',
  'image_front_url',
  'image_front_small_url',
  'image_front_thumb_url',
  'image_ingredients_url',
  'image_nutrition_url',
  'image_packaging_url',
].join(',');

const nutrientMap: Record<string, { code: NutrientCode; unit: string; factor?: number }> = {
  'energy-kcal': { code: 'energy_kcal', unit: 'kcal' },
  energy: { code: 'energy_kj', unit: 'kJ' },
  proteins: { code: 'protein', unit: 'g' },
  carbohydrates: { code: 'carbohydrate', unit: 'g' },
  fiber: { code: 'fiber', unit: 'g' },
  sugars: { code: 'total_sugars', unit: 'g' },
  fat: { code: 'total_fat', unit: 'g' },
  'saturated-fat': { code: 'saturated_fat', unit: 'g' },
  cholesterol: { code: 'cholesterol', unit: 'mg', factor: 1000 },
  sodium: { code: 'sodium', unit: 'mg', factor: 1000 },
  potassium: { code: 'potassium', unit: 'mg', factor: 1000 },
  calcium: { code: 'calcium', unit: 'mg', factor: 1000 },
  iron: { code: 'iron', unit: 'mg', factor: 1000 },
  alcohol: { code: 'alcohol', unit: 'g' },
};

function cleanTags(values: string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) =>
          value
            .replace(/^[a-z]{2}:/u, '')
            .replace(/-/gu, ' ')
            .trim(),
        )
        .filter(Boolean),
    ),
  ];
}

function trustedImage(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'images.openfoodfacts.org' ? value : null;
  } catch {
    return null;
  }
}

function nutrients(product: z.infer<typeof productSchema>): NormalizedNutrient[] {
  const source = product.nutriments ?? {};
  return Object.entries(nutrientMap).flatMap(([key, mapping]) => {
    const suffix = product.nutrition_data_per === 'serving' ? '_serving' : '_100g';
    const raw = source[`${key}${suffix}`] ?? source[`${key}_100g`];
    const amount =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
    if (!Number.isFinite(amount) || amount < 0) return [];
    return [
      {
        nutrientCode: mapping.code,
        amount: amount * (mapping.factor ?? 1),
        unit: mapping.unit,
        basis:
          product.nutrition_data_per === 'serving'
            ? ('per_serving' as const)
            : ('per_100g' as const),
        originalId: key,
        originalName: key,
        originalUnit: mapping.factor ? 'g' : mapping.unit,
      },
    ];
  });
}

function normalizeProduct(
  product: z.infer<typeof productSchema>,
  requestedLanguage: string,
): FoodRecord {
  const rawCode = String(product.code ?? '');
  let canonicalGtin: string | null = null;
  try {
    canonicalGtin = normalizeGtin(rawCode).canonicalGtin;
  } catch {
    canonicalGtin = null;
  }
  const providerRecordId = rawCode || canonicalGtin || '';
  const imageLicense = 'CC BY-SA 3.0';
  const imageEntries = [
    ['front', trustedImage(product.image_front_small_url ?? product.image_front_url)],
    ['ingredients', trustedImage(product.image_ingredients_url)],
    ['nutrition', trustedImage(product.image_nutrition_url)],
    ['packaging', trustedImage(product.image_packaging_url)],
  ] as const;
  const normalizedNutrients = nutrients(product);
  return {
    provider: 'open_food_facts',
    providerRecordId,
    canonicalGtin,
    displayName: product.product_name?.trim() ?? '',
    genericName: product.generic_name?.trim() ?? '',
    brand: product.brands?.trim() ?? '',
    dataType: 'product',
    quantity: product.quantity?.trim() ?? '',
    servingSize: product.serving_size?.trim() ?? '',
    servingWeightGrams: product.serving_quantity ?? null,
    categories: cleanTags(product.categories_tags),
    ingredientsText: product.ingredients_text?.trim() ?? '',
    ingredientTags: cleanTags(product.ingredients_tags),
    allergens: cleanTags(product.allergens_tags),
    traces: cleanTags(product.traces_tags),
    additives: cleanTags(product.additives_tags),
    labels: cleanTags(product.labels_tags),
    countries: cleanTags(product.countries_tags),
    language: product.lang ?? requestedLanguage,
    nutrients: normalizedNutrients,
    nutrientBasis: normalizedNutrients[0]?.basis ?? null,
    nutriScore: product.nutriscore_grade ?? '',
    novaGroup: product.nova_group ?? null,
    images: imageEntries.flatMap(([type, url]) =>
      url
        ? [
            {
              url,
              type,
              language: product.lang ?? requestedLanguage,
              width: type === 'front' ? 200 : 400,
              provider: 'open_food_facts' as const,
              attribution: 'Open Food Facts contributors',
              license: imageLicense,
            },
          ]
        : [],
    ),
    completeness: Math.max(
      0,
      Math.min(1, product.completeness ?? (normalizedNutrients.length ? 0.6 : 0.25)),
    ),
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(providerRecordId)}`,
    citation: 'Open Food Facts contributors',
    license: 'ODbL 1.0; contents DBCL 1.0',
    schemaVersion: 'off-v3.6-normalized-v1',
    retrievedAt: new Date().toISOString(),
    providerMetadata: { nutritionDataPer: product.nutrition_data_per ?? null },
  };
}

function headers(response: Response) {
  const retry = response.headers.get('retry-after');
  const retryAt = retry ? new Date(Date.now() + Number(retry) * 1000) : null;
  return { rateLimit: null, rateRemaining: null, retryAt };
}

async function read(
  response: Response,
  language: string,
): Promise<ProviderResponse<FoodRecord | null>> {
  if (response.status === 404) return { value: null, ...headers(response) };
  if (response.status === 429)
    throw new FoodDataError(
      'RATE_LIMITED',
      'Open Food Facts is temporarily rate limited.',
      'open_food_facts',
      headers(response).retryAt,
    );
  if (!response.ok)
    throw new FoodDataError(
      'UNAVAILABLE',
      'Open Food Facts is temporarily unavailable.',
      'open_food_facts',
    );
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new FoodDataError(
      'MALFORMED_RESPONSE',
      'Open Food Facts returned an invalid response.',
      'open_food_facts',
    );
  if (parsed.data.status === 0 || !parsed.data.product)
    return { value: null, ...headers(response) };
  const record = normalizeProduct(parsed.data.product, language);
  return {
    value: record.displayName && record.providerRecordId ? record : null,
    ...headers(response),
  };
}

export class OpenFoodFactsProvider implements FoodDataProvider {
  readonly id = 'open_food_facts' as const;
  readonly capabilities = { exactBarcode: true, nameSearch: false, details: true, images: true };
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  status() {
    const config = getRuntimeConfig().foodData.openFoodFacts;
    return {
      provider: this.id,
      status: config.enabled ? ('available' as const) : ('disabled' as const),
      capabilities: this.capabilities,
      configured: config.enabled,
      retryAt: null,
      remaining: null,
    };
  }
  async lookupBarcode(canonicalGtin: string, language: string) {
    return this.getDetails(canonicalGtin.replace(/^0+(?=\d{8,})/u, ''), language);
  }
  async searchByName() {
    return { value: [], rateLimit: null, rateRemaining: null, retryAt: null };
  }
  async getDetails(recordId: string, language: string) {
    const config = getRuntimeConfig().foodData.openFoodFacts;
    if (!config.enabled)
      throw new FoodDataError('NOT_CONFIGURED', 'Open Food Facts is disabled.', this.id);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const url = `${config.baseUrl}/api/${config.apiVersion}/product/${encodeURIComponent(recordId)}.json?fields=${encodeURIComponent(fields)}`;
      return await read(
        await this.fetcher(url, {
          headers: {
            'User-Agent': config.userAgent,
            Accept: 'application/json',
            'Accept-Language': language,
          },
          signal: controller.signal,
        }),
        language,
      );
    } catch (error) {
      if (error instanceof FoodDataError) throw error;
      if (controller.signal.aborted)
        throw new FoodDataError('TIMEOUT', 'Open Food Facts timed out.', this.id);
      throw new FoodDataError('UNAVAILABLE', 'Open Food Facts could not be reached.', this.id);
    } finally {
      clearTimeout(timeout);
    }
  }
}
