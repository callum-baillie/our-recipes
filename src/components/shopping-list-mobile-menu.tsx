'use client';

import { Archive, Copy, List, MoreHorizontal, Settings } from 'lucide-react';
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
    if (!name.trim() || name.trim() === listName) return;
    setBusy('rename');
    try {
      await request({ action: 'rename', name: name.trim() });
      detailsRef.current?.removeAttribute('open');
      showToast('List renamed.', 'success');
      router.refresh();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The list could not be renamed.', 'error');
    } finally {
      setBusy('');
    }
  }

  async function manage(action: ManageAction) {
    if (
      action === 'archive' &&
      !window.confirm('Archive this shopping list? You can restore it from the Lists page.')
    )
      return;
    setBusy(action);
    try {
      const result = await request({ action });
      detailsRef.current?.removeAttribute('open');
      if (action === 'duplicate') router.push(`/lists/${result.id}`);
      else router.push('/lists');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'The list change could not be saved.',
        'error',
      );
      setBusy('');
    }
  }

  return (
    <details className={styles.mobileListMenu} ref={detailsRef}>
      <summary aria-label="More list options">
        <MoreHorizontal />
      </summary>
      <div className={styles.mobileListMenuPanel}>
        <strong>List options</strong>
        <form onSubmit={(event) => void rename(event)}>
          <label htmlFor="mobile-list-name">List name</label>
          <div>
            <input
              id="mobile-list-name"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="submit"
              disabled={busy === 'rename' || !name.trim() || name.trim() === listName}
            >
              Save
            </button>
          </div>
        </form>
        <Link href="/settings/lists">
          <Settings />
          Shopping settings
        </Link>
        <button type="button" disabled={Boolean(busy)} onClick={() => void manage('duplicate')}>
          <Copy />
          Duplicate list
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
          Archive list
        </button>
      </div>
    </details>
  );
}
