'use client';

import { DismissibleDetails } from './dismissible-details';
import { Archive, Copy, List, MoreHorizontal, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { useToast } from '@/components/toast-provider';

import styles from './shopping-list-editor.module.css';

type ManageAction = 'archive' | 'duplicate';

export function ShoppingListMobileMenu({ listId, listName }: { listId: string; listName: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [name, setName] = useState(listName);
  const [busy, setBusy] = useState('');
  const pending = useRef(false);
  const [nameError, setNameError] = useState('');
  const [actionError, setActionError] = useState('');

  async function request(body: { action: 'rename'; name: string } | { action: ManageAction }) {
    const response = await fetch(`/api/v1/shopping-lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => null)) as {
      list?: { id: string; name: string };
      error?: { message?: string };
    } | null;
    if (!response.ok || !result?.list)
      throw new Error(result?.error?.message ?? 'The list change could not be saved.');
    return result.list;
  }

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!name.trim()) {
      setNameError('Enter a list name.');
      return;
    }
    if (name.trim() === listName) return;
    pending.current = true;
    setNameError('');
    setActionError('');
    setBusy('rename');
    try {
      await request({ action: 'rename', name: name.trim() });
      if (detailsRef.current) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector('summary')?.focus();
      }
      showToast('List renamed.', 'success');
      router.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The list could not be renamed.');
    } finally {
      pending.current = false;
      setBusy('');
    }
  }

  async function manage(action: ManageAction) {
    if (pending.current) return;
    if (
      action === 'archive' &&
      !window.confirm('Archive this shopping list? You can restore it from the Lists page.')
    )
      return;
    pending.current = true;
    setActionError('');
    setBusy(action);
    try {
      const result = await request({ action });
      if (detailsRef.current) {
        detailsRef.current.open = false;
        detailsRef.current.querySelector('summary')?.focus();
      }
      if (action === 'duplicate') router.push(`/lists/${result.id}`);
      else router.push('/lists');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The list change could not be saved.',
      );
    } finally {
      pending.current = false;
      setBusy('');
    }
  }

  return (
    <DismissibleDetails
      className={styles.mobileListMenu}
      detailsRef={detailsRef}
      viewportPanel
      summaryAriaLabel="More list options"
      expandedSummaryAriaLabel="Close list options"
      summary={<MoreHorizontal />}
      expandedSummary={<X />}
    >
      <div className={styles.mobileListMenuPanel}>
        <strong>List options</strong>
        <form onSubmit={(event) => void rename(event)}>
          <label htmlFor="mobile-list-name">List name</label>
          <div>
            <input
              id="mobile-list-name"
              value={name}
              maxLength={120}
              disabled={!!busy}
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'mobile-list-name-error' : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setNameError('');
              }}
            />
            <button type="submit" disabled={!!busy || name.trim() === listName}>
              {busy === 'rename' ? 'Saving name…' : 'Save name'}
            </button>
          </div>
          {nameError && (
            <p role="alert" id="mobile-list-name-error">
              {nameError}
            </p>
          )}
        </form>
        {actionError && <p role="alert">{actionError}</p>}
        {busy && (
          <p role="status">
            {busy === 'archive'
              ? 'Archiving list…'
              : busy === 'duplicate'
                ? 'Duplicating list…'
                : 'Saving list name…'}
          </p>
        )}
        <Link href="/settings/lists">
          <Settings />
          Shopping settings
        </Link>
        <button type="button" disabled={Boolean(busy)} onClick={() => void manage('duplicate')}>
          <Copy />
          {busy === 'duplicate' ? 'Duplicating…' : 'Duplicate list'}
        </button>
        <Link href="/lists">
          <List />
          All shopping lists
        </Link>
        <button
          className={styles.archiveMenuAction}
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void manage('archive')}
        >
          <Archive />
          {busy === 'archive' ? 'Archiving…' : 'Archive list'}
        </button>
      </div>
    </DismissibleDetails>
  );
}
