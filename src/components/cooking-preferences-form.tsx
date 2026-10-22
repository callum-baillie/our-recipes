'use client';
import { useEffect, useState } from 'react';
import {
  cookingPreferencesSchema,
  type CookingPreferences,
} from '@/lib/domain/cooking-preferences';
export function CookingPreferencesForm({
  initial,
  onDirtyChange,
}: {
  initial: { preferences: CookingPreferences; revision: string };
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(initial.preferences);
  const [saved, setSaved] = useState(initial.preferences);
  useEffect(
    () => onDirtyChange?.(JSON.stringify(draft) !== JSON.stringify(saved)),
    [draft, saved, onDirtyChange],
  );
  const [revision, setRevision] = useState(initial.revision);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const preferences = cookingPreferencesSchema.parse(draft);
      const response = await fetch('/api/v1/account/cooking-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision, preferences }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to save.');
      setRevision(body.revision);
      setDraft(body.preferences);
      setSaved(body.preferences);
      setMessage('Your cooking preferences are saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Check your preferences.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card">
      <h2>How I cook · Your signed-in account</h2>
      <p>
        These are personal preferences. They do not change household equipment, dietary restrictions
        or another person’s settings.
      </p>
      <label>
        Preferred or avoided methods, with context
        <textarea
          value={draft.methodPreferences}
          maxLength={800}
          placeholder="Prefer stovetop potatoes"
          onChange={(e) => setDraft({ ...draft, methodPreferences: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>What matters to you?</legend>
        {(
          [
            'less-cleanup',
            'fewer-pans',
            'shorter-elapsed',
            'less-hands-on',
            'batch-preparation',
            'less-chopping',
            'lighter-cookware',
          ] as const
        ).map((value) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={draft.priorities.includes(value)}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  priorities: e.target.checked
                    ? [...draft.priorities, value]
                    : draft.priorities.filter((v) => v !== value),
                })
              }
            />
            {value.replaceAll('-', ' ')}
          </label>
        ))}
      </fieldset>
      <label>
        Typical available minutes (optional)
        <input
          type="number"
          min={1}
          max={1440}
          value={draft.typicalMinutes ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, typicalMinutes: e.target.value ? Number(e.target.value) : null })
          }
        />
      </label>
      <label>
        Comfortable simultaneous hands-on tasks
        <input
          type="number"
          min={1}
          max={8}
          value={draft.maxHandsOn}
          onChange={(e) => setDraft({ ...draft, maxHandsOn: Number(e.target.value) })}
        />
      </label>
      <label>
        Equipment recommendations
        <select
          value={draft.equipmentPolicy}
          onChange={(e) =>
            setDraft({
              ...draft,
              equipmentPolicy: e.target.value as CookingPreferences['equipmentPolicy'],
            })
          }
        >
          <option value="recorded-only">Use recorded equipment only</option>
          <option value="ask-about-missing">Ask about missing equipment</option>
        </select>
      </label>
      <label>
        Cooking confidence
        <select
          value={draft.confidence}
          onChange={(event) =>
            setDraft({
              ...draft,
              confidence: event.target.value as CookingPreferences['confidence'],
            })
          }
        >
          <option value="unspecified">Not specified</option>
          <option value="learning">Learning</option>
          <option value="comfortable">Comfortable</option>
          <option value="experienced">Experienced</option>
        </select>
      </label>
      <label>
        Instruction detail
        <select
          value={draft.instructionDetail}
          onChange={(event) =>
            setDraft({
              ...draft,
              instructionDetail: event.target.value as CookingPreferences['instructionDetail'],
            })
          }
        >
          <option value="brief">Brief</option>
          <option value="standard">Standard</option>
          <option value="detailed">Detailed</option>
        </select>
      </label>
      <p role="status">{message}</p>
      <button className="primary-button" disabled={busy} onClick={() => void save()}>
        Save my cooking preferences
      </button>
      <button
        className="secondary-button"
        disabled={busy}
        onClick={() => {
          setDraft(saved);
          setMessage('Unsaved preference edits discarded. Saved preferences are unchanged.');
        }}
      >
        Discard preference edits
      </button>
    </section>
  );
}
