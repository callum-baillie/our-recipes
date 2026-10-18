'use client';
import { useState } from 'react';
import { StickyNote } from 'lucide-react';
import { ButtonSpinner } from '@/components/skeleton';
export function ShoppingListNotes({
  listId,
  initialNote,
  initialVersion,
}: {
  listId: string;
  initialNote: string;
  initialVersion: number;
}) {
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/shopping-lists/${listId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_notes', note, expectedVersion: version }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Notes could not be saved.');
      setVersion(body.list.notesVersion);
      setSavedNote(note);
      setMessage('Shared notes saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details id="shopping-list-notes" className="shopping-shared-notes">
      <summary>
        <StickyNote size={17} />
        Shared notes{note !== savedNote ? ' · unsaved' : savedNote ? ' · saved' : ''}
      </summary>
      <form
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label htmlFor={`list-note-${listId}`}>Notes for this shopping trip</label>
        <textarea
          id={`list-note-${listId}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Brands, budget reminders, or instructions for anyone shopping."
        />
        <button type="submit" disabled={busy || note === savedNote} aria-busy={busy}>
          {busy ? <ButtonSpinner /> : null}
          {busy ? 'Saving…' : 'Save notes'}
        </button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
