import { afterEach, describe, expect, it, vi } from 'vitest';

import { FoodDataError } from '@/lib/domain/food-data';
import { OpenFoodFactsProvider } from '@/lib/providers/open-food-facts-provider';
import { UsdaFoodDataProvider } from '@/lib/providers/usda-food-data-provider';

describe('read-only food-data provider adapters', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('normalizes a bounded Open Food Facts response without returning the raw payload', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('user-agent')).toMatch(
        /^Bord\/\d+\.\d+\.\d+(?:-[a-z0-9.]+)?\s+\(/u,
      );
      return new Response(
        JSON.stringify({
          status: 1,
          product: {
            code: '4006381333931',
            product_name: 'Test oats',
            brands: 'Bòrd Test',
            quantity: '500 g',
            nutriments: { 'energy-kcal_100g': 370, proteins_100g: 12, sodium_100g: 0.02 },
            nutrition_data_per: '100g',
            allergens_tags: ['en:gluten'],
            image_front_small_url: 'https://images.openfoodfacts.org/images/products/test.200.jpg',
            completeness: 0.8,
            unexpected_secret: 'not normalized',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const result = await new OpenFoodFactsProvider(fetcher as typeof fetch).lookupBarcode(
      '04006381333931',
      'en',
    );
    expect(result.value).toMatchObject({
      displayName: 'Test oats',
      canonicalGtin: '04006381333931',
      allergens: ['gluten'],
    });
    expect(result.value?.nutrients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nutrientCode: 'energy_kcal', amount: 370, unit: 'kcal' }),
        expect.objectContaining({ nutrientCode: 'sodium', amount: 20, unit: 'mg' }),
      ]),
    );
    expect(result.value?.providerMetadata).not.toHaveProperty('unexpected_secret');
  });

  it('keeps USDA disabled without a server key and sends configured keys only as headers', async () => {
    vi.stubEnv('USDA_FDC_API_KEY', '');
    await expect(
      new UsdaFoodDataProvider().searchByName('oats', 1, 'generic'),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });

    vi.stubEnv('USDA_FDC_API_KEY', 'test-server-key');
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).not.toContain('test-server-key');
      expect(new Headers(init?.headers).get('x-api-key')).toBe('test-server-key');
      return new Response(
        JSON.stringify({
          foods: [
            {
              fdcId: 123,
              description: 'Rolled oats',
              dataType: 'Foundation',
              foodNutrients: [
                { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 13.2 },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'x-ratelimit-limit': '1000', 'x-ratelimit-remaining': '998' } },
      );
    });
    const result = await new UsdaFoodDataProvider(fetcher as typeof fetch).searchByName(
      'rolled oats',
      1,
      'generic',
    );
    expect(result.rateRemaining).toBe(998);
    expect(result.value[0]).toMatchObject({
      displayName: 'Rolled oats',
      dataType: 'Foundation',
      images: [],
    });
  });

  it('rejects an OFF barcode response for a different product', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json({
        status: 1,
        product: { code: '4006381333931', product_name: 'Different product' },
      });
    await expect(
      new OpenFoodFactsProvider(fetcher).lookupBarcode('00036000291452', 'en'),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it.each(['ALDI', 'Great Value', 'Kirkland Signature', 'National brand'])(
    'accepts an exact branded UPC for %s without a brand allowlist',
    async (brand) => {
      vi.stubEnv('USDA_FDC_API_KEY', 'synthetic-key');
      const fetcher: typeof fetch = async (_url, init) => {
        expect(JSON.parse(String(init?.body)).query).toBe(
          '"036000291452" OR "0036000291452" OR "00036000291452"',
        );
        return Response.json({
          foods: [
            {
              fdcId: 456,
              description: 'Synthetic oats',
              dataType: 'Branded',
              brandOwner: brand,
              gtinUpc: '036000291452',
              foodNutrients: [],
            },
          ],
        });
      };
      const result = await new UsdaFoodDataProvider(fetcher).lookupBarcode('00036000291452');
      expect(result.value).toMatchObject({ brand, canonicalGtin: '00036000291452' });
    },
  );

  it('uses the local USDA mirror numeric index without hosted search syntax', async () => {
    vi.stubEnv('USDA_FDC_API_KEY', 'synthetic-key');
    vi.stubEnv('USDA_FDC_BASE_URL', 'http://catalog.example.test/fdc/v1');
    const fetcher: typeof fetch = async (_url, init) => {
      expect(JSON.parse(String(init?.body)).query).toBe('00041498926526');
      return Response.json({
        foods: [
          {
            fdcId: 123,
            description: 'Synthetic own-label food',
            dataType: 'Branded',
            gtinUpc: '041498926526',
            foodNutrients: [],
          },
        ],
      });
    };
    expect(
      (await new UsdaFoodDataProvider(fetcher).lookupBarcode('00041498926526')).value,
    ).toMatchObject({ canonicalGtin: '00041498926526' });
  });

  it('surfaces provider rate limits as stable errors and honours retry-after metadata', async () => {
    vi.stubEnv('USDA_FDC_API_KEY', 'test-server-key');
    const fetcher: typeof fetch = async () =>
      new Response('{}', { status: 429, headers: { 'retry-after': '30' } });
    const provider = new UsdaFoodDataProvider(fetcher);
    const error = await provider
      .searchByName('oats', 1, 'any')
      .catch((value) => value as FoodDataError);
    expect(error).toMatchObject({ code: 'RATE_LIMITED', provider: 'usda_fdc' });
    expect(error.retryAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
