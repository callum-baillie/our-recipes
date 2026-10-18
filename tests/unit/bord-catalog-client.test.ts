import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import { normalizeGtin } from '@/lib/domain/food-data';
import { OpenFoodFactsProvider } from '@/lib/providers/open-food-facts-provider';
import { UsdaFoodDataProvider } from '@/lib/providers/usda-food-data-provider';

const envelope = (data: unknown) => ({
  schema_version: '1.0.0',
  data,
  meta: { catalog_generation: 'g_fixture', source_refs: [], warnings: [], next_cursor: null },
});
describe('bounded native catalog client', () => {
  beforeEach(() => {
    vi.stubEnv('BORD_FOOD_API_BASE_URL', 'http://catalog.example.test');
    vi.stubEnv('BORD_FOOD_API_KEY', 'test-key');
  });
  afterEach(() => vi.unstubAllEnvs());
  it('requires configured server credentials before any request', () => {
    vi.stubEnv('BORD_FOOD_API_KEY', '');
    expect(() => new BordCatalogClient()).toThrow(/not configured/u);
  });
  it.each([
    [409, 'REVISION_EXPIRED', 'REVISION_EXPIRED'],
    [503, 'CATALOG_NOT_READY', 'INITIALIZING'],
    [403, 'RIGHTS_BLOCKED', 'RIGHTS_BLOCKED'],
    [503, 'PACK_DISABLED', 'DISABLED'],
    [401, 'UNAUTHORIZED', 'AUTH_FAILED'],
    [503, 'CATALOG_UNAVAILABLE', 'UNAVAILABLE'],
  ])('maps %s / %s without returning upstream messages', async (status, code, expected) => {
    const client = new BordCatalogClient(async () =>
      Response.json({ error: { code, message: 'sensitive-debug-data' } }, { status }),
    );
    await expect(client.capabilities()).rejects.toMatchObject({ code: expected });
    await expect(client.capabilities()).rejects.not.toThrow(/sensitive-debug-data/u);
  });
  it('rejects unsupported envelopes, malformed records and oversized streamed responses', async () => {
    await expect(
      new BordCatalogClient(async () => Response.json({ schema_version: '9', data: [] })).stores(
        new URLSearchParams(),
      ),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(
      new BordCatalogClient(async () =>
        Response.json(envelope([{ id: 'missing-revision' }])),
      ).stores(new URLSearchParams()),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
    await expect(
      new BordCatalogClient(
        async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)),
      ).capabilities(),
    ).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });
  it('enforces deadline and redirect refusal and never embeds keys in URLs', async () => {
    const transport: typeof fetch = async (url, init) => {
      expect(String(url)).toBe('http://catalog.example.test/v1/system/status');
      expect(init?.redirect).toBe('error');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get('x-api-key')).toBe('test-key');
      throw new DOMException('timed out', 'TimeoutError');
    };
    await expect(new BordCatalogClient(transport).status()).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });
  it('uses strict native GTIN validation before sending typed identifiers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(envelope([])));
    const client = new BordCatalogClient(fetcher);
    for (const value of [' 012345678905', '０１２３４５６７８９０５', '012345678904', '123']) {
      expect(() => client.resolve(value)).toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
    for (const value of ['96385074', '012345678905', '4006381333931', '00012345678905']) {
      expect(normalizeGtin(value).canonicalGtin).toHaveLength(14);
      await client.resolve(value);
    }
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toMatchObject({
      identifiers: [{ namespace: 'gtin', value: '96385074' }],
    });
  });
  it('catalog-only denies direct USDA/OFF calls even when invoked outside the routing service', async () => {
    vi.stubEnv('FOOD_DATA_MODE', 'catalog_only');
    vi.stubEnv('FOOD_DATA_ALLOW_REMOTE_FALLBACK', 'true');
    vi.stubEnv('USDA_FDC_API_KEY', 'test-key');
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({}));
    await expect(new UsdaFoodDataProvider(fetcher).getDetails('123')).rejects.toMatchObject({
      code: 'DISABLED',
    });
    await expect(
      new OpenFoodFactsProvider(fetcher).getDetails('4006381333931', 'en'),
    ).rejects.toMatchObject({ code: 'DISABLED' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
