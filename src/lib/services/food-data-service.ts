import 'server-only';

import { and, asc, eq, lt } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { getRuntimeConfig } from '@/lib/config';
import { ensureDatabase, getDatabase } from '@/lib/db/client';
import {
  foodProviderCache,
  foodProviderRateLimits,
  pantryProductIdentifiers,
  pantryProducts,
} from '@/lib/db/schema';
import {
  FoodDataError,
  normalizeGtin,
  type FoodRecord,
  type FoodResultGroup,
  type ProviderStatus,
} from '@/lib/domain/food-data';
import { OpenFoodFactsProvider } from '@/lib/providers/open-food-facts-provider';
import type { FoodDataProvider, ProviderResponse } from '@/lib/providers/food-data-provider';
import { UsdaFoodDataProvider } from '@/lib/providers/usda-food-data-provider';

type Operation = 'barcode' | 'search' | 'details';
type RemoteProviderId = 'open_food_facts' | 'usda_fdc';
type CachedValue = FoodRecord | FoodRecord[] | null;

const providers: Record<RemoteProviderId, FoodDataProvider> = {
  open_food_facts: new OpenFoodFactsProvider(),
  usda_fdc: new UsdaFoodDataProvider(),
};

const inflight = new Map<string, Promise<ProviderResponse<CachedValue>>>();

type FoodDataEvent = {
  provider: RemoteProviderId;
  operation: Operation;
  status: 'cache_hit' | 'success' | 'error' | 'stale';
  durationMs: number;
  resultCount: number;
  errorCode?: string;
};

let observer = (event: FoodDataEvent) => {
  if (process.env.NODE_ENV === 'production')
    console.info(JSON.stringify({ event: 'food_data_provider', ...event }));
};

function resultCount(value: CachedValue) {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cacheId(provider: RemoteProviderId, operation: Operation, key: string) {
  return digest(`${provider}\0${operation}\0${key}`);
}

function cacheDurations(operation: Operation, kind: 'success' | 'not_found' | 'transient_failure') {
  const config = getRuntimeConfig().foodData.cache;
  const ttl =
    kind === 'not_found'
      ? config.negativeTtlSeconds
      : kind === 'transient_failure'
        ? config.transientTtlSeconds
        : operation === 'search'
          ? config.searchTtlSeconds
          : config.exactTtlSeconds;
  const stale = operation === 'search' ? config.searchStaleSeconds : config.exactStaleSeconds;
  return { ttl, stale };
}

function readCache(provider: RemoteProviderId, operation: Operation, key: string) {
  ensureDatabase();
  const row = getDatabase()
    .select()
    .from(foodProviderCache)
    .where(eq(foodProviderCache.id, cacheId(provider, operation, key)))
    .get();
  if (!row) return null;
  try {
    return {
      row,
      value: JSON.parse(row.payload) as CachedValue,
      fresh: row.expiresAt.getTime() > Date.now(),
      usableStale: row.staleUntil.getTime() > Date.now(),
    };
  } catch {
    getDatabase().delete(foodProviderCache).where(eq(foodProviderCache.id, row.id)).run();
    return null;
  }
}

function writeCache(
  provider: RemoteProviderId,
  operation: Operation,
  key: string,
  value: CachedValue,
  kind: 'success' | 'not_found' | 'transient_failure',
  retryAt: Date | null = null,
) {
  ensureDatabase();
  const now = new Date();
  const durations = cacheDurations(operation, kind);
  const values = {
    id: cacheId(provider, operation, key),
    provider,
    operation,
    cacheKey: digest(key),
    resultKind: kind,
    payload: JSON.stringify(value),
    schemaVersion: 'food-data-cache-v1',
    fetchedAt: now,
    expiresAt: new Date(now.getTime() + durations.ttl * 1000),
    staleUntil: new Date(now.getTime() + (durations.ttl + durations.stale) * 1000),
    retryAt,
  } satisfies typeof foodProviderCache.$inferInsert;
  getDatabase()
    .insert(foodProviderCache)
    .values(values)
    .onConflictDoUpdate({ target: foodProviderCache.id, set: values })
    .run();
  cleanupCache();
}

function cleanupCache() {
  const database = getDatabase();
  database.delete(foodProviderCache).where(lt(foodProviderCache.staleUntil, new Date())).run();
  const cap = getRuntimeConfig().foodData.cache.rowCap;
  const rows = database
    .select({ id: foodProviderCache.id })
    .from(foodProviderCache)
    .orderBy(asc(foodProviderCache.fetchedAt))
    .all();
  for (const row of rows.slice(0, Math.max(0, rows.length - cap)))
    database.delete(foodProviderCache).where(eq(foodProviderCache.id, row.id)).run();
}

function rateConfig(provider: RemoteProviderId) {
  const config = getRuntimeConfig().foodData;
  return provider === 'open_food_facts'
    ? { limit: config.openFoodFacts.requestsPerMinute, windowMs: 60_000 }
    : { limit: config.usda.requestsPerHour, windowMs: 3_600_000 };
}

function consumeBudget(provider: RemoteProviderId) {
  ensureDatabase();
  const database = getDatabase();
  const operation = 'details' as const;
  const now = new Date();
  const config = rateConfig(provider);
  const row = database
    .select()
    .from(foodProviderRateLimits)
    .where(
      and(
        eq(foodProviderRateLimits.provider, provider),
        eq(foodProviderRateLimits.operation, operation),
      ),
    )
    .get();
  if (row?.retryAt && row.retryAt.getTime() > now.getTime())
    throw new FoodDataError('RATE_LIMITED', `${provider} is cooling down.`, provider, row.retryAt);
  const reset = !row || now.getTime() - row.windowStartedAt.getTime() >= config.windowMs;
  const count = reset ? 0 : row.requestCount;
  if (count >= config.limit) {
    const retryAt = new Date((reset ? now : row!.windowStartedAt).getTime() + config.windowMs);
    throw new FoodDataError(
      'RATE_LIMITED',
      `${provider} reached Bòrd's local request budget.`,
      provider,
      retryAt,
    );
  }
  const values = {
    provider,
    operation,
    windowStartedAt: reset ? now : row!.windowStartedAt,
    requestCount: count + 1,
    upstreamLimit: row?.upstreamLimit ?? null,
    upstreamRemaining: row?.upstreamRemaining ?? null,
    retryAt: null,
    updatedAt: now,
  } satisfies typeof foodProviderRateLimits.$inferInsert;
  database
    .insert(foodProviderRateLimits)
    .values(values)
    .onConflictDoUpdate({
      target: [foodProviderRateLimits.provider, foodProviderRateLimits.operation],
      set: values,
    })
    .run();
}

function updateQuota(provider: RemoteProviderId, response: ProviderResponse<CachedValue>) {
  if (response.rateLimit === null && response.rateRemaining === null && response.retryAt === null)
    return;
  const database = getDatabase();
  const operation = 'details' as const;
  const now = new Date();
  const config = rateConfig(provider);
  const current = database
    .select()
    .from(foodProviderRateLimits)
    .where(
      and(
        eq(foodProviderRateLimits.provider, provider),
        eq(foodProviderRateLimits.operation, operation),
      ),
    )
    .get();
  const values = {
    provider,
    operation,
    windowStartedAt: current?.windowStartedAt ?? now,
    requestCount: current?.requestCount ?? 0,
    upstreamLimit: response.rateLimit,
    upstreamRemaining: response.rateRemaining,
    retryAt: response.retryAt,
    updatedAt: now,
  } satisfies typeof foodProviderRateLimits.$inferInsert;
  database
    .insert(foodProviderRateLimits)
    .values(values)
    .onConflictDoUpdate({
      target: [foodProviderRateLimits.provider, foodProviderRateLimits.operation],
      set: values,
    })
    .run();
  void config;
}

async function providerCall<T extends CachedValue>(
  providerId: RemoteProviderId,
  operation: Operation,
  key: string,
  call: () => Promise<ProviderResponse<T>>,
): Promise<{ value: T; hit: boolean; stale: boolean }> {
  const cached = readCache(providerId, operation, key);
  if (cached?.fresh) {
    if (cached.row.resultKind === 'transient_failure')
      throw new FoodDataError(
        'UNAVAILABLE',
        `${providerId} is temporarily unavailable.`,
        providerId,
        cached.row.retryAt,
      );
    observer({
      provider: providerId,
      operation,
      status: 'cache_hit',
      durationMs: 0,
      resultCount: resultCount(cached.value),
    });
    return { value: cached.value as T, hit: true, stale: false };
  }
  const inflightKey = `${providerId}:${operation}:${digest(key)}`;
  let promise = inflight.get(inflightKey) as Promise<ProviderResponse<T>> | undefined;
  if (!promise) {
    promise = (async () => {
      const startedAt = Date.now();
      consumeBudget(providerId);
      try {
        let response: ProviderResponse<T>;
        try {
          response = await call();
        } catch (error) {
          if (!(error instanceof FoodDataError) || !['TIMEOUT', 'UNAVAILABLE'].includes(error.code))
            throw error;
          const delay = process.env.NODE_ENV === 'test' ? 0 : 250 + Math.floor(Math.random() * 500);
          await new Promise((resolve) => setTimeout(resolve, delay));
          consumeBudget(providerId);
          response = await call();
        }
        updateQuota(providerId, response as ProviderResponse<CachedValue>);
        writeCache(
          providerId,
          operation,
          key,
          response.value,
          response.value === null || (Array.isArray(response.value) && !response.value.length)
            ? 'not_found'
            : 'success',
          response.retryAt,
        );
        observer({
          provider: providerId,
          operation,
          status: 'success',
          durationMs: Date.now() - startedAt,
          resultCount: resultCount(response.value),
        });
        return response;
      } catch (error) {
        observer({
          provider: providerId,
          operation,
          status: 'error',
          durationMs: Date.now() - startedAt,
          resultCount: 0,
          errorCode: error instanceof FoodDataError ? error.code : 'UNKNOWN',
        });
        throw error;
      } finally {
        inflight.delete(inflightKey);
      }
    })();
    inflight.set(inflightKey, promise as Promise<ProviderResponse<CachedValue>>);
  }
  try {
    const response = await promise;
    return { value: response.value, hit: false, stale: false };
  } catch (error) {
    if (cached?.usableStale && cached.row.resultKind === 'success') {
      observer({
        provider: providerId,
        operation,
        status: 'stale',
        durationMs: 0,
        resultCount: resultCount(cached.value),
      });
      return { value: cached.value as T, hit: true, stale: true };
    }
    if (error instanceof FoodDataError && ['TIMEOUT', 'UNAVAILABLE'].includes(error.code))
      writeCache(providerId, operation, key, null, 'transient_failure');
    throw error;
  }
}

function localProductForGtin(canonicalGtin: string) {
  ensureDatabase();
  const database = getDatabase();
  const identifiers = database
    .select()
    .from(pantryProductIdentifiers)
    .where(eq(pantryProductIdentifiers.verified, true))
    .all();
  const match = identifiers.find((item) => {
    if (item.normalizedValue === canonicalGtin) return true;
    try {
      return normalizeGtin(item.value).canonicalGtin === canonicalGtin;
    } catch {
      return false;
    }
  });
  return match
    ? (database.select().from(pantryProducts).where(eq(pantryProducts.id, match.productId)).get() ??
        null)
    : null;
}

function errorStatus(provider: FoodDataProvider, error: unknown): ProviderStatus {
  const status = provider.status();
  if (!(error instanceof FoodDataError)) return { ...status, status: 'temporarily_unavailable' };
  const mapped =
    error.code === 'NOT_CONFIGURED'
      ? 'not_configured'
      : error.code === 'AUTH_FAILED'
        ? 'authentication_failed'
        : error.code === 'RATE_LIMITED'
          ? 'rate_limited'
          : error.code === 'MALFORMED_RESPONSE' || error.code === 'NORMALIZATION_FAILED'
            ? 'invalid_response'
            : 'temporarily_unavailable';
  return { ...status, status: mapped, retryAt: error.retryAt?.toISOString() ?? null };
}

export function listFoodProviderStatuses(): ProviderStatus[] {
  ensureDatabase();
  const database = getDatabase();
  return Object.values(providers).map((provider) => {
    const status = provider.status();
    const quota = database
      .select()
      .from(foodProviderRateLimits)
      .where(
        and(
          eq(foodProviderRateLimits.provider, provider.id),
          eq(foodProviderRateLimits.operation, 'details'),
        ),
      )
      .get();
    return {
      ...status,
      retryAt: quota?.retryAt?.toISOString() ?? null,
      remaining: quota?.upstreamRemaining ?? null,
    };
  });
}

export async function lookupFoodByBarcode(
  canonicalGtin: string,
  language: string,
  compareUsda = false,
): Promise<FoodResultGroup & { localProduct: ReturnType<typeof localProductForGtin> }> {
  const localProduct = localProductForGtin(canonicalGtin);
  if (localProduct)
    return {
      preferred: null,
      alternatives: [],
      providerStatuses: listFoodProviderStatuses(),
      cache: { hit: true, stale: false },
      localProduct,
    };
  const statuses: ProviderStatus[] = [];
  const alternatives: FoodRecord[] = [];
  let preferred: FoodRecord | null = null;
  let hit = false;
  let stale = false;
  const off = providers.open_food_facts;
  try {
    const result = await providerCall(off.id, 'barcode', canonicalGtin, () =>
      off.lookupBarcode(canonicalGtin, language),
    );
    preferred = result.value;
    hit ||= result.hit;
    stale ||= result.stale;
    statuses.push(off.status());
  } catch (error) {
    statuses.push(errorStatus(off, error));
  }
  const shouldUseUsda = compareUsda || !preferred;
  if (shouldUseUsda) {
    const usda = providers.usda_fdc;
    try {
      const result = await providerCall(usda.id, 'barcode', canonicalGtin, () =>
        usda.lookupBarcode(canonicalGtin, language),
      );
      if (result.value) {
        if (preferred) alternatives.push(result.value);
        else preferred = result.value;
      }
      hit ||= result.hit;
      stale ||= result.stale;
      statuses.push(usda.status());
    } catch (error) {
      statuses.push(errorStatus(usda, error));
    }
  }
  return {
    preferred,
    alternatives,
    providerStatuses: statuses,
    cache: { hit, stale },
    localProduct,
  };
}

export async function searchFoodData(
  query: string,
  page: number,
  kind: 'any' | 'generic' | 'branded',
) {
  ensureDatabase();
  const normalized = query.trim().toLocaleLowerCase();
  const localProducts = getDatabase()
    .select()
    .from(pantryProducts)
    .all()
    .filter((product) =>
      `${product.displayName} ${product.brand} ${product.variant}`
        .toLocaleLowerCase()
        .includes(normalized),
    )
    .slice(0, 20);
  const provider = providers.usda_fdc;
  try {
    const result = await providerCall(provider.id, 'search', `${normalized}:${page}:${kind}`, () =>
      provider.searchByName(query, page, kind),
    );
    return {
      localProducts,
      records: result.value,
      providerStatuses: [provider.status()],
      cache: { hit: result.hit, stale: result.stale },
    };
  } catch (error) {
    return {
      localProducts,
      records: [] as FoodRecord[],
      providerStatuses: [errorStatus(provider, error)],
      cache: { hit: false, stale: false },
    };
  }
}

export async function getFoodDetails(
  providerId: RemoteProviderId,
  recordId: string,
  language: string,
) {
  const provider = providers[providerId];
  const result = await providerCall(providerId, 'details', `${recordId}:${language}`, () =>
    provider.getDetails(recordId, language),
  );
  if (!result.value)
    throw new FoodDataError('NOT_FOUND', 'That food record was not found.', providerId);
  return {
    record: result.value,
    providerStatus: provider.status(),
    cache: { hit: result.hit, stale: result.stale },
  };
}

export function clearFoodDataServiceStateForTests() {
  inflight.clear();
}

export function setFoodDataObserverForTests(next: ((event: FoodDataEvent) => void) | null) {
  observer = next ?? (() => undefined);
}
