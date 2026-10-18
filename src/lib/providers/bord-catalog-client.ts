import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getRuntimeConfig } from '@/lib/config';
import { FoodDataError, normalizeGtin } from '@/lib/domain/food-data';
import {
  capabilitiesSchema,
  catalogMapSchema,
  catalogRecordSchema,
  catalogStoreSchema,
  resolveResultSchema,
  retailEvidenceSchema,
  sourceFoodSchema,
  sourceRefSchema,
} from '@/lib/domain/bord-catalog';

const metaSchema = z.object({
  catalog_generation: z.string().max(160).nullable(),
  source_refs: z.array(sourceRefSchema).max(1000),
  warnings: z
    .array(z.object({ code: z.string().max(160), message: z.string().max(2000) }))
    .max(100),
  next_cursor: z.string().max(2048).nullable(),
});
const MAX_BYTES = 4 * 1024 * 1024;

function segment(id: string) {
  if (!id || id === '.' || id === '..' || id.length > 160)
    throw new FoodDataError('INVALID_QUERY', 'Invalid catalog record identifier.');
  return encodeURIComponent(id);
}

/** Only fixed catalog routes are exposed. Source URLs never become fetch targets. */
export class BordCatalogClient {
  readonly fingerprint: string;
  private readonly base: URL;
  private readonly config;
  constructor(private readonly transport: typeof fetch = fetch) {
    const config = getRuntimeConfig().foodData;
    this.config = config.catalog;
    if (!this.config.baseUrl || !this.config.apiKey)
      throw new FoodDataError('NOT_CONFIGURED', 'The food catalog is not configured.');
    this.base = new URL(this.config.baseUrl.replace(/\/$/u, '') + '/');
    this.fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          this.base.href,
          this.config.apiKey,
          config.mode,
          config.allowRemoteFallback,
          'bord-normalizer-v1',
        ]),
      )
      .digest('hex');
  }
  private async request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    try {
      const response = await this.transport(new URL(path, this.base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'X-Api-Key': this.config.apiKey!,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
        redirect: 'error',
        cache: 'no-store',
      });
      if (Number(response.headers.get('content-length')) > MAX_BYTES) {
        await response.body?.cancel();
        throw new FoodDataError('MALFORMED_RESPONSE', 'The food catalog response is too large.');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        try {
          while (true) {
            const result = await reader.read();
            if (result.done) break;
            size += result.value.byteLength;
            if (size > MAX_BYTES) {
              await reader.cancel();
              throw new FoodDataError(
                'MALFORMED_RESPONSE',
                'The food catalog response is too large.',
              );
            }
            chunks.push(result.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new FoodDataError('MALFORMED_RESPONSE', 'The food catalog returned invalid JSON.');
      }
      if (!response.ok) {
        const error = z.object({ error: z.object({ code: z.string() }) }).safeParse(payload);
        const code = error.success ? error.data.error.code : '';
        if (response.status === 409 && code === 'REVISION_EXPIRED')
          throw new FoodDataError(
            'REVISION_EXPIRED',
            'This food has changed. Search and review it again before saving.',
          );
        if (code === 'RIGHTS_BLOCKED')
          throw new FoodDataError(
            'RIGHTS_BLOCKED',
            'Catalog access is restricted by source policy.',
          );
        if (['CATALOG_NOT_READY', 'PACK_NOT_READY'].includes(code))
          throw new FoodDataError(
            'INITIALIZING',
            'This catalog pack is still initializing. Try again later.',
          );
        if (['SOURCE_DISABLED', 'PACK_DISABLED'].includes(code))
          throw new FoodDataError('DISABLED', 'This catalog source is disabled.');
        if ([401, 403].includes(response.status))
          throw new FoodDataError(
            'AUTH_FAILED',
            'The food catalog could not authenticate this server.',
          );
        if (response.status === 404)
          throw new FoodDataError('NOT_FOUND', 'This catalog record is unavailable.');
        if (response.status === 429)
          throw new FoodDataError('RATE_LIMITED', 'The food catalog is busy. Try again shortly.');
        throw new FoodDataError(
          'UNAVAILABLE',
          'The food catalog is temporarily unavailable. Your saved records are still available.',
        );
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success)
        throw new FoodDataError(
          'MALFORMED_RESPONSE',
          'The food catalog returned an unsupported response.',
        );
      return parsed.data;
    } catch (error) {
      if (error instanceof FoodDataError) throw error;
      throw new FoodDataError(
        error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'TIMEOUT'
          : 'UNAVAILABLE',
        'The food catalog could not be reached. Your saved records are still available.',
      );
    }
  }
  private envelope<T>(path: string, schema: z.ZodType<T>, body?: unknown) {
    return this.request(
      path,
      z.object({ schema_version: z.literal('1.0.0'), data: schema, meta: metaSchema }),
      body,
    );
  }
  status() {
    return this.envelope('v1/system/status', z.object({ state: z.string().optional() }));
  }
  capabilities() {
    return this.envelope('v1/capabilities', capabilitiesSchema);
  }
  generation() {
    return this.envelope('v1/catalog/generations/current', z.record(z.string(), z.unknown()));
  }
  stores(params: URLSearchParams) {
    return this.envelope(`v1/stores?${params}`, z.array(catalogStoreSchema).max(100));
  }
  store(id: string) {
    return this.envelope(`v1/stores/${segment(id)}`, catalogStoreSchema);
  }
  maps(id: string) {
    return this.envelope(`v1/stores/${segment(id)}/maps`, z.array(catalogMapSchema).max(100));
  }
  products(query: string) {
    return this.envelope(
      `v1/products?${new URLSearchParams({ query, limit: '20' })}`,
      z.array(catalogRecordSchema).max(100),
    );
  }
  resolve(gtin: string) {
    if (!/^(?:[0-9]{8}|[0-9]{12,14})$/u.test(gtin))
      throw new FoodDataError('INVALID_BARCODE', 'Use a valid GTIN.');
    normalizeGtin(gtin);
    return this.envelope('v1/products/resolve', z.array(resolveResultSchema).max(100), {
      identifiers: [{ namespace: 'gtin', value: gtin }],
    });
  }
  sourceFood(source: 'usda_fdc' | 'open_food_facts', id: string, revision?: string) {
    return this.envelope(
      `v1/foods/${source}/${segment(id)}?${new URLSearchParams(revision ? { revision } : {})}`,
      sourceFoodSchema,
    );
  }
  retailEvidence(product: string, store?: string) {
    return this.envelope(
      `v1/products/${segment(product)}/retail-evidence?${new URLSearchParams(store ? { store_id: store } : {})}`,
      retailEvidenceSchema,
    );
  }
  // The native API preserves the USDA-compatible search surface and original source payload.
  usdaSearch(query: string, page: number) {
    return this.request(
      `fdc/v1/foods/search?${new URLSearchParams({ query, pageNumber: String(page), pageSize: '20' })}`,
      z.object({ foods: z.array(z.record(z.string(), z.unknown())).max(100) }),
    );
  }
}
