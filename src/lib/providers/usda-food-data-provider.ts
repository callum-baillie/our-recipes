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

const searchNutrientSchema = z.object({
  nutrientId: z.number(),
  nutrientName: z.string(),
  unitName: z.string(),
  value: z.number().nullable().optional(),
});
const detailNutrientSchema = z.object({
  nutrient: z.object({ id: z.number(), name: z.string(), unitName: z.string() }),
  amount: z.number().nullable().optional(),
});
const foodSchema = z.object({
  fdcId: z.number(),
  description: z.string(),
  dataType: z.string(),
  brandOwner: z.string().optional(),
  brandName: z.string().optional(),
  gtinUpc: z.string().optional(),
  servingSize: z.number().optional(),
  servingSizeUnit: z.string().optional(),
  householdServingFullText: z.string().optional(),
  ingredients: z.string().optional(),
  foodCategory: z.union([z.string(), z.object({ description: z.string() })]).optional(),
  foodNutrients: z.array(z.union([searchNutrientSchema, detailNutrientSchema])).optional(),
});
const searchSchema = z.object({ foods: z.array(foodSchema), totalHits: z.number().optional() });

const nutrientIds: Record<number, { code: NutrientCode; unit: string }> = {
  1008: { code: 'energy_kcal', unit: 'kcal' },
  1062: { code: 'energy_kj', unit: 'kJ' },
  1003: { code: 'protein', unit: 'g' },
  1004: { code: 'total_fat', unit: 'g' },
  1005: { code: 'carbohydrate', unit: 'g' },
  1079: { code: 'fiber', unit: 'g' },
  2000: { code: 'total_sugars', unit: 'g' },
  1258: { code: 'saturated_fat', unit: 'g' },
  1253: { code: 'cholesterol', unit: 'mg' },
  1093: { code: 'sodium', unit: 'mg' },
  1092: { code: 'potassium', unit: 'mg' },
  1087: { code: 'calcium', unit: 'mg' },
  1089: { code: 'iron', unit: 'mg' },
  1090: { code: 'magnesium', unit: 'mg' },
  1091: { code: 'phosphorus', unit: 'mg' },
  1095: { code: 'zinc', unit: 'mg' },
  1162: { code: 'vitamin_c', unit: 'mg' },
  1114: { code: 'vitamin_d', unit: 'mcg' },
  1178: { code: 'vitamin_b12', unit: 'mcg' },
  1051: { code: 'water', unit: 'g' },
  1057: { code: 'caffeine', unit: 'mg' },
};

function nutrients(food: z.infer<typeof foodSchema>): NormalizedNutrient[] {
  return (food.foodNutrients ?? []).flatMap((item) => {
    const detail = 'nutrient' in item;
    const id = detail ? item.nutrient.id : item.nutrientId;
    const name = detail ? item.nutrient.name : item.nutrientName;
    const unit = detail ? item.nutrient.unitName : item.unitName;
    const mapping = nutrientIds[id];
    const amount = 'nutrient' in item ? item.amount : item.value;
    if (
      !mapping ||
      amount === null ||
      amount === undefined ||
      !Number.isFinite(amount) ||
      amount < 0
    )
      return [];
    return [
      {
        nutrientCode: mapping.code,
        amount,
        unit: mapping.unit,
        basis: 'per_100g' as const,
        originalId: String(id),
        originalName: name,
        originalUnit: unit,
      },
    ];
  });
}

function normalizeFood(food: z.infer<typeof foodSchema>): FoodRecord {
  let canonicalGtin: string | null = null;
  if (food.gtinUpc)
    try {
      canonicalGtin = normalizeGtin(food.gtinUpc).canonicalGtin;
    } catch {
      canonicalGtin = null;
    }
  const normalizedNutrients = nutrients(food);
  return {
    provider: 'usda_fdc',
    providerRecordId: String(food.fdcId),
    canonicalGtin,
    displayName: food.description.trim(),
    genericName: food.description.trim(),
    brand: (food.brandName ?? food.brandOwner ?? '').trim(),
    dataType: food.dataType,
    quantity: '',
    servingSize:
      food.householdServingFullText ??
      (food.servingSize ? `${food.servingSize} ${food.servingSizeUnit ?? ''}`.trim() : ''),
    servingWeightGrams:
      food.servingSizeUnit?.toLowerCase() === 'g' ? (food.servingSize ?? null) : null,
    categories:
      typeof food.foodCategory === 'string'
        ? [food.foodCategory]
        : food.foodCategory
          ? [food.foodCategory.description]
          : [],
    ingredientsText: food.ingredients ?? '',
    ingredientTags: [],
    allergens: [],
    traces: [],
    additives: [],
    labels: [],
    countries: [],
    language: 'en',
    nutrients: normalizedNutrients,
    nutrientBasis: normalizedNutrients.length ? 'per_100g' : null,
    nutriScore: '',
    novaGroup: null,
    images: [],
    completeness: Math.min(1, normalizedNutrients.length / 12),
    sourceUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
    citation: 'U.S. Department of Agriculture, FoodData Central',
    license: 'CC0 1.0',
    schemaVersion: 'usda-fdc-v1-normalized-v1',
    retrievedAt: new Date().toISOString(),
    providerMetadata: { dataType: food.dataType },
  };
}

function rate(response: Response) {
  const number = (name: string) => {
    const value = response.headers.get(name);
    return value === null ? null : Number(value);
  };
  const retry = response.headers.get('retry-after');
  return {
    rateLimit: number('x-ratelimit-limit'),
    rateRemaining: number('x-ratelimit-remaining'),
    retryAt: retry ? new Date(Date.now() + Number(retry) * 1000) : null,
  };
}

export class UsdaFoodDataProvider implements FoodDataProvider {
  readonly id = 'usda_fdc' as const;
  readonly capabilities = { exactBarcode: true, nameSearch: true, details: true, images: false };
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  status() {
    const config = getRuntimeConfig().foodData.usda;
    return {
      provider: this.id,
      status: config.enabled ? ('available' as const) : ('not_configured' as const),
      capabilities: this.capabilities,
      configured: config.enabled,
      retryAt: null,
      remaining: null,
    };
  }
  private async request(
    url: string,
    init: RequestInit,
    parser: (value: unknown) => FoodRecord | FoodRecord[] | null,
  ) {
    const config = getRuntimeConfig().foodData.usda;
    if (!config.enabled || !config.apiKey)
      throw new FoodDataError(
        'NOT_CONFIGURED',
        'USDA FoodData Central needs a server API key.',
        this.id,
      );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        ...init,
        headers: { ...init.headers, 'X-Api-Key': config.apiKey, Accept: 'application/json' },
        signal: controller.signal,
      });
      const quota = rate(response);
      if (response.status === 401 || response.status === 403)
        throw new FoodDataError('AUTH_FAILED', 'USDA rejected the configured API key.', this.id);
      if (response.status === 404)
        return { value: null, ...quota } as ProviderResponse<FoodRecord | null>;
      if (response.status === 429)
        throw new FoodDataError(
          'RATE_LIMITED',
          'USDA FoodData Central is temporarily rate limited.',
          this.id,
          quota.retryAt,
        );
      if (!response.ok)
        throw new FoodDataError(
          'UNAVAILABLE',
          'USDA FoodData Central is temporarily unavailable.',
          this.id,
        );
      return { value: parser(await response.json()), ...quota };
    } catch (error) {
      if (error instanceof FoodDataError) throw error;
      if (controller.signal.aborted)
        throw new FoodDataError('TIMEOUT', 'USDA FoodData Central timed out.', this.id);
      throw new FoodDataError(
        'UNAVAILABLE',
        'USDA FoodData Central could not be reached.',
        this.id,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  async searchByName(query: string, page: number, kind: 'any' | 'generic' | 'branded') {
    const config = getRuntimeConfig().foodData.usda;
    const dataType =
      kind === 'generic'
        ? ['Foundation', 'Survey (FNDDS)']
        : kind === 'branded'
          ? ['Branded']
          : undefined;
    const result = await this.request(
      `${config.baseUrl}/foods/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, pageNumber: page, pageSize: 20, dataType }),
      },
      (value) => {
        const parsed = searchSchema.safeParse(value);
        if (!parsed.success)
          throw new FoodDataError(
            'MALFORMED_RESPONSE',
            'USDA returned an invalid search response.',
            this.id,
          );
        return parsed.data.foods.map(normalizeFood);
      },
    );
    return result as ProviderResponse<FoodRecord[]>;
  }
  async lookupBarcode(canonicalGtin: string) {
    const exact = canonicalGtin.replace(/^0+(?=\d{8,})/u, '');
    const result = await this.searchByName(exact, 1, 'branded');
    return {
      ...result,
      value: result.value.find((record) => record.canonicalGtin === canonicalGtin) ?? null,
    };
  }
  async getDetails(recordId: string) {
    const config = getRuntimeConfig().foodData.usda;
    const result = await this.request(
      `${config.baseUrl}/food/${encodeURIComponent(recordId)}`,
      { method: 'GET' },
      (value) => {
        const parsed = foodSchema.safeParse(value);
        if (!parsed.success)
          throw new FoodDataError(
            'MALFORMED_RESPONSE',
            'USDA returned an invalid food response.',
            this.id,
          );
        return normalizeFood(parsed.data);
      },
    );
    return result as ProviderResponse<FoodRecord | null>;
  }
}
