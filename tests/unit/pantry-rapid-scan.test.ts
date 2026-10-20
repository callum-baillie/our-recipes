// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePantryRapidScan } from '@/components/use-pantry-rapid-scan';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('reviewed rapid Pantry intake', () => {
  it('queues repeated packages without adding stock and retains operation IDs across partial retry', async () => {
    let failed = false;
    const fetchMock = vi.fn<typeof fetch>(async (url, options) => {
      const body = JSON.parse(options!.body as string);
      if (String(url).includes('barcode-lookups'))
        return Response.json(
          body.barcode === 'unknown'
            ? {}
            : {
                localProduct: {
                  id: body.barcode,
                  displayName: body.barcode === 'a' ? 'Flour' : 'Rice',
                  brand: '',
                },
              },
        );
      if (body.productId === 'b' && !failed) {
        failed = true;
        throw new TypeError('Connection lost');
      }
      return Response.json({ batch: { id: 'saved' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const imported = vi.fn();
    const { result } = renderHook(() => usePantryRapidScan(imported));
    await act(async () => {
      await result.current.scan('a');
      await result.current.scan('a');
      await result.current.scan('b');
      await result.current.scan('unknown');
    });
    expect(
      result.current.entries.map((entry) => [entry.barcode, entry.count, entry.status]),
    ).toEqual([
      ['a', 2, 'ready'],
      ['b', 1, 'ready'],
      ['unknown', 1, 'unknown'],
    ]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/pantry/'))).toHaveLength(
      0,
    );
    const operationId = result.current.entries.find((entry) => entry.barcode === 'b')!.operationId;
    await act(async () => result.current.addAll('location'));
    expect(result.current.entries.map((entry) => entry.barcode)).toEqual(['b', 'unknown']);
    expect(result.current.entries[0]).toMatchObject({
      operationId,
      saveAttempted: true,
      error: expect.stringContaining('Outcome unknown; retry uses the same confirmation.'),
    });
    await act(async () => {
      result.current.quantity('b', 5);
      result.current.remove('b');
      await result.current.scan('b');
    });
    expect(result.current.entries[0]).toMatchObject({
      barcode: 'b',
      count: 1,
      operationId,
      saveAttempted: true,
    });
    expect(imported).toHaveBeenCalledWith(
      { id: 'a', displayName: 'Flour', brand: '' },
      { keepOpen: true },
    );
    await act(async () => result.current.addAll('location'));
    expect(result.current.entries.map((entry) => entry.barcode)).toEqual(['unknown']);
    const bCalls = fetchMock.mock.calls.filter(
      ([, options]) => JSON.parse(options!.body as string).productId === 'b',
    );
    expect(bCalls).toHaveLength(2);
    for (const [, options] of bCalls) {
      expect(new Headers(options?.headers).get('Idempotency-Key')).toBe(operationId);
      expect(JSON.parse(options!.body as string)).toMatchObject({
        quantityRemaining: 1,
        unit: 'each',
        expiryPrecision: 'unknown',
        bestBeforeDate: '',
        useByDate: '',
      });
    }
  });
  it('aborts read-only lookups when the picker is left', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async (_url, options) =>
          new Promise((_resolve, reject) => {
            signal = options!.signal as AbortSignal;
            signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            );
          }),
      ),
    );
    const { result, unmount } = renderHook(() => usePantryRapidScan());
    let lookup: Promise<void>;
    await act(async () => {
      lookup = result.current.scan('pending');
    });
    unmount();
    await lookup!;
    expect(signal?.aborted).toBe(true);
  });
});
