'use client';

import {
  Archive,
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  MoreHorizontal,
  Package,
  PieChart,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { ShoppingListSummary } from '@/lib/services/planning-service';

import styles from './shopping-lists-overview.module.css';

type ListFilter = 'all' | 'active' | 'planned' | 'completed' | 'archived';
type ListSort = 'updated' | 'name' | 'remaining';

const FILTERS: Array<{ key: ListFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'planned', label: 'Planned' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

function remainingItems(list: ShoppingListSummary) {
  return Math.max(0, list.itemCount - list.checkedCount);
}

function sourceKind(list: ShoppingListSummary) {
  if (list.sourceMode === 'planned_all' || list.weekStart) return 'planned';
  if (list.sourceMode === 'pantry_all' || list.sourceMode === 'pantry_missing') return 'pantry';
  return 'manual';
}

function sourceLabel(list: ShoppingListSummary) {
  const kind = sourceKind(list);
  if (kind === 'planned') return 'FROM PLANNER';
  if (kind === 'pantry') return 'PANTRY LIST';
  return 'MANUAL LIST';
}

function updatedLabel(value: Date | string | number) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Recently';
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(timestamp),
  );
}

export function ShoppingListsOverview({ lists }: { lists: ShoppingListSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [sort, setSort] = useState<ListSort>('updated');
  const [descending, setDescending] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeLists = lists.filter((list) => !list.archivedAt);
  const archivedLists = lists.filter((list) => list.archivedAt);
  const plannedLists = activeLists.filter((list) => sourceKind(list) === 'planned');
  const completedLists = activeLists.filter(
    (list) => list.itemCount > 0 && remainingItems(list) === 0,
  );
  const remainingCount = activeLists.reduce((total, list) => total + remainingItems(list), 0);

  const visibleLists = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selected = lists.filter((list) => {
      const remaining = remainingItems(list);
      const matchesQuery =
        !normalizedQuery || list.name.toLocaleLowerCase().includes(normalizedQuery);
      if (!matchesQuery) return false;
      if (filter === 'archived') return Boolean(list.archivedAt);
      if (list.archivedAt) return false;
      if (filter === 'active') return remaining > 0;
      if (filter === 'planned') return sourceKind(list) === 'planned';
      if (filter === 'completed') return list.itemCount > 0 && remaining === 0;
      return true;
    });
    return selected.sort((a, b) => {
      let result = 0;
      if (sort === 'name') result = a.name.localeCompare(b.name);
      if (sort === 'remaining') result = remainingItems(a) - remainingItems(b);
      if (sort === 'updated')
        result = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      return descending ? -result : result;
    });
  }, [descending, filter, lists, query, sort]);

  const recentLists = [...lists]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 4);

  async function createList(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create');
    setError('');
    const response = await fetch('/api/v1/shopping-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const body = (await response.json().catch(() => null)) as { list?: { id: string } } | null;
    setBusy(null);
    if (!response.ok || !body?.list) {
      setError('The list could not be created.');
      return;
    }
    router.push(`/lists/${body.list.id}`);
  }

  async function manage(
    listId: string,
    action: 'rename' | 'archive' | 'restore' | 'duplicate',
    nextName?: string,
  ) {
    setBusy(listId);
    setError('');
    const response = await fetch(`/api/v1/shopping-lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'rename' ? { action, name: nextName } : { action }),
    });
    setBusy(null);
    if (!response.ok) {
      setError('The list change could not be saved.');
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(listId: string) {
    setBusy(listId);
    setError('');
    const response = await fetch(`/api/v1/shopping-lists/${listId}`, { method: 'DELETE' });
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    setBusy(null);
    if (!response.ok) {
      setError(body?.error?.message ?? 'The list could not be deleted. Archive it instead.');
      return;
    }
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          <header className={styles.hero}>
            <div>
              <p className={styles.eyebrow}>SHOPPING LISTS</p>
              <h1>From the plan to the pantry.</h1>
            </div>
            <p>
              Every generated list stays separate, so changes you make are always yours to keep.
            </p>
          </header>

          <section className={styles.createPanel} aria-labelledby="create-list-heading">
            <h2 className="sr-only" id="create-list-heading">
              Create a shopping list
            </h2>
            <div className={styles.createTabs} aria-label="Shopping list creation options">
              <button type="button" aria-pressed="true">
                <ClipboardList size={18} aria-hidden="true" /> Manual list
              </button>
              <Link href="/planner">
                <CalendarDays size={18} aria-hidden="true" /> From planner
              </Link>
            </div>
            <form id="new-shopping-list" className={styles.createForm} onSubmit={createList}>
              <label>
                <span className="sr-only">Give your list a name</span>
                <input
                  value={name}
                  maxLength={120}
                  placeholder="Give your list a name..."
                  required
                  onChange={(event) => setName(event.target.value)}
                />
                <small>e.g. Weekend market</small>
              </label>
              <button type="submit" disabled={busy === 'create'}>
                {busy === 'create' ? 'Creating…' : 'Create list'}
              </button>
            </form>
            <Link className={styles.plannerShortcut} href="/planner">
              <Sparkles size={17} aria-hidden="true" /> Generate a list from your upcoming meals{' '}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </section>

          <section className={styles.listWorkspace} aria-labelledby="shopping-lists-heading">
            <h2 className="sr-only" id="shopping-lists-heading">
              Your shopping lists
            </h2>
            <div className={styles.toolbar}>
              <label className={styles.searchField}>
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Search lists</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search lists..."
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className={styles.filters} aria-label="Filter shopping lists">
                {FILTERS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={filter === item.key}
                    onClick={() => setFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className={styles.sortField}>
                <span>Sort by:</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as ListSort)}>
                  <option value="updated">Updated</option>
                  <option value="name">Name</option>
                  <option value="remaining">Remaining</option>
                </select>
              </label>
              <button
                className={styles.directionButton}
                type="button"
                aria-label={descending ? 'Sort ascending' : 'Sort descending'}
                onClick={() => setDescending((current) => !current)}
              >
                <ArrowDownUp size={18} aria-hidden="true" />
              </button>
            </div>

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}

            {visibleLists.length ? (
              <div className={styles.cardGrid}>
                {visibleLists.map((list) => {
                  const remaining = remainingItems(list);
                  const remainingPercent = list.itemCount
                    ? Math.round((remaining / list.itemCount) * 100)
                    : 0;
                  const kind = sourceKind(list);
                  return (
                    <article className={styles.listCard} data-source={kind} key={list.id}>
                      <Link className={styles.cardBody} href={`/lists/${list.id}`}>
                        <div className={styles.cardMeta}>
                          <span className={styles.cardIcon} aria-hidden="true">
                            {kind === 'planned' ? (
                              <CalendarDays size={20} />
                            ) : kind === 'pantry' ? (
                              <Package size={20} />
                            ) : (
                              <ClipboardList size={20} />
                            )}
                          </span>
                          <span>{sourceLabel(list)}</span>
                        </div>
                        <h3>{list.name}</h3>
                        <p>
                          <strong>{remaining}</strong> of {list.itemCount} remaining
                        </p>
                        <div className={styles.progressRow}>
                          <span aria-label={`${remainingPercent}% of items remaining`}>
                            <i style={{ width: `${remainingPercent}%` }} />
                          </span>
                          <b>{remainingPercent}%</b>
                        </div>
                        <dl>
                          <div>
                            <dt>
                              <Package size={15} aria-hidden="true" /> Items
                            </dt>
                            <dd>{list.itemCount}</dd>
                          </div>
                          <div>
                            <dt>
                              <Clock3 size={15} aria-hidden="true" /> Updated
                            </dt>
                            <dd>{updatedLabel(list.updatedAt)}</dd>
                          </div>
                        </dl>
                      </Link>

                      {editingId === list.id ? (
                        <form
                          className={styles.renameForm}
                          onSubmit={(event) => {
                            event.preventDefault();
                            const nextName = new FormData(event.currentTarget).get('name');
                            if (typeof nextName === 'string')
                              void manage(list.id, 'rename', nextName);
                          }}
                        >
                          <label>
                            <span className="sr-only">Rename {list.name}</span>
                            <input name="name" defaultValue={list.name} maxLength={120} required />
                          </label>
                          <button type="submit" disabled={busy === list.id}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <footer className={styles.cardActions}>
                          <button type="button" onClick={() => setEditingId(list.id)}>
                            Rename
                          </button>
                          <button
                            type="button"
                            disabled={busy === list.id}
                            onClick={() => void manage(list.id, 'duplicate')}
                          >
                            Duplicate
                          </button>
                          <details>
                            <summary aria-label={`More actions for ${list.name}`}>
                              <MoreHorizontal size={20} aria-hidden="true" />
                            </summary>
                            <div>
                              <button
                                type="button"
                                disabled={busy === list.id}
                                onClick={() =>
                                  void manage(list.id, list.archivedAt ? 'restore' : 'archive')
                                }
                              >
                                <Archive size={15} aria-hidden="true" />
                                {list.archivedAt ? 'Restore' : 'Archive'}
                              </button>
                              <button
                                type="button"
                                disabled={busy === list.id}
                                onClick={() => void remove(list.id)}
                              >
                                <Trash2 size={15} aria-hidden="true" /> Delete
                              </button>
                            </div>
                          </details>
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <span aria-hidden="true">
                  <ClipboardList size={24} />
                </span>
                <div>
                  <h3>{lists.length ? 'No lists match this view.' : 'No shopping lists yet.'}</h3>
                  <p>
                    {lists.length
                      ? 'Try another filter or search term.'
                      : 'Create a manual list or build one from meals in the planner.'}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className={styles.rail} aria-label="Shopping list insights">
          <section className={styles.railPanel}>
            <h2>
              <PieChart size={19} aria-hidden="true" /> List insights
            </h2>
            <dl className={styles.insights}>
              <div>
                <dt>
                  <Package size={17} aria-hidden="true" /> Active lists
                </dt>
                <dd>{activeLists.length}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={17} aria-hidden="true" /> Items remaining
                </dt>
                <dd>{remainingCount}</dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={17} aria-hidden="true" /> From planner
                </dt>
                <dd>{plannedLists.length}</dd>
              </div>
              <div>
                <dt>
                  <CheckCircle2 size={17} aria-hidden="true" /> Completed
                </dt>
                <dd>{completedLists.length}</dd>
              </div>
              <div>
                <dt>
                  <Archive size={17} aria-hidden="true" /> Archived
                </dt>
                <dd>{archivedLists.length}</dd>
              </div>
            </dl>
            <button className={styles.railLink} type="button" onClick={() => setFilter('all')}>
              View all insights <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>

          <section className={styles.railPanel}>
            <h2>
              <Clock3 size={19} aria-hidden="true" /> Recent activity
            </h2>
            {recentLists.length ? (
              <ul className={styles.activityList}>
                {recentLists.map((list) => (
                  <li key={list.id}>
                    <span data-source={sourceKind(list)} aria-hidden="true">
                      {sourceKind(list) === 'planned' ? (
                        <CalendarDays size={15} />
                      ) : (
                        <ClipboardList size={15} />
                      )}
                    </span>
                    <p>
                      <Link href={`/lists/${list.id}`}>{list.name}</Link>
                      <small>
                        {sourceKind(list) === 'planned'
                          ? 'Generated from planner'
                          : `${remainingItems(list)} items remaining`}
                      </small>
                    </p>
                    <time dateTime={new Date(list.updatedAt).toISOString()}>
                      {updatedLabel(list.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.railEmpty}>Activity appears after you create a list.</p>
            )}
            <button className={styles.railLink} type="button" onClick={() => setFilter('all')}>
              View all activity <ArrowRight size={15} aria-hidden="true" />
            </button>
          </section>

          <section className={`${styles.railPanel} ${styles.plannerPanel}`}>
            <h2>
              <CalendarDays size={19} aria-hidden="true" /> Planner suggestions
            </h2>
            <p>Generate a shopping list from meals already on your plan.</p>
            <Link href="/planner">
              <Sparkles size={16} aria-hidden="true" /> Generate from planner
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
