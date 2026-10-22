'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { AsyncSkeleton } from './skeleton';
import { CatalogFoodContext } from './catalog-food-context';
import { createRequestGeneration } from '../../shared/mobile-domain/catalog-measures';
import { createClientUuid } from '@/lib/client/client-uuid';
import { rankShoppingScanMatches } from '@/lib/domain/shopping-scan-match';
import { formatShoppingQuantity } from '@/lib/domain/shopping-quantity';
import type { ShoppingListDetail } from '@/lib/services/planning-service';
import {
  barcodeReviewChoices,
  shoppingScanConfirmation,
  type BarcodeReviewResult,
  type ReviewedCatalogFood,
  type ReviewedLocalProduct,
} from '../../shared/mobile-domain/catalog';
import styles from './shopping-list-editor.module.css';

const BarcodeScanner = dynamic(
  () => import('./barcode-scanner').then((module) => module.BarcodeScanner),
  {
    ssr: false,
    loading: () => <AsyncSkeleton label="Opening barcode scanner" variant="scanner" />,
  },
);
type Item = ShoppingListDetail['items'][number];
type Command = ReturnType<typeof shoppingScanConfirmation>;
type ReviewActor = { userId: string; profileId: string };
type ConfirmationAttempt = { command: Command; actor: ReviewActor };

async function readCurrentActor(expected?: ReviewActor): Promise<ReviewActor> {
  const response = await fetch('/api/v1/auth/context', { cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'Your account could not be checked.');
  const actor = body.actor as ReviewActor | undefined;
  if (!actor || typeof actor.userId !== 'string' || typeof actor.profileId !== 'string')
    throw new Error('Your account could not be checked. Try again before confirming.');
  if (expected && (actor.userId !== expected.userId || actor.profileId !== expected.profileId))
    throw new Error(
      'Return to the original account and viewing profile. This confirmation has not been retargeted.',
    );
  return { userId: actor.userId, profileId: actor.profileId };
}

export function ShoppingScanReview({
  listId,
  items,
  open,
  onSaved,
  onLockedChange,
}: {
  listId: string;
  items: Item[];
  open: boolean;
  onSaved: (item: Item) => void;
  onLockedChange: (locked: boolean) => void;
}) {
  const [barcode, setBarcode] = useState('');
  const [record, setRecord] = useState<ReviewedCatalogFood | null>(null);
  const [localProduct, setLocalProduct] = useState<ReviewedLocalProduct | null>(null);
  const [localChoice, setLocalChoice] = useState<ReviewedLocalProduct | null>(null);
  const [choices, setChoices] = useState<ReviewedCatalogFood[]>([]);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const selectedItemRef = useRef(selectedItem);
  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'lookup' | 'confirm' | 'inspect' | 'abandon' | null>(null);
  const [attempt, setAttempt] = useState<ConfirmationAttempt | null>(null);
  const [reviewActor, setReviewActor] = useState<ReviewActor | null>(null);
  const [receiptMissing, setReceiptMissing] = useState(false);
  const [destinationReviewed, setDestinationReviewed] = useState(false);
  const [closedAttempts, setClosedAttempts] = useState<ConfirmationAttempt[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const generation = useRef(createRequestGeneration());
  const lock = useRef(false);
  const alive = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const locked = busy === 'confirm' || !!attempt || !!savedId;
  const food = localProduct ?? record;
  const matches = food
    ? rankShoppingScanMatches(
        items.filter((item) => !item.checked),
        food,
      )
    : [];
  useEffect(() => {
    onLockedChange(busy === 'confirm' || !!attempt);
  }, [busy, attempt, onLockedChange]);
  useEffect(() => {
    alive.current = true;
    const requests = generation.current;
    return () => {
      alive.current = false;
      requests.next();
      abort.current?.abort();
    };
  }, []);

  async function lookup(value: string) {
    if (lock.current || locked || !value.trim()) return;
    const token = generation.current.next();
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy('lookup');
    setStatus('Looking up this barcode…');
    setRecord(null);
    setLocalProduct(null);
    setLocalChoice(null);
    setChoices([]);
    setSelectedItem(null);
    setReviewActor(null);
    try {
      const response = await fetch('/api/v1/food-data/barcode-lookups', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: value.trim(),
          language: navigator.language.slice(0, 2),
          compareUsda: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Barcode lookup failed.');
      if (!alive.current || !generation.current.isCurrent(token)) return;
      const review = barcodeReviewChoices(body as BarcodeReviewResult);
      if (!review.localProduct && !review.records.length)
        throw new Error('No product was found. Try another barcode or add an item manually.');
      setLocalProduct(review.localProduct);
      setLocalChoice(review.localProduct);
      setRecord(review.localProduct ? null : review.records[0]);
      setChoices(review.records);
      setQuantity('1');
      setUnit(review.localProduct?.defaultInventoryUnit || 'each');
      setStatus(
        review.localProduct
          ? 'Saved product found. Confirmation uses this local identity without a provider request.'
          : 'Review the source food and amount before confirming.',
      );
    } catch (error) {
      if (alive.current && generation.current.isCurrent(token) && !controller.signal.aborted)
        setStatus(error instanceof Error ? error.message : 'Barcode lookup failed.');
    } finally {
      if (alive.current && generation.current.isCurrent(token)) setBusy(null);
    }
  }
  async function refreshSaved(itemId: string) {
    const response = await fetch(`/api/v1/shopping-lists/${listId}`, { cache: 'no-store' });
    const body = await response.json();
    if (!alive.current) return;
    if (!response.ok) throw new Error('The cart was saved, but the list could not refresh.');
    const item = body.list?.items?.find((row: Item) => row.id === itemId);
    if (!item)
      throw new Error('The cart was saved; review the list because this row has since changed.');
    onSaved(item);
    setStatus('Cart amount saved. No purchase completion or Pantry intake was recorded.');
  }
  async function confirm(previous?: ConfirmationAttempt) {
    if (lock.current || savedId) return;
    let submitted = previous;
    let sent = false;
    let rejected = false;
    lock.current = true;
    setBusy('confirm');
    try {
      const command =
        previous?.command ??
        shoppingScanConfirmation({
          operationId: createClientUuid(),
          record,
          localProduct,
          quantity,
          unit,
          item: selectedItem
            ? { id: selectedItem.id, updatedAt: new Date(selectedItem.updatedAt).toISOString() }
            : undefined,
        });
      setStatus('Checking the account and viewing profile…');
      const actor = await readCurrentActor(previous?.actor ?? reviewActor ?? undefined);
      if (!alive.current) return;
      setReviewActor(actor);
      submitted ??= { command, actor };
      setAttempt(submitted);
      if (!previous) {
        setReceiptMissing(false);
        setDestinationReviewed(false);
      }
      setStatus('Saving the reviewed cart amount…');
      sent = true;
      const response = await fetch(`/api/v1/shopping-lists/${listId}/catalog-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bord-Expected-Profile-Id': submitted.actor.profileId,
          'X-Bord-Expected-User-Id': submitted.actor.userId,
        },
        body: JSON.stringify(submitted.command),
      });
      const body = await response.json();
      if (!alive.current) return;
      if (!response.ok) {
        if (!previous && [400, 401, 403, 404, 409, 422].includes(response.status)) {
          rejected = true;
          setAttempt(null);
        }
        throw new Error(body.error?.message ?? 'The confirmation could not be saved.');
      }
      setSavedId(body.itemId);
      setAttempt(null);
      try {
        await refreshSaved(body.itemId);
      } catch (error) {
        setStatus(
          `${error instanceof Error ? error.message : 'Cart saved; refresh failed.'} Use Refresh saved cart; do not confirm again.`,
        );
      }
    } catch (error) {
      if (!alive.current) return;
      setStatus(
        `${error instanceof Error ? error.message : 'The response was lost.'}${sent && submitted && !rejected ? ' The original outcome remains uncertain. Check its receipt or retry the same confirmation.' : !sent ? ' No confirmation request was sent.' : ''}`,
      );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  async function recover(action: 'inspect' | 'abandon') {
    if (
      lock.current ||
      !attempt ||
      (action === 'abandon' && (!receiptMissing || !destinationReviewed))
    )
      return;
    const original = attempt;
    lock.current = true;
    setBusy(action);
    setStatus(
      action === 'inspect'
        ? 'Checking the original confirmation receipt…'
        : 'Closing future execution of the original confirmation…',
    );
    try {
      await readCurrentActor(original.actor);
      if (!alive.current) return;
      const response = await fetch('/api/v1/food-data/confirmations/recovery', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bord-Expected-Profile-Id': original.actor.profileId,
          'X-Bord-Expected-User-Id': original.actor.userId,
        },
        body: JSON.stringify({
          action,
          operationId: original.command.operationId,
          actor: original.actor,
          commandPath: `/api/v1/shopping-lists/${listId}/catalog-items`,
          command: original.command,
        }),
      });
      const body = await response.json();
      if (!alive.current) return;
      if (!response.ok)
        throw new Error(body.error?.message ?? 'The confirmation could not be reconciled.');
      if (body.status === 'acknowledged' && typeof body.result?.itemId === 'string') {
        setSavedId(body.result.itemId);
        setAttempt(null);
        setStatus('The original confirmation was saved. No additional write was performed.');
        try {
          await refreshSaved(body.result.itemId);
        } catch (error) {
          if (alive.current)
            setStatus(
              `The original confirmation was saved. ${error instanceof Error ? error.message : 'The list could not refresh.'} Use Refresh saved cart; do not confirm again.`,
            );
        }
      } else if (body.status === 'abandoned') {
        setClosedAttempts((closed) => [...closed, original]);
        setAttempt(null);
        setRecord(null);
        setLocalProduct(null);
        setLocalChoice(null);
        setChoices([]);
        setSelectedItem(null);
        setReviewActor(null);
        setBarcode('');
        setReceiptMissing(false);
        setDestinationReviewed(false);
        setStatus(
          'Future execution is blocked. The earlier outcome remains unknown; no changes were undone. The original confirmation is retained below while this page stays open.',
        );
      } else if (body.status === 'not_recorded') {
        setReceiptMissing(true);
        setDestinationReviewed(false);
        setStatus(
          'No retained receipt was found. This does not prove the earlier request did not commit. Review the saved list before closing this unknown confirmation.',
        );
      } else
        throw new Error('The receipt could not be confirmed. The original operation is retained.');
    } catch (error) {
      if (alive.current)
        setStatus(
          `${error instanceof Error ? error.message : 'Recovery failed.'} The original confirmation is retained.`,
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(null);
    }
  }
  return (
    <div className={styles.dialogBody}>
      {open && !locked ? <BarcodeScanner onDetected={(value) => void lookup(value)} /> : null}
      <form
        className={styles.barcodeForm}
        onSubmit={(event) => {
          event.preventDefault();
          void lookup(barcode);
        }}
      >
        <label>
          Enter barcode
          <input
            inputMode="numeric"
            value={barcode}
            disabled={locked}
            onChange={(event) => setBarcode(event.target.value)}
            placeholder="UPC, EAN, or GTIN"
          />
        </label>
        <button type="submit" disabled={locked || busy === 'lookup' || !barcode.trim()}>
          {busy === 'lookup' ? 'Looking up…' : 'Look up'}
        </button>
      </form>
      {status ? (
        <p role="status" className={styles.dialogStatus}>
          {status}
        </p>
      ) : null}
      {food ? (
        <section className={styles.scanResult}>
          <strong>{food.displayName}</strong>
          <span>{food.brand}</span>
          {localProduct ? (
            <p>Saved household product · {localProduct.defaultInventoryUnit}</p>
          ) : (
            <p>
              {record?.citation} ·{' '}
              {record?.catalogRef
                ? `Revision ${record.catalogRef.source_revision}`
                : 'Reviewed provider record'}{' '}
              · nutrition basis {record?.nutrientBasis ?? 'not recorded'}
            </p>
          )}
          {!locked && choices.length + Number(!!localChoice) > 1 ? (
            <label>
              Source alternative
              <select
                value={
                  localProduct
                    ? `local:${localProduct.id}`
                    : `${record?.provider}:${record?.providerRecordId}`
                }
                onChange={(event) => {
                  setRecord(
                    choices.find(
                      (choice) =>
                        `${choice.provider}:${choice.providerRecordId}` === event.target.value,
                    ) ?? null,
                  );
                  const selectedLocal =
                    event.target.value === `local:${localChoice?.id}` ? localChoice : null;
                  setLocalProduct(selectedLocal);
                  setQuantity('1');
                  setUnit(selectedLocal?.defaultInventoryUnit || 'each');
                  setSelectedItem(null);
                }}
              >
                {localChoice ? (
                  <option value={`local:${localChoice.id}`}>
                    Saved product · {localChoice.displayName}
                  </option>
                ) : null}
                {choices.map((choice) => (
                  <option
                    key={`${choice.provider}:${choice.providerRecordId}`}
                    value={`${choice.provider}:${choice.providerRecordId}`}
                  >
                    {choice.displayName} · {choice.provider}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset disabled={locked}>
            <legend>Reviewed cart amount</legend>
            <label>
              Amount
              <input
                type="number"
                min="0.000001"
                max="10000"
                step="any"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              Unit
              <input
                value={unit}
                maxLength={30}
                onChange={(event) => setUnit(event.target.value)}
              />
            </label>
            {record?.catalogRef ? (
              <CatalogFoodContext
                name={record.displayName}
                reference={record.catalogRef}
                onSelectMeasure={(amount) => {
                  if (!locked) {
                    setQuantity(String(amount.quantity));
                    setUnit(amount.unit);
                  }
                }}
              />
            ) : null}
            <label>
              Cart destination
              <select
                value={selectedItem?.id ?? ''}
                onChange={(event) =>
                  setSelectedItem(items.find((item) => item.id === event.target.value) ?? null)
                }
              >
                <option value="">Add a separate cart entry</option>
                {matches.map((match) => (
                  <option key={match.id} value={match.id}>
                    Replace cart amount for {match.item}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          {selectedItem ? (
            <p>
              Replace{' '}
              {formatShoppingQuantity(selectedItem.cartQuantity, selectedItem.cartUnit ?? '')} in
              cart with {quantity || '…'} {unit || '…'}. Recipe demand stays{' '}
              {selectedItem.quantity === null
                ? 'unrecorded'
                : formatShoppingQuantity(selectedItem.quantity, selectedItem.unit)}
              . This does not add to the previous amount or mark a purchase complete.
            </p>
          ) : (
            <p>
              A separate entry keeps existing cart amounts and recipe demand unchanged. Confirming
              does not unpack food into Pantry.
            </p>
          )}
          {selectedItem && !locked ? (
            <button
              type="button"
              className="secondary-button"
              disabled={!!busy}
              onClick={async () => {
                const reviewedId = selectedItem.id;
                const token = generation.current.next();
                setBusy('lookup');
                try {
                  const response = await fetch(`/api/v1/shopping-lists/${listId}`, {
                    cache: 'no-store',
                  });
                  const body = await response.json();
                  if (
                    !alive.current ||
                    !generation.current.isCurrent(token) ||
                    selectedItemRef.current?.id !== reviewedId
                  )
                    return;
                  if (!response.ok)
                    throw new Error('Current cart could not be loaded. Your amount is retained.');
                  const current = body.list?.items?.find((item: Item) => item.id === reviewedId);
                  if (!current)
                    throw new Error(
                      'This row is no longer available. Choose a separate entry or another row.',
                    );
                  setSelectedItem(current);
                  onSaved(current);
                  setStatus(
                    'Current cart loaded. Review the replacement summary before confirming again.',
                  );
                } catch (error) {
                  if (alive.current && generation.current.isCurrent(token))
                    setStatus(
                      error instanceof Error
                        ? error.message
                        : 'Could not refresh the current cart.',
                    );
                } finally {
                  if (alive.current && generation.current.isCurrent(token)) setBusy(null);
                }
              }}
            >
              Review current cart before replacement
            </button>
          ) : null}
          {!attempt && !savedId ? (
            <button
              type="button"
              className="primary-button"
              disabled={!!busy}
              onClick={() => void confirm()}
            >
              {selectedItem ? 'Confirm replacement cart amount' : 'Confirm separate cart entry'}
            </button>
          ) : null}
        </section>
      ) : null}
      {attempt ? (
        <>
          <p>
            The original confirmation is retained. A failed retry does not prove the earlier request
            did not commit.
          </p>
          <button type="button" disabled={!!busy} onClick={() => void confirm(attempt)}>
            {busy === 'confirm' ? 'Confirming…' : 'Retry same confirmation'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => void recover('inspect')}>
            {busy === 'inspect' ? 'Checking receipt…' : 'Check original confirmation receipt'}
          </button>
          <a
            href={`/lists/${listId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="secondary-button"
            onClick={() => {
              if (receiptMissing) setDestinationReviewed(true);
            }}
          >
            Review saved list in another tab
          </a>
          {receiptMissing ? (
            <p>
              An absent receipt remains an unknown outcome. Review the list, then explicitly close
              future execution if you want to continue. Closing does not undo earlier changes.
            </p>
          ) : null}
          {receiptMissing && destinationReviewed ? (
            <button type="button" disabled={!!busy} onClick={() => void recover('abandon')}>
              {busy === 'abandon'
                ? 'Closing confirmation…'
                : 'I reviewed the list — close unknown confirmation'}
            </button>
          ) : null}
        </>
      ) : null}
      {closedAttempts.length ? (
        <details>
          <summary>Closed unknown confirmations ({closedAttempts.length})</summary>
          <p>
            Future execution is blocked. Earlier changes have not been undone. These original
            commands are retained only while this page stays open.
          </p>
          <ul>
            {closedAttempts.map((closed) => (
              <li key={closed.command.operationId}>
                {closed.command.cartQuantity} {closed.command.cartUnit} · Operation{' '}
                {closed.command.operationId}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {savedId ? (
        <>
          <button
            type="button"
            onClick={() => void refreshSaved(savedId).catch((error) => setStatus(error.message))}
          >
            Refresh saved cart
          </button>
          <button
            type="button"
            onClick={() => {
              setSavedId(null);
              setRecord(null);
              setLocalProduct(null);
              setReviewActor(null);
              setBarcode('');
              setStatus('Scan another product.');
            }}
          >
            Scan another product
          </button>
        </>
      ) : null}
    </div>
  );
}
