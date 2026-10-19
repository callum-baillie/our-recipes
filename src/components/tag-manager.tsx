'use client';

import { Merge, Plus, Save, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PageHeader } from './page-header';
import { RecipebookNav } from './recipebook-nav';
import { ButtonSpinner } from './skeleton';
import { useToast } from './toast-provider';
import styles from './tag-manager.module.css';

type Tag = { name: string; color: string | null; usageCount: number };
type Operation = { type: 'create' | 'update' | 'merge' | 'remove'; name?: string };
const defaultColor = '#5B713E';

export function TagManager({ initialTags }: { initialTags: Tag[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tags, setTags] = useState(initialTags);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(defaultColor);
  const [editing, setEditing] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'merge'>('edit');
  const [name, setName] = useState('');
  const [color, setColor] = useState(defaultColor);
  const [targetKind, setTargetKind] = useState('existing');
  const [targetName, setTargetName] = useState('');
  const [targetColor, setTargetColor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [failedOperation, setFailedOperation] = useState<Operation | null>(null);
  const [pending, setPending] = useState<Operation | null>(null);
  const source = tags.find((tag) => tag.name === editing);
  const dirty = Boolean(
    source &&
    (mode === 'edit'
      ? name !== source.name || color !== (source.color ?? defaultColor)
      : targetName || targetColor !== null),
  );
  const normalizedTargetName = targetName.trim().toLocaleLowerCase();
  const existingTarget = tags.find((tag) => tag.name === normalizedTargetName);
  const resultColor =
    targetColor ??
    (targetKind === 'existing' ? (existingTarget?.color ?? null) : (source?.color ?? defaultColor));
  const sameTarget = normalizedTargetName === source?.name;
  const validTarget = Boolean(
    targetName.trim() && (targetKind === 'existing' ? existingTarget : !existingTarget),
  );
  const filtered = [...tags]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((tag) => tag.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const visible = source && !filtered.includes(source) ? [source, ...filtered] : filtered;

  function openEditor(tag: Tag, nextMode: 'edit' | 'merge') {
    if (dirty && !window.confirm(`Discard unsaved changes to “${source!.name}”?`)) return;
    setEditing(tag.name);
    setMode(nextMode);
    setName(tag.name);
    setColor(tag.color ?? defaultColor);
    setTargetKind('existing');
    setTargetName('');
    setTargetColor(null);
    setError('');
  }
  function cancel() {
    setEditing(null);
    setError('');
  }
  async function request(url: string, method: string, body: unknown, operation: Operation) {
    setPending(operation);
    setError('');
    setFailedOperation(operation);
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
      if (!response.ok) throw new Error(payload.error?.message ?? 'We could not save that tag.');
      return payload;
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'We could not reach the recipe server. Try again.';
      setError(message);
      showToast(message, 'error');
      return null;
    } finally {
      setPending(null);
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
    setTags((current) => [...current, payload.tag!]);
    setNewName('');
    showToast('Tag added.', 'success');
    router.refresh();
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!source) return;
    const merge = mode === 'merge' && !sameTarget;
    const payload = await request(
      `/api/v1/tags/${encodeURIComponent(source.name)}${merge ? '/merge' : ''}`,
      merge ? 'POST' : 'PATCH',
      mode === 'edit'
        ? { name, color }
        : merge
          ? { targetName: normalizedTargetName, targetColor: resultColor ?? '' }
          : { name: source.name, color: resultColor ?? '' },
      { type: merge ? 'merge' : 'update', name: source.name },
    );
    if (!payload?.tag) return;
    setTags((current) => [
      ...current.filter((tag) => tag.name !== source.name && tag.name !== payload.tag!.name),
      payload.tag!,
    ]);
    showToast(
      merge ? `${source.name} merged into ${payload.tag.name}.` : 'Tag updated.',
      'success',
    );
    cancel();
    router.refresh();
  }
  async function remove(tag: Tag) {
    if (
      !window.confirm(
        `Remove “${tag.name}” from ${tag.usageCount} recipe${tag.usageCount === 1 ? '' : 's'}? Only tag assignments are removed; recipes stay in the cookbook.`,
      )
    )
      return;
    const payload = await request(
      `/api/v1/tags/${encodeURIComponent(tag.name)}`,
      'DELETE',
      undefined,
      { type: 'remove', name: tag.name },
    );
    if (!payload) return;
    setTags((current) => current.filter((candidate) => candidate.name !== tag.name));
    if (editing === tag.name) cancel();
    showToast(`${tag.name} removed.`, 'success');
    router.refresh();
  }
  return (
    <main className="workspace-page">
      <PageHeader
        title="Tags"
        description="Organize recipes with shared names and colors."
        toolbarRight={<RecipebookNav current="tags" />}
      />
      <details className={styles.create} open={tags.length === 0 || undefined}>
        <summary>
          <Plus size={17} aria-hidden="true" /> Add a tag
        </summary>
        <form className="tag-create-form" onSubmit={create}>
          <label>
            <span>Tag name</span>
            <input
              maxLength={40}
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
            disabled={Boolean(pending) || !newName.trim()}
            aria-busy={pending?.type === 'create'}
          >
            {pending?.type === 'create' ? <ButtonSpinner /> : <Plus size={16} />}
            {pending?.type === 'create' ? 'Adding…' : 'Add tag'}
          </button>
        </form>
      </details>
      {error && failedOperation?.type === 'create' ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.search}>
        <label>
          <span>Find tags</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tag names"
          />
        </label>
        <span role="status">
          {filtered.length} of {tags.length} tags
        </span>
        {search ? (
          <button className="text-button" onClick={() => setSearch('')}>
            Clear search
          </button>
        ) : null}
      </div>
      {source && !filtered.includes(source) ? (
        <p className="muted">Your current edit stays visible while you search.</p>
      ) : null}
      <section className={styles.list} aria-label="Household tags">
        {visible.map((tag) => (
          <article className={styles.row} key={tag.name}>
            <div className={styles.summary}>
              <span
                className="tag-swatch"
                style={{ backgroundColor: tag.color ?? defaultColor }}
                aria-hidden="true"
              />
              <div className={styles.identity}>
                <strong>{tag.name}</strong>
                <small>
                  {tag.usageCount} recipe{tag.usageCount === 1 ? '' : 's'}
                </small>
              </div>
              <button
                className="text-button"
                disabled={Boolean(pending)}
                aria-label={`Edit ${tag.name}`}
                onClick={() => openEditor(tag, 'edit')}
              >
                Edit
              </button>
              <details className={styles.more}>
                <summary>
                  More<span className="sr-only"> actions for {tag.name}</span>
                </summary>
                <div>
                  <button
                    className="text-button"
                    disabled={Boolean(pending)}
                    onClick={(event) => {
                      openEditor(tag, 'merge');
                      event.currentTarget.closest('details')?.removeAttribute('open');
                    }}
                  >
                    <Merge size={16} /> Merge
                  </button>
                  <button
                    className="text-button"
                    disabled={Boolean(pending)}
                    onClick={() => void remove(tag)}
                  >
                    <Trash2 size={16} /> Remove
                  </button>
                </div>
              </details>
            </div>
            {editing === tag.name ? (
              <form className={styles.editor} onSubmit={save}>
                {mode === 'edit' ? (
                  <>
                    <label className={styles.name}>
                      <span>Rename {tag.name}</span>
                      <input
                        maxLength={40}
                        value={name}
                        disabled={Boolean(pending)}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Color for {tag.name}</span>
                      <input
                        type="color"
                        value={color}
                        disabled={Boolean(pending)}
                        onChange={(event) => setColor(event.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <h2 className={styles.name}>Merge {tag.name}</h2>
                    <label className={styles.name}>
                      <span>Destination</span>
                      <select
                        value={targetKind}
                        disabled={Boolean(pending)}
                        onChange={(event) => {
                          setTargetKind(event.target.value);
                          setTargetName('');
                          setTargetColor(null);
                        }}
                      >
                        <option value="existing">Existing tag</option>
                        <option value="new">Create new target</option>
                      </select>
                    </label>
                    <label className={styles.name}>
                      <span>
                        {targetKind === 'existing' ? 'Find an existing target' : 'New target name'}
                      </span>
                      <input
                        aria-label={`Merge ${tag.name} into`}
                        list={targetKind === 'existing' ? 'merge-target-tags' : undefined}
                        maxLength={40}
                        value={targetName}
                        disabled={Boolean(pending)}
                        onChange={(event) => {
                          setTargetName(event.target.value);
                          setTargetColor(null);
                        }}
                      />
                    </label>
                    <datalist id="merge-target-tags">
                      {tags.map((target) => (
                        <option value={target.name} key={target.name} />
                      ))}
                    </datalist>
                    {targetName.trim() ? (
                      <div className={styles.preview}>
                        <strong>
                          {sameTarget
                            ? `Edit ${tag.name}`
                            : `Merge ${tag.name} into ${normalizedTargetName}`}
                        </strong>
                        <p>
                          {sameTarget
                            ? 'This is the same tag. Only its color will change.'
                            : `${tag.usageCount} recipe assignments will move to ${targetKind === 'existing' ? 'the existing' : 'a new'} target. The source tag will be removed; recipes are preserved.`}
                        </p>
                        <span
                          className="tag-swatch"
                          style={{ backgroundColor: resultColor ?? defaultColor }}
                          aria-hidden="true"
                        />{' '}
                        Result: {normalizedTargetName}
                        {resultColor ? ` · ${resultColor}` : ' · default color'}
                        {!validTarget ? (
                          <p className="form-error">
                            {targetKind === 'existing'
                              ? 'Choose a listed tag, or select Create new target.'
                              : 'This tag already exists. Choose Existing tag to use it.'}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <label>
                      <span>Resulting color</span>
                      <input
                        type="color"
                        value={resultColor ?? defaultColor}
                        disabled={Boolean(pending)}
                        onChange={(event) => setTargetColor(event.target.value)}
                      />
                    </label>
                    {targetColor ? (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setTargetColor(null)}
                      >
                        Use target color
                      </button>
                    ) : null}
                  </>
                )}
                <div className={styles.actions}>
                  <button
                    className="primary-button compact"
                    disabled={
                      Boolean(pending) || (mode === 'edit' ? !dirty || !name.trim() : !validTarget)
                    }
                    aria-busy={pending?.name === tag.name}
                  >
                    {pending?.name === tag.name ? <ButtonSpinner /> : <Save size={16} />}
                    {pending?.name === tag.name
                      ? 'Saving…'
                      : mode === 'edit' || sameTarget
                        ? 'Save'
                        : 'Confirm merge'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={Boolean(pending)}
                    onClick={cancel}
                  >
                    Cancel
                  </button>
                  {dirty && !pending ? <small>Unsaved changes</small> : null}
                </div>
              </form>
            ) : null}
            {error && failedOperation?.name === tag.name ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
          </article>
        ))}
        {!filtered.length ? (
          <p className="muted">
            {search
              ? 'No tags match your search.'
              : 'Add your first tag here or while editing a recipe.'}
          </p>
        ) : null}
      </section>
    </main>
  );
}
