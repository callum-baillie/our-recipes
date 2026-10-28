import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProductImageStateForTests,
  getProductImage,
} from '@/lib/services/product-image-service';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
const jpeg = (headers: Record<string, string> = {}) =>
  new Response(JPEG, { headers: { 'Content-Type': 'image/jpeg', ETag: '"abc"', ...headers } });
const GTINS = ['012345678905', '036000291452', '4006381333931', '5449000000996', '96385074'];

describe('product photo proxy service', () => {
  let fetcher: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubEnv('BORD_FOOD_API_BASE_URL', 'http://food.example.test');
    vi.stubEnv('BORD_FOOD_API_KEY', 'server-key');
    clearProductImageStateForTests();
    fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fetches with the server key only and relays the licence headers', async () => {
    fetcher.mockResolvedValue(
      jpeg({ 'X-Image-Attribution': 'Open Food Facts', Link: '<https://license>; rel="license"' }),
    );
    const result = await getProductImage('012345678905');
    expect(result).toMatchObject({ kind: 'image', etag: '"abc"', attribution: 'Open Food Facts' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe('http://food.example.test/v1/product-images/012345678905');
    expect(new Headers(init.headers).get('x-api-key')).toBe('server-key');
    expect(String(url)).not.toContain('server-key');
  });

  it('serves repeats from memory and shares one upstream request between concurrent callers', async () => {
    fetcher.mockImplementation(async () => jpeg());
    const [a, b] = await Promise.all([
      getProductImage('012345678905'),
      getProductImage('012345678905'),
    ]);
    expect(a.kind).toBe('image');
    expect(b).toBe(a);
    await getProductImage('012345678905');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('remembers a missing photo without asking again', async () => {
    fetcher.mockImplementation(async () => Response.json({ error: {} }, { status: 404 }));
    expect(await getProductImage('012345678905')).toEqual({ kind: 'missing' });
    expect(await getProductImage('012345678905')).toEqual({ kind: 'missing' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refuses anything that is not a bounded JPEG', async () => {
    fetcher.mockResolvedValueOnce(
      new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await getProductImage('012345678905')).toEqual({ kind: 'missing' });
    fetcher.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/jpeg' } }),
    );
    expect(await getProductImage('036000291452')).toEqual({ kind: 'missing' });
    fetcher.mockResolvedValueOnce(
      new Response(JPEG, {
        headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(5 * 1024 * 1024) },
      }),
    );
    expect(await getProductImage('4006381333931')).toEqual({ kind: 'missing' });
  });

  it('waits once for a short Retry-After, then reports a longer one', async () => {
    fetcher
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(jpeg());
    expect((await getProductImage('012345678905')).kind).toBe('image');
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValue(new Response('', { status: 503, headers: { 'Retry-After': '120' } }));
    expect(await getProductImage('036000291452')).toEqual({ kind: 'unavailable', retryAfter: 120 });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('does not cache temporary failures, bad keys or rights blocks as "no photo"', async () => {
    fetcher.mockResolvedValue(new Response('', { status: 401 }));
    expect((await getProductImage('012345678905')).kind).toBe('unavailable');
    fetcher.mockResolvedValue(new Response('', { status: 403 }));
    expect((await getProductImage('036000291452')).kind).toBe('blocked');
    fetcher.mockRejectedValue(new Error('connect refused'));
    expect((await getProductImage('4006381333931')).kind).toBe('unavailable');
    fetcher.mockImplementation(async () => jpeg());
    expect((await getProductImage('012345678905')).kind).toBe('image');
  });

  it('queues a page of photos instead of overwhelming the API', async () => {
    let running = 0;
    let peak = 0;
    fetcher.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 20));
      running--;
      return jpeg();
    });
    const results = await Promise.all(GTINS.map((gtin) => getProductImage(gtin)));
    expect(results.every((result) => result.kind === 'image')).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('rejects an invalid barcode and treats a missing configuration as no photo', async () => {
    await expect(getProductImage('012345678906')).rejects.toMatchObject({
      code: 'INVALID_BARCODE',
    });
    vi.stubEnv('BORD_FOOD_API_KEY', '');
    expect(await getProductImage('012345678905')).toEqual({ kind: 'missing' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
