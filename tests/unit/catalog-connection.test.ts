import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';

const envelope = {
  schema_version: '1.0.0',
  data: { state: 'ready' },
  meta: { catalog_generation: 'test', source_refs: [], warnings: [], next_cursor: null },
};
beforeEach(() => {
  vi.stubEnv('BORD_FOOD_API_BASE_URL', 'http://catalog.test');
  vi.stubEnv('BORD_FOOD_API_KEY', 'synthetic-key');
  vi.stubEnv('BORD_FOOD_API_TIMEOUT_MS', '1000');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
it('recovers from proxy HTML and a dropped connection with one identical read retry', async () => {
  for (const failure of [
    new Response('<h1>Restarting</h1>', { status: 503 }),
    new TypeError('connection reset'),
  ]) {
    const transport = vi.fn<typeof fetch>();
    if (failure instanceof Error) transport.mockRejectedValueOnce(failure);
    else transport.mockResolvedValueOnce(failure);
    transport.mockResolvedValueOnce(Response.json(envelope));
    expect((await new BordCatalogClient(transport).status()).data.state).toBe('ready');
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
    expect(transport.mock.calls[1]![1]).toMatchObject({ redirect: 'error', cache: 'no-store' });
  }
});
it('bounds retries and never retries authentication, rate limits, changed revisions, or malformed success', async () => {
  for (const [status, body, code] of [
    [401, 'Unauthorized', 'AUTH_FAILED'],
    [429, 'Busy', 'RATE_LIMITED'],
    [409, JSON.stringify({ error: { code: 'REVISION_EXPIRED' } }), 'REVISION_EXPIRED'],
    [200, '{}', 'MALFORMED_RESPONSE'],
  ] as const) {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body, { status, headers: { 'retry-after': '30' } }));
    await expect(new BordCatalogClient(transport).status()).rejects.toMatchObject({ code });
    expect(transport).toHaveBeenCalledTimes(1);
  }
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response('Unavailable', { status: 502 }));
  await expect(new BordCatalogClient(transport).status()).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(transport).toHaveBeenCalledTimes(2);
});
it('keeps the configured deadline across retry and exposes the rate-limit retry time', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
      }),
  );
  await expect(new BordCatalogClient(transport).status()).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
  expect(transport).toHaveBeenCalledTimes(1);
  const limited = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '30' } }));
  await expect(new BordCatalogClient(limited).status()).rejects.toMatchObject({
    code: 'RATE_LIMITED',
    retryAt: expect.any(Date),
  });
});
