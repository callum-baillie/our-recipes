'use client';
import { useState } from 'react';
import { RotateCcw, ClipboardPaste, Plus } from 'lucide-react';
import type { ShoppingListDetail } from '@/lib/services/planning-service';
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
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'recent' | 'paste'>('recent');
  async function load() {
    setOpen((value) => !value);
    if (open) return;
    try {
      const response = await fetch('/api/v1/shopping-lists/recent-items');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Recent purchases unavailable.');
      setRecent(body.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Recent items could not be loaded.');
    }
  }
  async function add(names: string[]) {
    if (busy) return;
    setBusy(true);
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
        onClick={() => void load()}
      >
        <RotateCcw size={17} />
        Buy again & quick add
      </button>
      {open && (
        <div className={styles.body}>
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
              <div className={styles.recent}>
                {recent.map((item) => (
                  <button
                    key={item.item}
                    disabled={busy || active.has(item.item.toLowerCase().trim())}
                    onClick={() => void add([item.item])}
                  >
                    <Plus size={15} />
                    {item.item}
                    <small>
                      {active.has(item.item.toLowerCase().trim())
                        ? 'On list'
                        : `${item.timesBought} purchase${item.timesBought === 1 ? '' : 's'}`}
                    </small>
                  </button>
                ))}
              </div>
              {!recent.length && <p>Items appear here after you mark them purchased.</p>}
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
                onClick={() => void add(names)}
              >
                {busy ? 'Adding…' : `Add ${names.length} items`}
              </button>
            </>
          )}
          <p role="status">{message}</p>
        </div>
      )}
    </section>
  );
}
