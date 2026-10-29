'use client';

import { ToastMessage } from './toast-message';

import { useEffect, useState } from 'react';
import { Link2, Search, Unlink, RefreshCw, ExternalLink } from 'lucide-react';
import { InlineSkeleton } from '@/components/skeleton';
import { formatStoreAddress } from '@/lib/domain/store-address';
import styles from './catalog-store-link.module.css';

type Store = {
  id: string;
  name: string;
  content_revision: string;
  address: Record<string, string>;
  status: string | null;
  hours: string | null;
  observedAt: string | null;
  source_refs: Array<{ source_id: string }>;
};
type Review = {
  store: Store | null;
  changed: boolean;
  maps: Array<{
    id: string;
    sourceUrl: string | null;
    rightsStatus: string;
    displayPermitted: boolean;
  }>;
  mapState: string;
};
type Profile = {
  id: string;
  catalogStoreId?: string | null;
  catalogMetadata?: string | null;
  catalogLinkedAt?: string | Date | null;
};
async function request(url: string, method = 'GET', body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload.error?.message ?? 'The directory is unavailable. Your custom store is still usable.',
    );
  return payload;
}
export function CatalogStoreLink({
  profile,
  onChange,
}: {
  profile: Profile;
  onChange: (workspace: unknown) => void;
}) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [chainId, setChainId] = useState('');
  const [chains, setChains] = useState<Array<{ id: string; name: string }>>([]);
  const [chainCursor, setChainCursor] = useState<string | null>(null);
  const [chainsLoaded, setChainsLoaded] = useState(false);
  const [nearby, setNearby] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState('10');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [submittedSearch, setSubmittedSearch] = useState<Record<string, unknown> | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<{ state: string; storeDirectoryEnabled: boolean } | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    request('/api/v1/food-data/catalog/status')
      .then((value) => {
        if (alive) setStatus(value);
      })
      .catch(() => {
        if (alive) setStatus({ state: 'unavailable', storeDirectoryEnabled: true });
      });
    return () => {
      alive = false;
    };
  }, []);
  let saved: Store | null = null;
  try {
    saved = profile.catalogMetadata ? JSON.parse(profile.catalogMetadata) : null;
  } catch {
    /* Legacy/manual profile. */
  }
  const endpoint = `/api/v1/supermarket-profiles/${profile.id}/catalog-link`;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Directory unavailable.');
    } finally {
      setBusy(false);
    }
  }
  async function link(store: Store) {
    await run(async () => {
      onChange(
        await request(endpoint, 'PATCH', { storeId: store.id, revision: store.content_revision }),
      );
      setStores(null);
      setReview(null);
      setMessage('Official branch linked. Your name, notes and route have been kept.');
    });
  }
  return (
    <section className={styles.panel} aria-label="Official store directory">
      <header>
        <Link2 size={19} aria-hidden="true" />
        <div>
          <h3>Official branch</h3>
          <p>Connect public store details to your saved store.</p>
        </div>
      </header>
      {!status ? (
        <InlineSkeleton label="Loading directory status" width="12rem" />
      ) : (
        <p className={styles.status}>
          Directory ·{' '}
          {status.storeDirectoryEnabled ? status.state.replaceAll('_', ' ') : 'disabled'}
        </p>
      )}
      {saved && (
        <div className={styles.saved}>
          <strong>{saved.name}</strong>
          <span>{formatStoreAddress(saved.address)}</span>
          <small>
            Saved official details{saved.observedAt ? ` · Source observed ${saved.observedAt}` : ''}
            . Hours may have changed.
          </small>
          {saved.hours && <span>{saved.hours}</span>}
          {saved.status && /closed|relocat/iu.test(saved.status) && (
            <p role="status">
              Source reports: {saved.status}. Review the branch before your next shop.
            </p>
          )}
          <small>
            Sources: {saved.source_refs.map((r) => r.source_id.replaceAll('_', ' ')).join(', ')}
          </small>
        </div>
      )}
      {profile.catalogStoreId && (
        <div className={styles.actions}>
          <button
            className="secondary-button compact"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              run(async () => {
                setReview(await request(endpoint));
              })
            }
            type="button"
          >
            <RefreshCw size={16} /> Review official updates
          </button>
          <button
            className="secondary-button compact"
            disabled={busy}
            onClick={() =>
              run(async () => {
                onChange(await request(endpoint, 'DELETE'));
                setReview(null);
                setMessage('Unlinked. Your custom store and route are unchanged.');
              })
            }
            type="button"
          >
            <Unlink size={16} /> Unlink
          </button>
        </div>
      )}
      {review?.store && (
        <div className={styles.saved}>
          <strong>
            {review.changed
              ? 'Updated official details available'
              : 'Official details match your saved copy'}
          </strong>
          <span>
            {review.store.name} · {formatStoreAddress(review.store.address)}
          </span>
          {review.store.status && <span>Source status: {review.store.status}</span>}
          {review.store.hours && <span>{review.store.hours}</span>}
          {review.changed && (
            <button
              className="secondary-button compact"
              disabled={busy}
              onClick={() => link(review.store!)}
              type="button"
            >
              Use these official details
            </button>
          )}
          <small>
            Maps · {review.mapState.replaceAll('_', ' ')}. Map images require display permission.
          </small>
          {review.maps.map(
            (map) =>
              map.sourceUrl && (
                <a key={map.id} href={map.sourceUrl} target="_blank" rel="noreferrer">
                  Official map <ExternalLink size={14} /> · {map.rightsStatus}
                </a>
              ),
          )}
        </div>
      )}
      {status && !status.storeDirectoryEnabled && (
        <p className={styles.help}>
          Store search is not enabled on this installation. You can still save and select a custom
          store for your shopping lists.
        </p>
      )}
      {status?.storeDirectoryEnabled && status.state === 'not_configured' && (
        <p className={styles.help}>
          Connect the Bòrd Food API in your server configuration to find local branches. Your saved
          stores remain available.
        </p>
      )}
      {status?.storeDirectoryEnabled && status.state !== 'not_configured' && (
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              setStores(null);
              const criteria = {
                ...(query.trim() ? { query: query.trim() } : {}),
                ...(area.trim() ? { state: area.trim().toUpperCase() } : {}),
                ...(chainId.trim() ? { chainId: chainId.trim() } : {}),
                ...(nearby ?? {}),
                radiusKm: Number(radiusKm),
              };
              const result = await request('/api/v1/food-data/catalog/stores', 'POST', criteria);
              setSubmittedSearch(criteria);
              setNextCursor(result.nextCursor);
              setStores(result.stores);
            });
          }}
        >
          <label htmlFor={`branch-search-${profile.id}`}>Find a branch</label>
          <div>
            <input
              id={`branch-search-${profile.id}`}
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Store name, town or postcode"
              minLength={2}
              maxLength={200}
            />
            <button
              className="secondary-button compact"
              disabled={
                busy || (!nearby && !area.trim() && !chainId.trim() && query.trim().length < 2)
              }
              aria-busy={busy}
              type="submit"
            >
              <Search size={16} /> {busy ? 'Please wait…' : 'Search'}
            </button>
          </div>
          <details>
            <summary>Area, chain and nearby filters</summary>
            <label>
              State or region code
              <input
                value={area}
                disabled={busy}
                maxLength={2}
                onChange={(event) => setArea(event.target.value)}
                placeholder="IA"
              />
            </label>
            <label>
              Chain (optional)
              <select
                value={chainId}
                disabled={busy}
                onChange={(event) => setChainId(event.target.value)}
              >
                <option value="">Any chain</option>
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
            </label>
            {(!chainsLoaded || chainCursor) && (
              <button
                type="button"
                className="secondary-button compact"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await request('/api/v1/food-data/catalog/chains', 'POST', {
                      country: 'US',
                      ...(chainCursor ? { cursor: chainCursor } : {}),
                    });
                    setChains((current) => [...current, ...result.chains]);
                    setChainCursor(result.nextCursor);
                    setChainsLoaded(true);
                  })
                }
              >
                {chainsLoaded ? 'Show more chains' : 'Load available US chains'}
              </button>
            )}
            {chainsLoaded && !chains.length && (
              <p>No chains are available in this catalog. Name and area search remain available.</p>
            )}
            <label>
              Search radius (km)
              <input
                value={radiusKm}
                disabled={busy}
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                onChange={(event) => setRadiusKm(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="secondary-button compact"
              disabled={busy}
              onClick={() => {
                if (!navigator.geolocation) {
                  setError('Location is unavailable. Search by name or area.');
                  return;
                }
                setBusy(true);
                setError('');
                navigator.geolocation.getCurrentPosition(
                  (position) => {
                    setNearby({
                      latitude: position.coords.latitude,
                      longitude: position.coords.longitude,
                    });
                    setBusy(false);
                  },
                  () => {
                    setError('Location could not be read. Search by name or area.');
                    setBusy(false);
                  },
                  { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
                );
              }}
            >
              Use my location for this search
            </button>
            {nearby && (
              <p>
                Nearby filter selected. Coordinates are sent to your configured catalog only when
                you search.{' '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setNearby(null)}
                  disabled={busy}
                >
                  Clear location
                </button>
              </p>
            )}
          </details>
        </form>
      )}
      {busy && <InlineSkeleton label="Loading official branch details" width="100%" />}
      {stores && !stores.length && (
        <p role="status">
          No matching branches in the available directory. Keep your custom store or try another
          search.
        </p>
      )}
      {stores?.map((store) => (
        <div className={styles.result} key={store.id}>
          <div>
            <strong>{store.name}</strong>
            <small>{formatStoreAddress(store.address)}</small>
            <small>{store.status ?? 'Operating status unknown'}</small>
          </div>
          <button
            className="secondary-button compact"
            disabled={busy}
            onClick={() => link(store)}
            type="button"
          >
            Link branch
          </button>
        </div>
      ))}
      {nextCursor && submittedSearch && (
        <button
          type="button"
          disabled={busy}
          className="secondary-button compact"
          onClick={() =>
            void run(async () => {
              const result = await request('/api/v1/food-data/catalog/stores', 'POST', {
                ...submittedSearch,
                cursor: nextCursor,
              });
              setStores((current) => [...(current ?? []), ...result.stores]);
              setNextCursor(result.nextCursor);
            })
          }
        >
          Show more branches
        </button>
      )}
      <p className={styles.help}>
        Your store name, notes and shopping route stay under your control. Directory results don’t
        confirm stock or aisle numbers.
      </p>
      {error && <ToastMessage message={error} tone="error" />}
      {message && <ToastMessage message={message} tone="info" />}
    </section>
  );
}
