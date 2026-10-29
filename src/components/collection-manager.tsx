'use client';

import { ToastMessage } from './toast-message';
import { PageHeader } from '@/components/page-header';

import { ChevronDown, ChevronUp, FolderPlus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { ButtonSpinner } from '@/components/skeleton';
import { RecipebookNav } from '@/components/recipebook-nav';
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
  const [pendingAction, setPendingAction] = useState<
    | { type: 'create' }
    | { type: 'move'; collectionId: string; direction: -1 | 1 }
    | { type: 'remove'; collectionId: string }
    | null
  >(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setPendingAction({ type: 'create' });
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
    } catch {
      const message = 'We could not reach the recipe server. Try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  }

  async function move(collectionId: string, direction: -1 | 1) {
    const index = collections.findIndex((collection) => collection.id === collectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= collections.length) return;
    const next = [...collections];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setPending(true);
    setPendingAction({ type: 'move', collectionId, direction });
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
    } catch {
      const message = 'We could not reach the recipe server. Try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  }

  async function remove(collection: CollectionSummary) {
    if (!window.confirm(`Remove “${collection.name}”? Its recipes will stay in the cookbook.`))
      return;
    setPending(true);
    setPendingAction({ type: 'remove', collectionId: collection.id });
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
    } catch {
      const message = 'We could not reach the recipe server. Try again.';
      setError(message);
      showToast(message, 'error');
    } finally {
      setPending(false);
      setPendingAction(null);
    }
  }

  return (
    <main className="recipe-page recipebook-page collection-page">
      <div className="collection-page-shell">
        <PageHeader
          title="Collections"
          eyebrow="CURATED COOKBOOKS"
          description="Keep recipes together in household cookbooks, arranged in the order you choose."
          toolbarRight={<RecipebookNav current="collections" />}
        />

        <section className="collection-create-panel" aria-labelledby="create-collection-title">
          <div className="collection-create-heading">
            <h2 id="create-collection-title">Create a collection</h2>
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
              {pendingAction?.type === 'create' ? <ButtonSpinner /> : <FolderPlus size={16} />}{' '}
              {pendingAction?.type === 'create' ? 'Creating…' : 'Create collection'}
            </button>
          </form>
        </section>

        {error && <ToastMessage message={error} tone="error" />}

        {collections.length ? (
          <section
            className="collection-grid"
            aria-label="Household collections"
            aria-busy={pending}
          >
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
                    {collection.description ||
                      (collection.recipeCount
                        ? 'A shared shelf for your saved recipes.'
                        : 'A shared shelf, ready for its first recipe.')}
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
                      aria-label={
                        pendingAction?.type === 'move' &&
                        pendingAction.collectionId === collection.id &&
                        pendingAction.direction === -1
                          ? `Moving ${collection.name} up`
                          : `Move ${collection.name} up`
                      }
                      aria-busy={
                        pendingAction?.type === 'move' &&
                        pendingAction.collectionId === collection.id &&
                        pendingAction.direction === -1
                      }
                    >
                      {pendingAction?.type === 'move' &&
                      pendingAction.collectionId === collection.id &&
                      pendingAction.direction === -1 ? (
                        <ButtonSpinner />
                      ) : (
                        <ChevronUp size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={pending || index === collections.length - 1}
                      onClick={() => void move(collection.id, 1)}
                      aria-label={
                        pendingAction?.type === 'move' &&
                        pendingAction.collectionId === collection.id &&
                        pendingAction.direction === 1
                          ? `Moving ${collection.name} down`
                          : `Move ${collection.name} down`
                      }
                      aria-busy={
                        pendingAction?.type === 'move' &&
                        pendingAction.collectionId === collection.id &&
                        pendingAction.direction === 1
                      }
                    >
                      {pendingAction?.type === 'move' &&
                      pendingAction.collectionId === collection.id &&
                      pendingAction.direction === 1 ? (
                        <ButtonSpinner />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    <button
                      className="icon-button danger-icon-button"
                      type="button"
                      disabled={pending}
                      onClick={() => void remove(collection)}
                      aria-label={
                        pendingAction?.type === 'remove' &&
                        pendingAction.collectionId === collection.id
                          ? `Removing ${collection.name}`
                          : `Remove ${collection.name}`
                      }
                      aria-busy={
                        pendingAction?.type === 'remove' &&
                        pendingAction.collectionId === collection.id
                      }
                    >
                      {pendingAction?.type === 'remove' &&
                      pendingAction.collectionId === collection.id ? (
                        <ButtonSpinner />
                      ) : (
                        <Trash2 size={16} />
                      )}
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
              <h2 id="collection-empty-title">No collections yet.</h2>
              <p>
                Group weeknight meals, seasonal menus or family favorites in your first collection
                above.
              </p>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
