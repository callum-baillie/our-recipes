'use client';

import { ChevronDown, ChevronUp, FolderPlus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { useToast } from '@/components/toast-provider';
import type { CollectionSummary } from '@/lib/services/collection-service';

export function CollectionManager({
  initialCollections,
}: {
  initialCollections: CollectionSummary[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [collections, setCollections] = useState(initialCollections);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, coverImageId: '' }),
      });
      const body = (await response.json().catch(() => null)) as {
        collection?: CollectionSummary;
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.collection) {
        const message = body?.error?.message ?? 'We could not create that collection.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setCollections((current) => [...current, body.collection!]);
      setName('');
      setDescription('');
      showToast('Collection created.', 'success');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function move(collectionId: string, direction: -1 | 1) {
    const index = collections.findIndex((collection) => collection.id === collectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= collections.length) return;
    const next = [...collections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/collections/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionIds: next.map((collection) => collection.id) }),
      });
      const body = (await response.json().catch(() => null)) as {
        collections?: CollectionSummary[];
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.collections) {
        const message = body?.error?.message ?? 'We could not save that collection order.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setCollections(body.collections);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove(collection: CollectionSummary) {
    if (!window.confirm(`Remove “${collection.name}”? Its recipes will stay in the cookbook.`))
      return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/collections/${collection.id}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        const message = body?.error?.message ?? 'We could not remove that collection.';
        setError(message);
        showToast(message, 'error');
        return;
      }
      setCollections((current) => current.filter((candidate) => candidate.id !== collection.id));
      showToast(`${collection.name} removed.`, 'success');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="recipe-page collection-page">
      <div className="collection-page-shell">
        <header className="collection-page-intro">
          <p className="eyebrow">CURATED COOKBOOKS</p>
          <div className="collection-intro-layout">
            <h1>A shelf for the recipes that belong together.</h1>
            <p>
              Collections are deliberate household cookbooks. A recipe can sit in more than one, and
              their order stays exactly the way you arrange it.
            </p>
          </div>
        </header>

        <section className="collection-create-panel" aria-labelledby="create-collection-title">
          <div className="collection-create-heading">
            <h2 id="create-collection-title">Start a collection</h2>
          </div>
          <form className="collection-create-form" onSubmit={create}>
            <label>
              <span>Collection name</span>
              <input
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Sunday suppers"
              />
            </label>
            <label>
              <span>
                A small note <em>(optional)</em>
              </span>
              <input
                value={description}
                maxLength={800}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="The recipes worth returning to."
              />
            </label>
            <button
              className="primary-button compact"
              type="submit"
              aria-busy={pending}
              disabled={pending || !name.trim()}
            >
              <FolderPlus size={16} /> Create collection
            </button>
          </form>
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {collections.length ? (
          <section className="collection-grid" aria-label="Household collections">
            {collections.map((collection, index) => (
              <article className="collection-card" key={collection.id}>
                {collection.coverImage ? (
                  <Image
                    src={`/api/v1/recipes/${collection.coverImage.recipeId}/images/${collection.coverImage.id}`}
                    alt={collection.coverImage.altText || `${collection.name} cover`}
                    width={collection.coverImage.width}
                    height={collection.coverImage.height}
                    unoptimized
                  />
                ) : (
                  <div className="collection-cover-placeholder" aria-hidden="true">
                    <FolderPlus size={28} />
                  </div>
                )}
                <div className="collection-card-copy">
                  <p>
                    {collection.recipeCount} recipe{collection.recipeCount === 1 ? '' : 's'}
                  </p>
                  <h2>{collection.name}</h2>
                  <span>
                    {collection.description || 'A shared shelf, ready for its first recipe.'}
                  </span>
                </div>
                <div className="collection-card-actions">
                  <Link className="text-button" href={`/collections/${collection.id}`}>
                    Open collection
                  </Link>
                  <div className="reorder-actions" aria-label={`${collection.name} order`}>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={pending || index === 0}
                      onClick={() => void move(collection.id, -1)}
                      aria-label={`Move ${collection.name} up`}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={pending || index === collections.length - 1}
                      onClick={() => void move(collection.id, 1)}
                      aria-label={`Move ${collection.name} down`}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      className="icon-button danger-icon-button"
                      type="button"
                      disabled={pending}
                      onClick={() => void remove(collection)}
                      aria-label={`Remove ${collection.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="collection-empty" aria-labelledby="collection-empty-title">
            <span className="collection-empty-mark" aria-hidden="true">
              <FolderPlus size={22} />
            </span>
            <div>
              <h2 id="collection-empty-title">Make the first shelf.</h2>
              <p>
                Collections are a calm way to gather seasonal menus, favorites, and family
                traditions.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
