import 'server-only';

import { getRuntimeConfig } from '@/lib/config';
import { FoodDataError } from '@/lib/domain/food-data';
import {
  type CatalogStore,
  storeSearchSchema,
  catalogChainsInputSchema,
} from '@/lib/domain/bord-catalog';
import { BordCatalogClient } from '@/lib/providers/bord-catalog-client';
import {
  getSupermarketProfile,
  ListSettingsNotFoundError,
  setSupermarketCatalogLink,
} from '@/lib/services/list-settings-service';

function client() {
  if (!getRuntimeConfig().foodData.catalog.storeDirectoryEnabled)
    throw new FoodDataError(
      'DISABLED',
      'The store directory is disabled. You can still save a custom store.',
    );
  return new BordCatalogClient();
}
/** Keep only official, displayable metadata; raw source payloads never leave the server. */
export function storeProjection(store: CatalogStore) {
  const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 500) : null);
  const safeUrl = (value: unknown) => {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  return {
    id: store.id,
    name: store.name,
    content_revision: store.content_revision,
    address: Object.fromEntries(
      Object.entries(store.address ?? {}).filter(
        ([key, value]) =>
          [
            'street',
            'city',
            'state',
            'region',
            'postcode',
            'postal_code',
            'country',
            'house_number',
          ].includes(key) && typeof value === 'string',
      ),
    ),
    latitude: store.latitude ?? null,
    longitude: store.longitude ?? null,
    status: text(
      store.status ??
        store.operating_status ??
        store.closure_status ??
        (store.closed === true ? 'closed (source reported)' : null),
    ),
    hours: text(store.hours ?? store.opening_hours),
    website: safeUrl(store.website ?? store.source_url),
    observedAt: text(store.observed_at ?? store.updated_at),
    source_refs: store.source_refs,
  };
}
export async function searchCatalogStores(input: unknown) {
  const parsed = storeSearchSchema.parse(input);
  const params = new URLSearchParams({ limit: '20', radius_km: String(parsed.radiusKm) });
  for (const [key, value] of Object.entries({
    query: parsed.query,
    state: parsed.state,
    chain_id: parsed.chainId,
    lat: parsed.latitude,
    lon: parsed.longitude,
    cursor: parsed.cursor,
  }))
    if (value !== undefined) params.set(key, String(value));
  const result = await client().stores(params);
  return {
    stores: result.data.map(storeProjection),
    generation: result.meta.catalog_generation,
    nextCursor: result.meta.next_cursor,
    warnings: result.meta.warnings.map((w) => w.code),
  };
}
export async function linkCatalogStore(
  profileId: string,
  storeId: string,
  revision: string,
  actor: string,
) {
  if (!getSupermarketProfile(profileId))
    throw new ListSettingsNotFoundError('That saved store was not found.');
  const response = await client().store(storeId);
  if (
    response.data.id !== storeId ||
    response.data.content_revision !== revision ||
    !response.meta.catalog_generation
  )
    throw new FoodDataError(
      'REVISION_EXPIRED',
      'The official store changed. Search and review the branch again.',
    );
  return setSupermarketCatalogLink(
    profileId,
    {
      storeId,
      revision,
      generation: response.meta.catalog_generation,
      metadata: JSON.stringify(storeProjection(response.data)),
    },
    actor,
  );
}
export async function reviewCatalogStore(profileId: string) {
  const profile = getSupermarketProfile(profileId);
  if (!profile) throw new ListSettingsNotFoundError('That saved store was not found.');
  if (!profile.catalogStoreId)
    return { store: null, changed: false, maps: [], mapState: 'not_linked' };
  const api = client();
  const current = await api.store(profile.catalogStoreId);
  let maps: Array<{
    id: string;
    sourceUrl: string | null;
    rightsStatus: string;
    displayPermitted: boolean;
  }> = [];
  let mapState = 'unavailable';
  try {
    const result = await api.maps(profile.catalogStoreId);
    maps = result.data.map((map) => ({
      id: map.id,
      sourceUrl:
        typeof map.source_url === 'string' &&
        /^https?:\/\//u.test(map.source_url) &&
        !new URL(map.source_url).username &&
        !new URL(map.source_url).password
          ? map.source_url
          : null,
      rightsStatus: map.rights_status,
      displayPermitted: map.display_permitted,
    }));
    mapState = maps.length
      ? maps.some((m) => !m.displayPermitted)
        ? 'rights_blocked'
        : 'available'
      : 'not_found';
  } catch (error) {
    mapState = error instanceof FoodDataError ? error.code.toLowerCase() : 'unavailable';
  }
  return {
    store: storeProjection(current.data),
    changed: current.data.content_revision !== profile.catalogRevision,
    generation: current.meta.catalog_generation,
    maps,
    mapState,
  };
}

export async function listCatalogChains(input: unknown) {
  const parsed = catalogChainsInputSchema.parse(input);
  const params = new URLSearchParams({ country: parsed.country, min_stores: '0', limit: '50' });
  if (parsed.cursor) params.set('cursor', parsed.cursor);
  const response = await client().chains(params);
  return {
    chains: response.data.map((chain) => ({
      id: chain.id,
      name: chain.name,
      observedStoreCount: chain.observed_store_count ?? null,
    })),
    nextCursor: response.meta.next_cursor,
    generation: response.meta.catalog_generation,
  };
}
