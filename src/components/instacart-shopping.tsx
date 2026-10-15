'use client';
import { useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { instacartRequestSchema, instacartMeasurement } from '@/lib/domain/instacart';
import styles from './nutrition-onboarding-flow.module.css';
type Item = {
  id: string;
  item: string;
  quantity: number | null;
  unit: string;
  shoppingState: string;
};
type Choice = { id: string; name: string; upc: string; included: boolean };
export function InstacartShopping({
  listId,
  items,
  configured,
}: {
  listId: string;
  items: Item[];
  configured: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  function change(id: string, patch: Partial<Choice>) {
    setUrl('');
    setChoices((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }
  async function createLink() {
    const parsed = instacartRequestSchema.safeParse({
      items: choices
        .filter((item) => item.included)
        .map(({ id, name, upc }) => ({ id, name, upc })),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check your items.');
      return;
    }
    setBusy(true);
    setError('');
    setUrl('');
    try {
      const response = await fetch(`/api/v1/shopping-lists/${listId}/instacart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message ?? 'Unable to create an Instacart list.');
      setUrl(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to reach Instacart.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={styles.secondary}
        disabled={!items.length}
        onClick={() => {
          setChoices(
            items.map((item) => ({
              id: item.id,
              name: item.item,
              upc: '',
              included: ['to_buy', 'cant_find'].includes(item.shoppingState),
            })),
          );
          setError('');
          setUrl('');
          dialog.current?.showModal();
        }}
      >
        <ExternalLink size={16} /> Shop with Instacart
      </button>
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="instacart-heading"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className={styles.dialogHeading}>
          <div>
            <h2 id="instacart-heading">Shop your list</h2>
            <p>
              Choose a store and review matching products on Instacart before adding them to your
              cart.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Instacart"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {!configured ? (
          <p className={styles.notice}>
            An administrator needs to configure an Instacart Developer Platform API key on this
            server before you can create shopping links.
          </p>
        ) : null}
        <p className={styles.hint}>
          Names like “milk” work as searches. Use “2% milk” or add a brand to narrow the match. An
          optional UPC requests a specific product. Available stores and products depend on your
          location.
        </p>
        <fieldset disabled={busy} className={styles.question}>
          <legend>Items to send ({choices.filter((item) => item.included).length})</legend>
          <div className={styles.inlineActions}>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setUrl('');
                setChoices((current) => current.map((item) => ({ ...item, included: true })));
              }}
            >
              Include all items
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setUrl('');
                setChoices((current) =>
                  current.map((item) => ({
                    ...item,
                    included: items.some(
                      (source) =>
                        source.id === item.id &&
                        ['to_buy', 'cant_find'].includes(source.shoppingState),
                    ),
                  })),
                );
              }}
            >
              Remaining items only
            </button>
          </div>
          <div className={styles.stack}>
            {choices.map((item) => {
              const source = items.find((source) => source.id === item.id)!;
              const amount = [source.quantity, source.unit]
                .filter((value) => value !== null && value !== '')
                .join(' ');
              return (
                <div key={item.id} className={styles.insight}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.included}
                      onChange={(event) => change(item.id, { included: event.target.checked })}
                    />{' '}
                    {source.item}
                    {amount ? ` · ${amount}` : ''}
                  </label>
                  {item.included ? (
                    <>
                      <label className={styles.field}>
                        <span>Product search</span>
                        <input
                          value={item.name}
                          maxLength={200}
                          onChange={(event) => change(item.id, { name: event.target.value })}
                        />
                      </label>
                      <details>
                        <summary>Match a specific product (optional)</summary>
                        <label className={styles.field}>
                          <span>UPC barcode</span>
                          <input
                            inputMode="numeric"
                            maxLength={14}
                            value={item.upc}
                            onChange={(event) => change(item.id, { upc: event.target.value })}
                          />
                          <small>
                            12 or 14 digits, including any leading zeros. Leave blank to search by
                            name.
                          </small>
                        </label>
                      </details>
                      {!instacartMeasurement(source.quantity, source.unit) ? (
                        <p className={styles.hint}>
                          Confirm the quantity on Instacart.{' '}
                          {amount
                            ? 'The original amount is included as display text.'
                            : 'This item has no amount specified.'}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>
        <p className={styles.hint}>
          Creating a link shares the list title, selected product names, quantities and supplied
          UPCs with Instacart. Your local list stays unchanged.
        </p>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          {url ? (
            <a className={styles.primary} href={url} target="_blank" rel="noopener noreferrer">
              Open Instacart <ExternalLink size={16} />
            </a>
          ) : (
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !configured || !choices.some((item) => item.included)}
              onClick={() => void createLink()}
            >
              {busy ? 'Creating shopping link…' : 'Create Instacart list'}
            </button>
          )}
        </div>
        {url ? (
          <p role="status" className={styles.notice}>
            Your shopping link is ready. Choose your store on Instacart to see matching products.
          </p>
        ) : null}
      </dialog>
    </>
  );
}
