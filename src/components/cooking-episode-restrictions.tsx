'use client';
import styles from './cooking-mode.module.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientUuid } from '@/lib/client/client-uuid';
import type { CookingRestrictions } from '@/lib/domain/cooking-episode';
import type { KitchenState } from '@/lib/domain/kitchen';
import { InlineAlert } from './inline-alert';
export function CookingEpisodeRestrictions({
  sessionId,
  revision,
  current,
  active,
  timezone,
}: {
  sessionId: string;
  revision: number;
  current: CookingRestrictions | null;
  active: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<KitchenState['items'] | null>(null);
  const [excluded, setExcluded] = useState(current?.excludedEquipmentIds ?? []);
  const [date, setDate] = useState(
    current?.validOn ??
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
  );
  const [zone, setZone] = useState(current?.timezone ?? timezone);
  const [operationId, setOperationId] = useState(createClientUuid);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function open() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/kitchen', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not load equipment.');
      setItems(body.kitchen.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load equipment.');
    } finally {
      setBusy(false);
    }
  }
  async function save(clear = false) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/v1/cook-sessions/${sessionId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'restrictions',
          operationId,
          expectedContextRevision: revision,
          restrictions: clear
            ? null
            : {
                timezone: zone,
                validOn: date,
                excludedEquipmentIds: excluded,
                excludedCapabilities: current?.excludedCapabilities ?? [],
              },
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not save this restriction.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this restriction.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={`cooking-pantry ${styles.episodePanel}`} aria-label="This cooking episode">
      <h2>This cooking episode</h2>
      {current ? (
        <p>
          {active ? 'Restrictions apply' : 'Restrictions inactive'} on {current.validOn} in{' '}
          {current.timezone}, for this session only. Ownership is unchanged.
        </p>
      ) : (
        <p>Temporarily exclude equipment for this session on a specific date.</p>
      )}
      {message && <InlineAlert tone="error">{message}</InlineAlert>}
      {!items ? (
        <button className="secondary-button" disabled={busy} onClick={() => void open()}>
          Review temporary equipment restrictions
        </button>
      ) : (
        <>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setOperationId(createClientUuid());
              }}
            />
          </label>
          <label>
            Timezone
            <input
              value={zone}
              maxLength={100}
              onChange={(event) => {
                setZone(event.target.value);
                setOperationId(createClientUuid());
              }}
            />
          </label>
          <fieldset disabled={busy}>
            <legend>Do not use these items for this episode on this date</legend>
            {items
              .filter((item) => item.availability !== 'archived')
              .map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={excluded.includes(item.id)}
                    onChange={(event) => {
                      setExcluded(
                        event.target.checked
                          ? [...excluded, item.id]
                          : excluded.filter((id) => id !== item.id),
                      );
                      setOperationId(createClientUuid());
                    }}
                  />
                  {item.name}
                </label>
              ))}
          </fieldset>
          <button className="primary-button" disabled={busy} onClick={() => void save()}>
            Save dated restriction
          </button>
          {current && (
            <button className="secondary-button" disabled={busy} onClick={() => void save(true)}>
              Clear restriction for this episode
            </button>
          )}
          <button className="secondary-button" disabled={busy} onClick={() => setItems(null)}>
            Cancel edits
          </button>
        </>
      )}
    </section>
  );
}
