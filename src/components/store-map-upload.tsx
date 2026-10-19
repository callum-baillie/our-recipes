'use client';
import { useState } from 'react';
import {
  GROCERY_ROUTE_PREFIX,
  WALMART_ROUTE,
  storeMapSections,
  orderStoreMap,
  type StoreMapDraft,
  type StoreMapResult,
} from '@/lib/domain/store-map';
import styles from './decision-assistance.module.css';

type Section = { aisleId: string; name: string; matchTerms: string[] };
export function StoreMapUpload({ onUse }: { onUse: (sections: Section[]) => void }) {
  const [image, setImage] = useState<{ base64: string; mime: string } | null>(null);
  const [preset, setPreset] = useState<StoreMapResult['preset']>('grocery_first');
  const [notes, setNotes] = useState('');
  const [paid, setPaid] = useState(false);
  const [draft, setDraft] = useState<StoreMapDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function selectFile(file?: File) {
    setDraft(null);
    setMessage('');
    setImage(null);
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 6 * 1024 * 1024
    ) {
      setMessage('Choose a PNG, JPEG or WebP image under 6 MB.');
      return;
    }
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Image could not be read.'));
      reader.readAsDataURL(file);
    }).catch(() => '');
    if (!data) {
      setMessage('Image could not be read.');
      return;
    }
    setImage({ base64: data.split(',')[1]!, mime: file.type });
  }
  async function send(body: unknown, method: string) {
    const response = await fetch('/api/v1/ai/store-map', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error?.message || 'Unable to read this map.');
    return value as StoreMapDraft;
  }
  async function analyze() {
    if (!image) return;
    setPending(true);
    setMessage('');
    try {
      const result = await send(
        { imageBase64: image.base64, mimeType: image.mime, notes, preset, allowPaidCall: paid },
        'POST',
      );
      setDraft(result);
      setMessage(
        result.cached
          ? 'Reused the saved map review. Your corrections are preserved.'
          : 'Review the entrance, labels and order before using the route.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to read this map.');
    } finally {
      setPending(false);
    }
  }
  async function useRoute() {
    if (!draft) return;
    setPending(true);
    setMessage('');
    try {
      const result = await send(
        {
          id: draft.id,
          version: draft.version,
          entranceId: draft.entranceId,
          order: draft.order,
          labels: Object.fromEntries(draft.map.departments.map((d) => [d.id, d.label])),
        },
        'PATCH',
      );
      setDraft(result);
      onUse(storeMapSections(result));
      setMessage('Route copied to the store editor. Save the supermarket to apply it.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save this route.');
    } finally {
      setPending(false);
    }
  }
  function move(index: number, offset: number) {
    if (!draft) return;
    const order = [...draft.order];
    const target = index + offset;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target]!, order[index]!];
    setDraft({ ...draft, order });
  }
  function example() {
    const counts = new Map<string, number>();
    onUse(
      WALMART_ROUTE.map((label) => {
        const count = (counts.get(label) ?? 0) + 1;
        counts.set(label, count);
        return {
          aisleId: '',
          name: label === 'Hardware' ? `${label} — area ${count}` : label,
          matchTerms: [label],
        };
      }),
    );
    setMessage(
      'Walmart template copied to the route draft. This editable example does not confirm this store’s entrance or layout. Save the store to apply it. No AI request was made.',
    );
  }
  return (
    <details className={styles.panel}>
      <summary>
        <strong>Build a route from a store map</strong>
      </summary>
      <p className={styles.muted}>
        Upload a floor map, review the entrance and departments, then copy the route into this
        store. Saved store routes only change when you save the editor.
      </p>
      <label className={styles.field}>
        Choose map · PNG, JPEG or WebP · Up to 6 MB
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={pending}
          onChange={(e) => void selectFile(e.target.files?.[0])}
        />
      </label>
      {image && (
        <>
          {/* Local preview; image bytes are not stored in the database. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.mapImage}
            src={`data:${image.mime};base64,${image.base64}`}
            alt="Uploaded supermarket floor map"
          />
        </>
      )}
      <label className={styles.field}>
        Route preference
        <select
          disabled={pending}
          value={preset}
          onChange={(e) => {
            setPreset(e.target.value as StoreMapResult['preset']);
            setDraft(null);
          }}
        >
          <option value="grocery_first">Grocery entrance → produce through alcohol</option>
          <option value="walmart">Walmart template order</option>
          <option value="map_order">Follow the map’s suggested order</option>
        </select>
      </label>
      <small>
        {preset === 'grocery_first'
          ? GROCERY_ROUTE_PREFIX.join(' → ')
          : preset === 'walmart'
            ? 'Use the editable Walmart department template as a route preference; confirm the actual entrance.'
            : 'Follow the department order identified on the supplied map; review every section.'}
      </small>
      <label className={styles.field}>
        Entrance or route notes
        <textarea
          value={notes}
          maxLength={1000}
          disabled={pending}
          onChange={(e) => {
            setNotes(e.target.value);
            setDraft(null);
          }}
          placeholder="For example: paired arrows at the bottom are entrances; use the right-hand grocery entrance."
        />
      </label>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={paid}
          disabled={pending}
          onChange={(e) => setPaid(e.target.checked)}
        />
        <span>
          Allow paid image analysis and entrance selection with OpenAI. The image is sent for
          analysis. When image review is enabled, a saved review can be reused without paid consent.
          A cache miss needs permission before new analysis.
        </span>
      </label>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primary}
          disabled={!image || pending}
          onClick={analyze}
        >
          {pending
            ? 'Working…'
            : paid
              ? 'Review map and suggest route'
              : 'Check for a saved map review'}
        </button>
        <button type="button" disabled={pending} onClick={example}>
          Use Walmart template
        </button>
      </div>
      {draft && (
        <>
          <label className={styles.field}>
            Starting entrance
            <select
              disabled={pending}
              value={draft.entranceId}
              onChange={(e) => setDraft({ ...draft, entranceId: e.target.value })}
            >
              <option value="unknown">Unknown — choose an entrance</option>
              {draft.map.entrances.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} ({e.kind})
                </option>
              ))}
              <option value="manual">I will set the entrance manually</option>
            </select>
          </label>
          <p className={styles.muted}>
            {draft.map.entrances.find((e) => e.id === draft.entranceId)?.evidence}
          </p>
          {draft.map.warnings.map((warning, i) => (
            <p className={styles.notice} key={i}>
              {warning}
            </p>
          ))}
          <div className={styles.actions}>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                setDraft({ ...draft, order: orderStoreMap(draft.map, preset, draft.entranceId) })
              }
            >
              Reapply route preference
            </button>
          </div>
          <ol className={styles.route}>
            {draft.order.map((id, index) => {
              const department = draft.map.departments.find((d) => d.id === id)!;
              return (
                <li key={id}>
                  <span>{index + 1}</span>
                  <input
                    aria-label={`Department ${index + 1}`}
                    maxLength={80}
                    value={department.label}
                    disabled={pending}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        map: {
                          ...draft.map,
                          departments: draft.map.departments.map((d) =>
                            d.id === id ? { ...d, label: e.target.value } : d,
                          ),
                        },
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Move ${department.label} up`}
                    disabled={pending || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${department.label} down`}
                    disabled={pending || index === draft.order.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <small>
                    {department.uncertain ? 'Check label · ' : ''}
                    {department.evidence}
                  </small>
                </li>
              );
            })}
          </ol>
          <details>
            <summary>Map evidence</summary>
            <ul>
              {draft.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={pending || draft.entranceId === 'unknown' || !draft.order.length}
              onClick={useRoute}
            >
              Use reviewed route in store editor
            </button>
          </div>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
