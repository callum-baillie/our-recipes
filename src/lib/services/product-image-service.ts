import 'server-only';

import { getRuntimeConfig } from '@/lib/config';
import { normalizeGtin } from '@/lib/domain/food-data';
import { createLogger } from '@/lib/logger';

const log = createLogger('product-images');
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_UPSTREAM = 3;
const MAX_WAIT_SECONDS = 8;
const MEMORY_TTL_MS = 10 * 60 * 1000;
const MISSING_TTL_MS = 60 * 60 * 1000;
const MEMORY_ENTRIES = 200;

export type ProductImage =
  | {
      kind: 'image';
      body: Uint8Array;
      etag: string;
      attribution: string | null;
      link: string | null;
    }
  | { kind: 'missing' }
  | { kind: 'blocked' }
  | { kind: 'unavailable'; retryAfter: number };

type Cached = { value: ProductImage; expires: number };
const memory = new Map<string, Cached>();
const inflight = new Map<string, Promise<ProductImage>>();
const waiting: Array<() => void> = [];
let active = 0;

async function slot<T>(work: () => Promise<T>): Promise<T> {
  // The API fails concurrent cold acquisitions quickly, so a page of products must queue here.
  if (active >= MAX_UPSTREAM) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await work();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

function retryAfterSeconds(value: string | null) {
  const seconds = value && /^\d+$/u.test(value) ? Number(value) : 5;
  return Math.min(Math.max(seconds, 1), 3_600);
}

function remember(key: string, value: ProductImage, ttl: number) {
  memory.delete(key);
  memory.set(key, { value, expires: Date.now() + ttl });
  while (memory.size > MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string);
}

async function fetchOnce(gtin: string, signal: AbortSignal): Promise<ProductImage> {
  const { baseUrl, apiKey } = getRuntimeConfig().foodData.catalog;
  if (!baseUrl || !apiKey) return { kind: 'missing' };
  const url = new URL(`v1/product-images/${gtin}`, baseUrl.replace(/\/$/u, '') + '/');
  const response = await fetch(url, {
    headers: { 'X-Api-Key': apiKey, Accept: 'image/jpeg' },
    signal,
    redirect: 'error',
    cache: 'no-store',
  });
  if (response.status === 404) {
    await response.body?.cancel();
    return { kind: 'missing' };
  }
  if (response.status === 403) {
    await response.body?.cancel();
    return { kind: 'blocked' };
  }
  if (response.status === 401 || response.status === 422) {
    // A bad server key must stay visible in logs and must not be cached as "no photo".
    await response.body?.cancel();
    log.warn('product image request rejected', { status: response.status });
    return { kind: 'unavailable', retryAfter: 60 };
  }
  if (!response.ok) {
    await response.body?.cancel();
    return {
      kind: 'unavailable',
      retryAfter: retryAfterSeconds(response.headers.get('retry-after')),
    };
  }
  const type = response.headers.get('content-type')?.split(';')[0]?.trim();
  const length = Number(response.headers.get('content-length') ?? '0');
  if (type !== 'image/jpeg' || length > MAX_BYTES) {
    await response.body?.cancel();
    log.warn('product image response refused', { contentType: type, length });
    return { kind: 'missing' };
  }
  const body = new Uint8Array(await response.arrayBuffer());
  // Only a bounded JPEG is ever relayed to the browser.
  if (body.length > MAX_BYTES || body[0] !== 0xff || body[1] !== 0xd8 || body[2] !== 0xff) {
    log.warn('product image bytes refused', { bytes: body.length });
    return { kind: 'missing' };
  }
  const etag = response.headers.get('etag');
  return {
    kind: 'image',
    body,
    etag: etag ?? `"${body.length}-${body[body.length - 1]}"`,
    attribution: response.headers.get('x-image-attribution'),
    link: response.headers.get('link'),
  };
}

async function acquire(gtin: string): Promise<ProductImage> {
  const timeoutMs = getRuntimeConfig().foodData.catalog.imageTimeoutMs;
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await slot(() => fetchOnce(gtin, AbortSignal.timeout(timeoutMs)));
      // Temporary refusals include "another acquisition is running": wait once, as told.
      if (
        result.kind === 'unavailable' &&
        attempt === 0 &&
        result.retryAfter <= MAX_WAIT_SECONDS &&
        Date.now() - started + result.retryAfter * 1000 < timeoutMs
      ) {
        await new Promise((resolve) => setTimeout(resolve, result.retryAfter * 1000));
        continue;
      }
      return result;
    } catch (error) {
      log.warn('product image upstream failed', {
        error: error instanceof Error ? error.name : 'unknown',
      });
      return { kind: 'unavailable', retryAfter: 10 };
    }
  }
}

/** Photos need the same server-held food API connection as the catalog. */
export function productPhotosConfigured() {
  const { baseUrl, apiKey } = getRuntimeConfig().foodData.catalog;
  return Boolean(baseUrl && apiKey);
}

/** Resolve a barcode-matched product photo through the server-held food API key. */
export async function getProductImage(rawGtin: string): Promise<ProductImage> {
  const { value } = normalizeGtin(rawGtin);
  const key = value.padStart(14, '0');
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const running = inflight.get(key);
  if (running) return running;
  const work = acquire(value)
    .then((result) => {
      if (result.kind === 'image') remember(key, result, MEMORY_TTL_MS);
      else if (result.kind === 'missing') remember(key, result, MISSING_TTL_MS);
      return result;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

export function clearProductImageStateForTests() {
  memory.clear();
  inflight.clear();
  waiting.length = 0;
  active = 0;
}
