'use client';

import { FolderPlus, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useRef, useState } from 'react';

import { AsyncSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast-provider';

type CollectionOption = {
  id: string;
  name: string;
  recipeCount: number;
};

export function RecipeCollectionButton({
  recipeId,
  recipeTitle,
}: {
  recipeId: string;
  recipeTitle: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogId = `recipe-collection-${recipeId}`;

  async function loadCollections() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/collections');
      const body = (await response.json().catch(() => null)) as {
        collections?: CollectionOption[];
      } | null;
      if (!response.ok || !body?.collections) {
        setError('We could not load your collections.');
        return;
      }
      setCollections(body.collections);
      setCollectionId((current) =>
        body.collections!.some((collection) => collection.id === current)
          ? current
          : (body.collections![0]?.id ?? ''),
      );
    } catch {
      setError('We could not reach the recipe server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function openDialog() {
    dialogRef.current?.showModal();
    void loadCollections();
  }

  async function requestAssignment(targetCollectionId: string) {
    const response = await fetch(`/api/v1/collections/${targetCollectionId}/recipes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId }),
    });
    const body = (await response.json().catch(() => null)) as {
      added?: boolean;
      collection?: CollectionOption;
      error?: { message?: string };
    } | null;
    if (!response.ok || typeof body?.added !== 'boolean' || !body.collection) {
      throw new Error(body?.error?.message ?? 'We could not add that recipe to the collection.');
    }
    return body;
  }

  async function assignExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collection = collections.find((candidate) => candidate.id === collectionId);
    if (!collection) return;
    setPending(true);
    setError(null);
    try {
      const result = await requestAssignment(collection.id);
      showToast(
        result.added
          ? `Added “${recipeTitle}” to ${collection.name}.`
          : `“${recipeTitle}” is already in ${collection.name}.`,
        'success',
      );
      dialogRef.current?.close();
      router.refresh();
    } catch (assignmentError) {
      setError(
        assignmentError instanceof Error
          ? assignmentError.message
          : 'We could not add that recipe to the collection.',
      );
    } finally {
      setPending(false);
    }
  }

  async function createAndAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    try {
      const createResponse = await fetch('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: '', coverImageId: '' }),
      });
      const createBody = (await createResponse.json().catch(() => null)) as {
        collection?: CollectionOption;
        error?: { message?: string };
      } | null;
      if (!createResponse.ok || !createBody?.collection) {
        setError(createBody?.error?.message ?? 'We could not create that collection.');
        return;
      }
      const collection = createBody.collection;
      setCollections((current) => [...current, collection]);
      setCollectionId(collection.id);
      try {
        await requestAssignment(collection.id);
      } catch (assignmentError) {
        setError(
          `Created ${collection.name}, but ${
            assignmentError instanceof Error
              ? assignmentError.message.toLocaleLowerCase()
              : 'the recipe could not be added.'
          }`,
        );
        return;
      }
      showToast(`Created ${collection.name} and added “${recipeTitle}”.`, 'success');
      setNewName('');
      dialogRef.current?.close();
      router.refresh();
    } catch {
      setError('We could not reach the recipe server. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="recipe-collection-toolbar" role="group" aria-label="Recipe collections">
        <button
          type="button"
          aria-label={`Add ${recipeTitle} to a collection`}
          aria-haspopup="dialog"
          aria-controls={dialogId}
          title="Add to a collection"
          onClick={openDialog}
        >
          <FolderPlus size={17} aria-hidden="true" />
        </button>
      </div>
      <dialog
        className="recipe-collection-dialog"
        id={dialogId}
        ref={dialogRef}
        aria-labelledby={`${dialogId}-title`}
        onClose={() => setError(null)}
      >
        <header className="recipe-collection-dialog-heading">
          <div>
            <p className="eyebrow">YOUR RECIPE SHELVES</p>
            <h2 id={`${dialogId}-title`}>Add to a collection</h2>
            <p>{recipeTitle}</p>
          </div>
          <button
            className="recipe-collection-dialog-close"
            type="button"
            aria-label="Close collection dialog"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="recipe-collection-dialog-body">
          <form className="recipe-collection-existing" onSubmit={assignExisting}>
            <label>
              <span>Existing collection</span>
              <select
                value={collectionId}
                disabled={loading || pending || collections.length === 0}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                {collections.length ? (
                  collections.map((collection) => (
                    <option value={collection.id} key={collection.id}>
                      {collection.name} · {collection.recipeCount} recipe
                      {collection.recipeCount === 1 ? '' : 's'}
                    </option>
                  ))
                ) : (
                  <option value="">No collections yet</option>
                )}
              </select>
            </label>
            <button
              className="primary-button compact"
              type="submit"
              disabled={loading || pending || !collectionId}
            >
              <FolderPlus size={16} aria-hidden="true" /> Add recipe
            </button>
          </form>

          <div className="recipe-collection-divider">
            <span>or create one</span>
          </div>

          <form className="recipe-collection-create" onSubmit={createAndAssign}>
            <label>
              <span>New collection name</span>
              <input
                value={newName}
                maxLength={80}
                disabled={pending}
                placeholder="e.g. Weeknight favorites"
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <button className="text-button" type="submit" disabled={pending || !newName.trim()}>
              <Plus size={16} aria-hidden="true" /> Create and add
            </button>
          </form>

          {loading ? <AsyncSkeleton label="Loading collections" variant="rows" /> : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
