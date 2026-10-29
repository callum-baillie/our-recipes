'use client';

import { ToastMessage } from './toast-message';
import { useState } from 'react';
import { RotateCcw, ClipboardPaste, Plus } from 'lucide-react';
import type { ShoppingListDetail } from '@/lib/services/planning-service';
import { AsyncSkeleton, ButtonSpinner } from './skeleton';
import styles from './shopping-list-shortcuts.module.css';
type Item = ShoppingListDetail['items'][number];
export function ShoppingListShortcuts({
  listId,
  currentNames,
  onAdded,
}: {
  listId: string;
  currentNames: string[];
  onAdded: (items: Item[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<{ item: string; timesBought: number }[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [hasLoadedRecent, setHasLoadedRecent] = useState(false);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'recent' | 'paste'>('recent');
  async function load() {
    setOpen((value) => !value);
    if (open || loadingRecent || hasLoadedRecent) return;
    setLoadingRecent(true);
    setMessage('');
    try {
      const response = await fetch('/api/v1/shopping-lists/recent-items');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Recent purchases unavailable.');
      setRecent(Array.isArray(body.items) ? body.items : []);
      setHasLoadedRecent(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recent items could not be loaded.');
    } finally {
      setLoadingRecent(false);
    }
  }
  async function add(names: string[], source: 'recent' | 'paste' = 'recent') {
    if (busy) return;
    setBusy(true);
    setPendingAdd(source === 'paste' ? 'paste' : (names[0]?.toLowerCase().trim() ?? null));
    setMessage('');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${listId}/items/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: names }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Items could not be added.');
      onAdded(body.items);
      setMessage(
        `${body.items.length} added${body.skipped ? ` · ${body.skipped} already on the list` : ''}.`,
      );
      setPaste('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check your connection and retry.');
    } finally {
      setBusy(false);
      setPendingAdd(null);
    }
  }
  const names = paste
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
  const active = new Set(currentNames.map((name) => name.toLowerCase().trim()));
  return (
    <section className={styles.section}>
      <button
        className={styles.toggle}
        type="button"
        aria-expanded={open}
        aria-busy={loadingRecent}
        onClick={() => void load()}
      >
        {loadingRecent ? <ButtonSpinner /> : <RotateCcw size={17} />}
        {loadingRecent ? 'Loading recent items…' : 'Buy again & quick add'}
      </button>
      {open && (
        <div className={styles.body} aria-busy={loadingRecent || busy}>
          <div className={styles.tabs}>
            <button
              type="button"
              aria-pressed={mode === 'recent'}
              onClick={() => setMode('recent')}
            >
              <RotateCcw size={16} />
              Buy again
            </button>
            <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')}>
              <ClipboardPaste size={16} />
              Paste a list
            </button>
          </div>
          {mode === 'recent' ? (
            <>
              <p>
                From your household’s recorded purchases. Tap to add; adjust quantities on the list.
              </p>
              {loadingRecent ? (
                <AsyncSkeleton label="Loading recent grocery items" variant="rows" />
              ) : (
                <>
                  <div className={styles.recent}>
                    {recent.map((item) => {
                      const key = item.item.toLowerCase().trim();
                      const adding = pendingAdd === key;
                      return (
                        <button
                          key={item.item}
                          disabled={busy || active.has(key)}
                          aria-busy={adding}
                          onClick={() => void add([item.item])}
                        >
                          {adding ? <ButtonSpinner /> : <Plus size={15} />}
                          {item.item}
                          <small>
                            {adding
                              ? 'Adding…'
                              : active.has(key)
                                ? 'On list'
                                : `${item.timesBought} purchase${item.timesBought === 1 ? '' : 's'}`}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  {!recent.length && hasLoadedRecent && (
                    <p>Items appear here after you mark them purchased.</p>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <label htmlFor={`paste-${listId}`}>One item per line</label>
              <textarea
                id={`paste-${listId}`}
                rows={5}
                maxLength={16000}
                placeholder={'Coffee\nMilk 2%\nApples'}
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
              />
              <p>Names are added as written. Items already on the active list are skipped.</p>
              <button
                type="button"
                disabled={busy || !names.length || names.length > 100}
                aria-busy={pendingAdd === 'paste'}
                onClick={() => void add(names, 'paste')}
              >
                {pendingAdd === 'paste' ? <ButtonSpinner /> : null}
                {busy ? 'Adding…' : `Add ${names.length} items`}
              </button>
            </>
          )}
          <ToastMessage message={message} tone="info" />
        </div>
      )}
    </section>
  );
}
