'use client';

import { useEffect, useState } from 'react';
import { Link2, Search, Unlink, RefreshCw, ExternalLink } from 'lucide-react';
import { InlineSkeleton } from '@/components/skeleton';
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
          <span>{Object.values(saved.address).join(', ')}</span>
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
            {review.store.name} · {Object.values(review.store.address).join(', ')}
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
      {status?.storeDirectoryEnabled && (
        <form
          className={styles.search}
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              setStores(null);
              const result = await request('/api/v1/food-data/catalog/stores', 'POST', { query });
              setStores(result.stores);
            });
          }}
        >
          <label htmlFor={`branch-search-${profile.id}`}>Find a branch</label>
          <div>
            <input
              id={`branch-search-${profile.id}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Store name, town or postcode"
              minLength={2}
              maxLength={200}
            />
            <button
              className="secondary-button compact"
              disabled={busy || query.trim().length < 2}
              aria-busy={busy}
              type="submit"
            >
              <Search size={16} /> {busy ? 'Please wait…' : 'Search'}
            </button>
          </div>
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
            <small>{Object.values(store.address).join(', ')}</small>
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
      <p className={styles.help}>
        Your store name, notes and shopping route stay under your control. Directory results don’t
        confirm stock or aisle numbers.
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
