import 'server-only';

import { getRuntimeConfig } from '@/lib/config';
import {
  FoodDataError,
  type CatalogReference,
  type FoodRecord,
  type ProviderStatus,
  normalizeGtin,
} from '@/lib/domain/food-data';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import { normalizeCatalogUsdaFood } from '@/lib/providers/usda-food-data-provider';
import { normalizeCatalogOffFood } from '@/lib/providers/open-food-facts-provider';

type Capabilities = Awaited<ReturnType<BordCatalogClient['capabilities']>>;
const sessions = new Map<string, { until: number; value: Capabilities }>();
const requests = new Map<string, Promise<Capabilities>>();
const cache = new Map<
  string,
  { until: number; records: FoodRecord[]; statuses: ProviderStatus[] }
>();

export function directFoodFallbackAllowed() {
  const config = getRuntimeConfig().foodData;
  return (
    config.mode === 'direct' || (config.mode === 'catalog_preferred' && config.allowRemoteFallback)
  );
}
export function isNativeCatalogEnabled() {
  return getRuntimeConfig().foodData.mode !== 'direct';
}
async function capabilities(client: BordCatalogClient) {
  const current = sessions.get(client.fingerprint);
  if (current && current.until > Date.now()) return current.value;
  let request = requests.get(client.fingerprint);
  if (!request) {
    request = client
      .capabilities()
      .then((value) => {
        if (sessions.size > 10) sessions.clear();
        sessions.set(client.fingerprint, { until: Date.now() + 300_000, value });
        return value;
      })
      .finally(() => requests.delete(client.fingerprint));
    requests.set(client.fingerprint, request);
  }
  return request;
}
export function catalogProviderStatus(
  provider: FoodRecord['provider'],
  error?: unknown,
): ProviderStatus {
  const config = getRuntimeConfig().foodData;
  const code = error instanceof FoodDataError ? error.code : null;
  return {
    provider,
    configured: Boolean(config.catalog.baseUrl && config.catalog.apiKey),
    status:
      !config.catalog.baseUrl || !config.catalog.apiKey
        ? 'not_configured'
        : code === 'INITIALIZING'
          ? 'initializing'
          : code === 'RIGHTS_BLOCKED'
            ? 'rights_blocked'
            : code === 'DISABLED'
              ? 'disabled'
              : code === 'NOT_CONFIGURED'
                ? 'not_configured'
                : code === 'AUTH_FAILED'
                  ? 'authentication_failed'
                  : code === 'MALFORMED_RESPONSE'
                    ? 'invalid_response'
                    : error
                      ? 'temporarily_unavailable'
                      : 'available',
    capabilities: { exactBarcode: true, nameSearch: true, details: true, images: false },
    retryAt: null,
    remaining: null,
  };
}
export async function getCatalogStatus() {
  const config = getRuntimeConfig().foodData;
  const base = {
    mode: config.mode,
    storeDirectoryEnabled: config.catalog.storeDirectoryEnabled,
    remoteFallback: directFoodFallbackAllowed() && config.mode !== 'direct',
  };
  if (!config.catalog.baseUrl || !config.catalog.apiKey)
    return {
      ...base,
      state: 'not_configured',
      generation: null,
      packs: {},
      sources: {},
      mapAssetsRightsBlocked: false,
    };
  try {
    const result = await capabilities(new BordCatalogClient());
    const packs = Object.fromEntries(
      Object.entries(result.data.packs).filter(([key]) =>
        ['usda', 'stores', 'products', 'prices', 'guidance', 'maps'].includes(key),
      ),
    );
    const sources = Object.fromEntries(
      Object.entries(result.data.sources).filter(([key]) =>
        [
          'usda_fdc',
          'all_the_places',
          'usda_snap',
          'open_food_facts',
          'open_prices',
          'foodkeeper',
        ].includes(key),
      ),
    );
    const values = Object.values(packs);
    const state =
      values.some((p) => p.stale) || Object.values(sources).some((p) => p.stale)
        ? 'stale'
        : !values.some((p) => p.enabled)
          ? 'disabled'
          : !values.some((p) => p.enabled && p.available)
            ? 'initializing'
            : values.some((p) => p.enabled && !p.available)
              ? 'partial'
              : 'available';
    return {
      ...base,
      state,
      generation: result.meta.catalog_generation,
      packs,
      sources,
      mapAssetsRightsBlocked: result.data.map_assets?.rights_blocked ?? false,
    };
  } catch (error) {
    const state = catalogProviderStatus('usda_fdc', error).status;
    return {
      ...base,
      state,
      generation: null,
      packs: {},
      sources: {},
      mapAssetsRightsBlocked: false,
    };
  }
}

export async function getCatalogFoodDetails(
  provider: FoodRecord['provider'],
  recordId: string,
  language: string,
  ref?: CatalogReference,
) {
  if (ref && (ref.source_id !== provider || ref.source_record_id !== recordId))
    throw new FoodDataError(
      'REVISION_EXPIRED',
      'The selected source does not match. Review this food again.',
    );
  const client = new BordCatalogClient();
  // Confirmation always performs an exact read. Cached/stale details cannot approve a changed revision.
  const response = await client
    .sourceFood(provider, recordId, ref?.source_revision)
    .catch((error: unknown) => {
      if (ref && error instanceof FoodDataError && error.code === 'NOT_FOUND')
        throw new FoodDataError(
          'REVISION_EXPIRED',
          'This selected food revision is no longer available. Review the food again.',
        );
      throw error;
    });
  if (
    response.data.source_id !== provider ||
    response.data.record_id !== recordId ||
    !response.meta.catalog_generation ||
    (ref && response.data.content_revision !== ref.source_revision)
  )
    throw new FoodDataError(
      'REVISION_EXPIRED',
      'This source revision is unavailable. Review this food again.',
    );
  let record: FoodRecord;
  try {
    record =
      provider === 'usda_fdc'
        ? normalizeCatalogUsdaFood(response.data.data)
        : normalizeCatalogOffFood(response.data.data, language);
  } catch {
    throw new FoodDataError(
      'NORMALIZATION_FAILED',
      'This source food cannot be safely normalized.',
    );
  }
  if (record.providerRecordId !== recordId)
    throw new FoodDataError('MALFORMED_RESPONSE', 'The catalog returned a different food record.');
  record.catalogRef = {
    transport_id: 'bord_food_api',
    source_id: provider,
    source_record_id: recordId,
    source_revision: response.data.content_revision,
    catalog_generation: response.meta.catalog_generation,
    canonical_product_id: ref?.canonical_product_id ?? response.data.id ?? null,
  };
  record.providerMetadata = {
    ...record.providerMetadata,
    catalogRef: record.catalogRef,
    measures: response.data.measures,
    sourceRefs: response.data.source_refs ?? response.meta.source_refs,
  };
  // V1 has no authorized native image asset proxy. Never send source image URLs to the browser.
  record.images = [];
  return {
    record,
    providerStatus: catalogProviderStatus(provider),
    cache: { hit: false, stale: false },
  };
}

async function candidateFoods(
  candidates: Array<{ id: string; source_refs: Array<{ source_id: string; record_id: string }> }>,
  language: string,
) {
  const selections = candidates
    .flatMap((candidate) =>
      candidate.source_refs
        .filter((ref) => ['usda_fdc', 'open_food_facts'].includes(ref.source_id))
        .map((ref) => ({ ...ref, candidateId: candidate.id })),
    )
    .filter(
      (ref, index, all) =>
        all.findIndex(
          (other) => other.source_id === ref.source_id && other.record_id === ref.record_id,
        ) === index,
    )
    .slice(0, 8);
  const results = await Promise.allSettled(
    selections.map(async (ref) => {
      const result = await getCatalogFoodDetails(
        ref.source_id as FoodRecord['provider'],
        ref.record_id,
        language,
      );
      result.record.catalogRef!.canonical_product_id = ref.candidateId;
      result.record.providerMetadata.catalogRef = result.record.catalogRef;
      return result.record;
    }),
  );
  const records = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const statuses = results.map((result, index) =>
    catalogProviderStatus(
      selections[index].source_id as FoodRecord['provider'],
      result.status === 'rejected' ? result.reason : undefined,
    ),
  );
  if (!records.length && results.some((result) => result.status === 'rejected')) {
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  return { records, statuses };
}
export async function lookupCatalogBarcode(gtin: string, language: string) {
  const normalized = normalizeGtin(gtin).canonicalGtin;
  const client = new BordCatalogClient();
  const response = await client.resolve(normalized);
  const { records, statuses } = await candidateFoods(
    response.data.flatMap((r) => r.candidates),
    language,
  );
  return {
    preferred: records[0] ?? null,
    alternatives: records.slice(1),
    providerStatuses: statuses.length ? statuses : [catalogProviderStatus('open_food_facts')],
    cache: { hit: false, stale: false },
  };
}
export async function searchCatalogFoods(
  query: string,
  page: number,
  kind: 'any' | 'generic' | 'branded',
) {
  const client = new BordCatalogClient();
  const session = await capabilities(client);
  const key = JSON.stringify([
    client.fingerprint,
    session.meta.catalog_generation,
    query.toLowerCase(),
    page,
    kind,
    'en',
  ]);
  const cached = cache.get(key);
  if (cached && cached.until > Date.now())
    return {
      records: cached.records,
      providerStatuses: cached.statuses,
      cache: { hit: true, stale: false },
    };
  const records: FoodRecord[] = [];
  const statuses: ProviderStatus[] = [];
  for (const source of ['usda_fdc', 'open_food_facts'] as const) {
    if (source === 'open_food_facts' && (kind === 'generic' || page > 1)) continue;
    const pack = session.data.packs[source === 'usda_fdc' ? 'usda' : 'products'];
    if (!pack?.enabled || !pack.available) {
      statuses.push(
        catalogProviderStatus(
          source,
          new FoodDataError(!pack?.enabled ? 'DISABLED' : 'INITIALIZING', 'Source unavailable.'),
        ),
      );
      continue;
    }
    try {
      if (source === 'usda_fdc') {
        const response = await client.usdaSearch(query, page);
        records.push(
          ...response.foods
            .map(normalizeCatalogUsdaFood)
            .filter((r) => kind === 'any' || (kind === 'branded') === /branded/iu.test(r.dataType)),
        );
      } else if (kind !== 'generic' && page === 1) {
        const response = await client.products(query);
        const candidates = await candidateFoods(response.data, 'en');
        records.push(...candidates.records);
        statuses.push(...candidates.statuses);
      }
      statuses.push(catalogProviderStatus(source));
    } catch (error) {
      statuses.push(catalogProviderStatus(source, error));
    }
  }
  // Fail explicitly when every requested pack failed; the caller may apply its explicit fallback policy.
  if (!records.length && !statuses.some((s) => s.status === 'available'))
    throw new FoodDataError(
      statuses.every((s) => s.status === 'disabled')
        ? 'DISABLED'
        : statuses.some((s) => s.status === 'initializing')
          ? 'INITIALIZING'
          : statuses.some((s) => s.status === 'rights_blocked')
            ? 'RIGHTS_BLOCKED'
            : 'UNAVAILABLE',
      'Catalog sources are not currently available.',
    );
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { until: Date.now() + 60_000, records, statuses });
  return { records, providerStatuses: statuses, cache: { hit: false, stale: false } };
}
export function clearCatalogStateForTests() {
  sessions.clear();
  requests.clear();
  cache.clear();
}
