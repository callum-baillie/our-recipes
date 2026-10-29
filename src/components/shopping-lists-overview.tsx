'use client';

import { ToastNotice } from './toast-provider';

import { DismissibleDetails } from './dismissible-details';
import { PageHeader } from '@/components/page-header';

import {
  Archive,
  ArrowDownUp,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  MoreHorizontal,
  Package,
  PieChart,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { AiSummaryCards, type AiSummaryCardData } from '@/components/ai-summary-cards';
import { useToast } from '@/components/toast-provider';
import { ButtonSpinner } from '@/components/skeleton';
import { shoppingListSourceLabel } from '@/lib/domain/planning';
import type { ShoppingListSummary } from '@/lib/services/planning-service';

import styles from './shopping-lists-overview.module.css';

type ListFilter = 'all' | 'active' | 'planned' | 'completed' | 'archived';
type ListSort = 'updated' | 'name' | 'remaining';

const FILTERS: Array<{ key: ListFilter; label: string }> = [
  { key: 'all', label: 'Current lists' },
  { key: 'active', label: 'Items remaining' },
  { key: 'planned', label: 'From plans' },
  { key: 'completed', label: 'All items sourced' },
  { key: 'archived', label: 'Archived' },
];

function remainingItems(list: ShoppingListSummary) {
  return list.openCount;
}

function sourceFamily(list: ShoppingListSummary) {
  if (list.sourceKind === 'planner_all') return 'planned';
  if (list.sourceKind === 'pantry_all' || list.sourceKind === 'pantry_missing') return 'pantry';
  return 'manual';
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

export function ShoppingListsOverview({
  lists,
  initialAiSummary,
}: {
  lists: ShoppingListSummary[];
  initialAiSummary?: AiSummaryCardData | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [makeNextShop, setMakeNextShop] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [sort, setSort] = useState<ListSort>('updated');
  const [descending, setDescending] = useState(true);
  const [nameError, setNameError] = useState('');
  const [createError, setCreateError] = useState('');
  const [renameError, setRenameError] = useState('');
  const [listErrors, setListErrors] = useState<Record<string, string>>({});
  const [copyId, setCopyId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeLists = lists.filter((list) => !list.archivedAt);
  const archivedLists = lists.filter((list) => list.archivedAt);
  const plannedLists = activeLists.filter((list) => list.sourceKind !== 'manual');
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
      if (filter === 'planned') return list.sourceKind !== 'manual';
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
    if (busy) return;
    if (!name.trim()) {
      setNameError('Enter a list name.');
      return;
    }
    setNameError('');
    setCreateError('');
    setBusy('create');
    setPendingAction('create');
    try {
      const response = await fetch('/api/v1/shopping-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'manual', name, makeAutomaticRestockTarget: makeNextShop }),
      });
      const body = (await response.json().catch(() => null)) as {
        list?: { id: string };
        error?: { message?: string };
      } | null;
      if (!response.ok || !body?.list) {
        setCreateError(body?.error?.message ?? 'The list could not be created.');
        return;
      }
      showToast('Shopping list created.', 'success');
      router.push(`/lists/${body.list.id}`);
    } catch {
      setCreateError('The list could not be created. Check the connection and try again.');
    } finally {
      setBusy(null);
      setPendingAction(null);
    }
  }

  async function manage(
    listId: string,
    action: 'rename' | 'archive' | 'restore' | 'duplicate' | 'set_restock_target' | 'complete',
    nextName?: string,
  ) {
    if (busy) return;
    if (action === 'rename' && !nextName?.trim()) {
      setRenameError('Enter a list name.');
      return;
    }
    setRenameError('');
    setListErrors((current) => ({ ...current, [listId]: '' }));
    setBusy(listId);
    setPendingAction(action);
    try {
      const response = await fetch(`/api/v1/shopping-lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'rename' ? { action, name: nextName } : { action }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setListErrors((current) => ({
          ...current,
          [listId]: result?.error?.message ?? 'The list change could not be saved.',
        }));
        showToast(result?.error?.message ?? 'The list change could not be saved.', 'error');
        return;
      }
      showToast(
        action === 'duplicate'
          ? 'Shopping list duplicated.'
          : action === 'archive'
            ? 'Shopping list archived.'
            : action === 'restore'
              ? 'Shopping list restored.'
              : action === 'set_restock_target'
                ? 'Next shop updated.'
                : action === 'complete'
                  ? 'Shopping trip completed.'
                  : 'Shopping list renamed.',
        'success',
      );
      if (action === 'duplicate' && result?.list?.id) setCopyId(result.list.id);
      document
        .querySelectorAll<HTMLDetailsElement>(`.${styles.cardActions} details[open]`)
        .forEach((details) => {
          details.open = false;
          details.querySelector('summary')?.focus();
        });
      setEditingId(null);
      router.refresh();
    } catch {
      setListErrors((current) => ({
        ...current,
        [listId]: 'The list change could not be saved. Check the connection and try again.',
      }));
    } finally {
      setBusy(null);
      setPendingAction(null);
    }
  }

  async function remove(listId: string) {
    if (busy) return;
    setBusy(listId);
    setPendingAction('delete');
    setListErrors((current) => ({ ...current, [listId]: '' }));
    try {
      const response = await fetch(`/api/v1/shopping-lists/${listId}`, { method: 'DELETE' });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        setListErrors((current) => ({
          ...current,
          [listId]: body?.error?.message ?? 'The list could not be deleted. Archive it instead.',
        }));
        return;
      }
      showToast('Shopping list deleted.', 'success');
      router.refresh();
    } catch {
      setListErrors((current) => ({
        ...current,
        [listId]: 'The list could not be deleted. Check the connection and try again.',
      }));
    } finally {
      setBusy(null);
      setPendingAction(null);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Shopping lists"
        eyebrow="HOUSEHOLD SHOPPING"
        description="Make a list, shop by aisle, and bring your groceries into the pantry."
      />
      {copyId && (
        <p role="status">
          List duplicated.{' '}
          <Link className="inline-link" href={`/lists/${copyId}`}>
            Open the copy
          </Link>
        </p>
      )}
      <div className={styles.layout}>
        <div className={styles.mainColumn}>
          {activeLists.find((list) => list.isAutomaticRestockTarget)
            ? (() => {
                const next = activeLists.find((list) => list.isAutomaticRestockTarget)!;
                return (
                  <Link href={`/lists/${next.id}`} className={styles.nextShopCard}>
                    <span>
                      <small>YOUR NEXT SHOP</small>
                      <strong>{next.name}</strong>
                      <span>
                        {next.openCount} item{next.openCount === 1 ? '' : 's'} left to pick up
                      </span>
                    </span>
                    <span>
                      Open list <ArrowRight size={18} />
                    </span>
                  </Link>
                );
              })()
            : null}
          <details className={styles.createPanel} open={!lists.length}>
            <summary className="recipe-disclosure-summary">
              <span>New list</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <h2 className="sr-only" id="create-list-heading">
              Create a shopping list
            </h2>
            <div className={styles.createTabs}>
              <span>
                <ClipboardList size={18} aria-hidden="true" /> Manual list
              </span>
              <Link href="/planner">
                <CalendarDays size={18} aria-hidden="true" /> Open planner
              </Link>
            </div>
            <form id="new-shopping-list" className={styles.createForm} onSubmit={createList}>
              <label>
                <span>List name</span>
                <input
                  value={name}
                  disabled={busy === 'create'}
                  maxLength={120}
                  placeholder="e.g. Weekend market"
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'new-list-error' : undefined}
                  required
                  onChange={(event) => setName(event.target.value)}
                />
                {nameError && (
                  <small id="new-list-error" role="alert">
                    {nameError}
                  </small>
                )}
              </label>
              <label className={styles.nextShopOption}>
                <input
                  type="checkbox"
                  checked={makeNextShop}
                  disabled={busy === 'create'}
                  onChange={(event) => setMakeNextShop(event.target.checked)}
                />{' '}
                <span>
                  Use as Next shop<small>New automatic-restock items go to this list.</small>
                </span>
              </label>
              {createError && <ToastNotice tone="error">{createError}</ToastNotice>}
              <button type="submit" aria-busy={busy === 'create'} disabled={busy !== null}>
                {busy === 'create' ? <ButtonSpinner /> : null}
                {busy === 'create' ? 'Creating…' : 'Create list'}
              </button>
            </form>
          </details>

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
                  <option value="updated">
                    {descending ? 'Recently updated' : 'Oldest update'}
                  </option>
                  <option value="name">{descending ? 'Name Z–A' : 'Name A–Z'}</option>
                  <option value="remaining">
                    {descending ? 'Most remaining' : 'Fewest remaining'}
                  </option>
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

            <p className={styles.resultCount}>
              {visibleLists.length} matching {visibleLists.length === 1 ? 'list' : 'lists'}
              {(query || filter !== 'all') && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </button>
              )}
            </p>
            {visibleLists.length ? (
              <div className={styles.cardGrid}>
                {visibleLists.map((list) => {
                  const sourcedPercent = list.itemCount
                    ? Math.round((list.sourcedCount / list.itemCount) * 100)
                    : 0;
                  const kind = sourceFamily(list);
                  return (
                    <article className={styles.listCard} data-source={kind} key={list.id}>
                      <Link className={styles.cardBody} href={`/lists/${list.id}`} scroll>
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
                          <span>{shoppingListSourceLabel(list.sourceKind)}</span>
                        </div>
                        <h3>{list.name}</h3>
                        {list.isAutomaticRestockTarget ? <strong>Next shop</strong> : null}
                        <p>
                          <strong>
                            {list.sourcedCount} of {list.itemCount} sourced
                          </strong>{' '}
                          · {list.needsAttentionCount} to find
                          {list.inCartCount ? ` · ${list.inCartCount} in cart` : ''}
                        </p>
                        <div className={styles.progressRow}>
                          <span aria-label={`${sourcedPercent}% of items sourced`}>
                            <i style={{ width: `${sourcedPercent}%` }} />
                          </span>
                        </div>
                        <dl>
                          <div>
                            <dt>
                              <Clock3 size={15} aria-hidden="true" /> Updated
                            </dt>
                            <dd>{updatedLabel(list.updatedAt)}</dd>
                          </div>
                        </dl>
                      </Link>

                      {listErrors[list.id] && (
                        <ToastNotice tone="error">{listErrors[list.id]}</ToastNotice>
                      )}
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
                            <input
                              name="name"
                              defaultValue={list.name}
                              maxLength={120}
                              required
                              autoFocus
                              disabled={busy === list.id}
                              aria-invalid={!!renameError}
                              aria-describedby={renameError ? `rename-error-${list.id}` : undefined}
                            />
                            {renameError && (
                              <small id={`rename-error-${list.id}`} role="alert">
                                {renameError}
                              </small>
                            )}
                          </label>
                          <button
                            type="submit"
                            aria-busy={busy === list.id && pendingAction === 'rename'}
                            disabled={busy !== null}
                          >
                            {busy === list.id && pendingAction === 'rename' ? (
                              <ButtonSpinner />
                            ) : null}
                            {busy === list.id && pendingAction === 'rename' ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            disabled={busy === list.id}
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <footer className={styles.cardActions}>
                          {!list.isAutomaticRestockTarget && !list.archivedAt ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              aria-busy={busy === list.id && pendingAction === 'set_restock_target'}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Make this the Next shop? Untouched recurring amounts will move from the current target.',
                                  )
                                ) {
                                  void manage(list.id, 'set_restock_target');
                                }
                              }}
                            >
                              {busy === list.id && pendingAction === 'set_restock_target' ? (
                                <ButtonSpinner />
                              ) : null}
                              {busy === list.id && pendingAction === 'set_restock_target'
                                ? 'Updating…'
                                : 'Make Next shop'}
                            </button>
                          ) : null}
                          <DismissibleDetails
                            className={styles.cardMenu}
                            viewportPanel
                            summaryAriaLabel={`More actions for ${list.name}`}
                            summary={<MoreHorizontal size={20} aria-hidden="true" />}
                          >
                            <div>
                              {' '}
                              <button type="button" onClick={() => setEditingId(list.id)}>
                                Rename
                              </button>
                              <button
                                type="button"
                                aria-busy={busy === list.id && pendingAction === 'duplicate'}
                                disabled={busy !== null}
                                onClick={() => void manage(list.id, 'duplicate')}
                              >
                                {busy === list.id && pendingAction === 'duplicate' ? (
                                  <ButtonSpinner />
                                ) : null}
                                {busy === list.id && pendingAction === 'duplicate'
                                  ? 'Duplicating…'
                                  : 'Duplicate'}
                              </button>
                              <button
                                type="button"
                                aria-busy={
                                  busy === list.id &&
                                  pendingAction === (list.archivedAt ? 'restore' : 'archive')
                                }
                                disabled={busy !== null}
                                onClick={() =>
                                  void manage(list.id, list.archivedAt ? 'restore' : 'archive')
                                }
                              >
                                {busy === list.id &&
                                pendingAction === (list.archivedAt ? 'restore' : 'archive') ? (
                                  <ButtonSpinner />
                                ) : (
                                  <Archive size={15} aria-hidden="true" />
                                )}
                                {busy === list.id &&
                                pendingAction === (list.archivedAt ? 'restore' : 'archive')
                                  ? list.archivedAt
                                    ? 'Restoring…'
                                    : 'Archiving…'
                                  : list.archivedAt
                                    ? 'Restore'
                                    : 'Archive'}
                              </button>
                              {list.isAutomaticRestockTarget ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy !== null}
                                    aria-busy={busy === list.id && pendingAction === 'complete'}
                                    onClick={() => void manage(list.id, 'complete')}
                                  >
                                    {busy === list.id && pendingAction === 'complete' ? (
                                      <ButtonSpinner />
                                    ) : (
                                      <CheckCircle2 size={15} aria-hidden="true" />
                                    )}{' '}
                                    {busy === list.id && pendingAction === 'complete'
                                      ? 'Completing…'
                                      : 'Complete trip'}
                                  </button>
                                  <small className={styles.tripHelp}>
                                    Moves cart items to Sourced, archives this list and clears Next
                                    shop. Unresolved items stay unresolved.
                                  </small>
                                </>
                              ) : null}
                              <button
                                type="button"
                                aria-busy={busy === list.id && pendingAction === 'delete'}
                                disabled={busy !== null}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete “${list.name}”? This cannot be undone. Archive it instead if you may need it later.`,
                                    )
                                  ) {
                                    void remove(list.id);
                                  }
                                }}
                              >
                                {busy === list.id && pendingAction === 'delete' ? (
                                  <ButtonSpinner />
                                ) : (
                                  <Trash2 size={15} aria-hidden="true" />
                                )}{' '}
                                {busy === list.id && pendingAction === 'delete'
                                  ? 'Deleting…'
                                  : 'Delete'}
                              </button>
                            </div>
                          </DismissibleDetails>
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
                  {!activeLists.length && archivedLists.length > 0 && filter !== 'archived' && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setQuery('');
                        setFilter('archived');
                      }}
                    >
                      View archived lists
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className={styles.rail} aria-label="Shopping list insights">
          <section className={styles.railPanel}>
            <h2>
              <PieChart size={19} aria-hidden="true" /> Household totals
            </h2>
            <dl className={styles.insights}>
              <div>
                <dt>
                  <Package size={17} aria-hidden="true" /> Current lists
                </dt>
                <dd>{activeLists.length}</dd>
              </div>
              <div>
                <dt>
                  <Clock3 size={17} aria-hidden="true" /> Open item rows
                </dt>
                <dd>{remainingCount}</dd>
              </div>
              <div>
                <dt>
                  <CalendarDays size={17} aria-hidden="true" /> From plans
                </dt>
                <dd>{plannedLists.length}</dd>
              </div>
              <div>
                <dt>
                  <CheckCircle2 size={17} aria-hidden="true" /> All items sourced
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
          </section>

          {lists.length ? (
            <AiSummaryCards
              domain="shopping_lists"
              placement="rail"
              initialSummary={initialAiSummary}
            />
          ) : null}

          <section className={styles.railPanel}>
            <h2>
              <Clock3 size={19} aria-hidden="true" /> Recently updated lists
            </h2>
            {recentLists.length ? (
              <ul className={styles.activityList}>
                {recentLists.map((list) => (
                  <li key={list.id}>
                    <span data-source={sourceFamily(list)} aria-hidden="true">
                      {sourceFamily(list) === 'planned' ? (
                        <CalendarDays size={15} />
                      ) : (
                        <ClipboardList size={15} />
                      )}
                    </span>
                    <p>
                      <Link href={`/lists/${list.id}`} scroll>
                        {list.name}
                      </Link>
                      <small>
                        {shoppingListSourceLabel(list.sourceKind)}
                        {` · ${list.needsAttentionCount} to find`}
                      </small>
                    </p>
                    <time dateTime={new Date(list.updatedAt).toISOString()}>
                      {updatedLabel(list.updatedAt)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.railEmpty}>Recently updated lists appear here.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
