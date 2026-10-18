'use client';
import { PageHeader } from '@/components/page-header';

import { Merge, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

import { useToast } from '@/components/toast-provider';
import { RecipebookNav } from '@/components/recipebook-nav';
import { ButtonSpinner } from '@/components/skeleton';

type Tag = { name: string; color: string | null; usageCount: number };
type PendingTagOperation = {
  type: 'create' | 'update' | 'merge' | 'remove';
  name?: string;
};

export function TagManager({ initialTags }: { initialTags: Tag[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tags, setTags] = useState(initialTags);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#5B713E');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingTagOperation | null>(null);

  async function request(
    url: string,
    method: string,
    body: unknown,
    operation: PendingTagOperation,
  ) {
    setPending(true);
    setPendingOperation(operation);
    setError(null);
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        tag?: Tag;
        error?: { message?: string };
      };
      if (!response.ok) {
        const message = payload?.error?.message ?? 'We could not save that tag.';
        setError(message);
        showToast(message, 'error');
        return null;
      }
      return payload;
    } finally {
      setPending(false);
      setPendingOperation(null);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const payload = await request(
      '/api/v1/tags',
      'POST',
      { name: newName, color: newColor },
      { type: 'create' },
    );
    if (!payload?.tag) return;
    setTags((current) => [...current, payload.tag!].sort((a, b) => a.name.localeCompare(b.name)));
    setNewName('');
    showToast('Tag added.', 'success');
    router.refresh();
  }

  async function update(source: string, name: string, color: string) {
    const payload = await request(
      `/api/v1/tags/${encodeURIComponent(source)}`,
      'PATCH',
      { name, color },
      { type: 'update', name: source },
    );
    if (!payload?.tag) return;
    setTags((current) =>
      current
        .map((tag) => (tag.name === source ? payload.tag! : tag))
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
    showToast('Tag updated.', 'success');
    router.refresh();
  }

  async function merge(source: string, targetName: string, targetColor: string) {
    const payload = await request(
      `/api/v1/tags/${encodeURIComponent(source)}/merge`,
      'POST',
      { targetName, targetColor },
      { type: 'merge', name: source },
    );
    if (!payload?.tag) return;
    setTags((current) => {
      const withoutSource = current.filter(
        (tag) => tag.name !== source && tag.name !== payload.tag!.name,
      );
      return [...withoutSource, payload.tag!].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    });
    showToast(`${source} merged into ${payload.tag.name}.`, 'success');
    router.refresh();
  }

  async function remove(name: string) {
    if (!window.confirm(`Remove “${name}” from every recipe? This cannot be undone.`)) return;
    const payload = await request(`/api/v1/tags/${encodeURIComponent(name)}`, 'DELETE', undefined, {
      type: 'remove',
      name,
    });
    if (payload === null) return;
    setTags((current) => current.filter((tag) => tag.name !== name));
    showToast(`${name} removed.`, 'success');
    router.refresh();
  }

  return (
    <main className="settings-page">
      <PageHeader
        title="Tags"
        eyebrow="HOUSEHOLD ORGANIZATION"
        description="Organize recipes with shared names and colors. Renaming and merging keeps tagged recipes together."
        toolbarRight={<RecipebookNav current="tags" />}
      />
      <section className="settings-card">
        <h2>Add a tag</h2>
        <form className="tag-create-form" onSubmit={create}>
          <label>
            <span>Tag name</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="e.g. freezer-friendly"
            />
          </label>
          <label>
            <span>Color</span>
            <input
              type="color"
              value={newColor}
              onChange={(event) => setNewColor(event.target.value)}
            />
          </label>
          <button
            className="primary-button compact"
            type="submit"
            aria-busy={pending}
            disabled={pending || !newName.trim()}
          >
            {pendingOperation?.type === 'create' ? <ButtonSpinner /> : <Plus size={16} />}{' '}
            {pendingOperation?.type === 'create' ? 'Adding…' : 'Add tag'}
          </button>
        </form>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="tag-list" aria-label="Household tags">
        {tags.length ? (
          tags.map((tag) => (
            <TagEditor
              key={tag.name}
              tag={tag}
              pending={pending}
              pendingOperation={pendingOperation}
              onUpdate={update}
              onMerge={merge}
              onDelete={remove}
            />
          ))
        ) : (
          <p className="muted">
            Create your first flexible household tag from here or while editing a recipe.
          </p>
        )}
      </section>
    </main>
  );
}

function TagEditor({
  tag,
  pending,
  pendingOperation,
  onUpdate,
  onMerge,
  onDelete,
}: {
  tag: Tag;
  pending: boolean;
  pendingOperation: PendingTagOperation | null;
  onUpdate: (source: string, name: string, color: string) => Promise<void>;
  onMerge: (source: string, targetName: string, targetColor: string) => Promise<void>;
  onDelete: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color ?? '#5B713E');
  const [mergeTarget, setMergeTarget] = useState('');
  return (
    <article className="tag-row">
      <div className="tag-row-title">
        <span className="tag-swatch" style={{ backgroundColor: color }} aria-hidden="true" />
        <strong>{tag.name}</strong>
        <small>
          {tag.usageCount} recipe{tag.usageCount === 1 ? '' : 's'}
        </small>
      </div>
      <div className="tag-row-editor">
        <label>
          <span className="sr-only">Rename {tag.name}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          <span className="sr-only">Color for {tag.name}</span>
          <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        </label>
        <button
          className="text-button"
          type="button"
          disabled={pending || !name.trim()}
          aria-busy={pendingOperation?.type === 'update' && pendingOperation.name === tag.name}
          onClick={() => onUpdate(tag.name, name, color)}
        >
          {pendingOperation?.type === 'update' && pendingOperation.name === tag.name ? (
            <ButtonSpinner />
          ) : (
            <Save size={15} />
          )}{' '}
          {pendingOperation?.type === 'update' && pendingOperation.name === tag.name
            ? 'Saving…'
            : 'Save'}
        </button>
      </div>
      <div className="tag-row-merge">
        <label>
          <span className="sr-only">Merge {tag.name} into</span>
          <input
            value={mergeTarget}
            onChange={(event) => setMergeTarget(event.target.value)}
            placeholder="Merge into another tag"
          />
        </label>
        <button
          className="text-button"
          type="button"
          disabled={pending || !mergeTarget.trim()}
          aria-busy={pendingOperation?.type === 'merge' && pendingOperation.name === tag.name}
          onClick={() => onMerge(tag.name, mergeTarget, color)}
        >
          {pendingOperation?.type === 'merge' && pendingOperation.name === tag.name ? (
            <ButtonSpinner />
          ) : (
            <Merge size={15} />
          )}{' '}
          {pendingOperation?.type === 'merge' && pendingOperation.name === tag.name
            ? 'Merging…'
            : 'Merge'}
        </button>
        <button
          className="text-button danger-text-button"
          type="button"
          disabled={pending}
          aria-busy={pendingOperation?.type === 'remove' && pendingOperation.name === tag.name}
          onClick={() => onDelete(tag.name)}
        >
          {pendingOperation?.type === 'remove' && pendingOperation.name === tag.name ? (
            <ButtonSpinner />
          ) : (
            <Trash2 size={15} />
          )}{' '}
          {pendingOperation?.type === 'remove' && pendingOperation.name === tag.name
            ? 'Removing…'
            : 'Remove'}
        </button>
      </div>
    </article>
  );
}
