import * as React from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { Linking, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { expandScannedBarcode } from '../../../shared/retail-barcode';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useBord } from '@/state/bord-store';
import {
  barcodeReviewChoices,
  catalogConfirmation,
  catalogQuantity,
  shoppingScanConfirmation,
  type ReviewedCatalogFood,
  type ReviewedLocalProduct,
  type BarcodeReviewResult,
} from '@/data/catalog';
import {
  nativeScannerRecovery,
  sameScannerActor,
  scannerRecoveryMode,
  type ScannerActor,
  type ScannerOperation,
} from '@/data/scanner-recovery';
import {
  catalogContextKey,
  sourcePortionAmount,
  createRequestGeneration,
  type CatalogMeasure,
} from '../../../shared/mobile-domain/catalog-measures';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  FormField,
  Screen,
  StatusPill,
  Surface,
} from '@/components/ui';
import { tokens } from '@/theme/tokens';

type List = {
  id: string;
  name: string;
  items: { id: string; item: string; checked: boolean; updatedAt: string }[];
};
type Guidance = {
  id: string;
  name: string;
  storageState: string | null;
  form: string | null;
  details: Record<string, string | number | boolean | null>;
  attribution: string;
  license: string;
};
type Journal = Awaited<ReturnType<typeof nativeScannerRecovery>>;

export function BarcodeScannerScreen() {
  const { instanceUrl, user } = useAuth();
  return <ScannerReview key={`${instanceUrl}:${user?.id}`} />;
}
function ScannerReview() {
  const { target: requestedTarget, listId } = useLocalSearchParams<{
    target?: 'pantry' | 'shopping';
    listId?: string;
  }>();
  const target = requestedTarget === 'shopping' ? 'shopping' : 'pantry';
  const [permission, requestPermission] = useCameraPermissions();
  const { request, instanceUrl, user } = useAuth();
  const { refresh } = useSync();
  const { state } = useBord();
  const [barcode, setBarcode] = React.useState('');
  const [records, setRecords] = React.useState<ReviewedCatalogFood[]>([]);
  const [localProduct, setLocalProduct] = React.useState<ReviewedLocalProduct | null>(null);
  const [selected, setSelected] = React.useState(0);
  const record = localProduct ? null : (records[selected] ?? null);
  const reviewName = localProduct?.displayName ?? record?.displayName;
  const [message, setMessage] = React.useState('Checking saved confirmations…');
  const [busy, setBusy] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [recoveryCheck, setRecoveryCheck] = React.useState(0);
  const [actor, setActor] = React.useState<ScannerActor | null>(null);
  const [cameraState, setCameraState] = React.useState<'starting' | 'ready' | 'error'>('starting');
  const [cameraKey, setCameraKey] = React.useState(0);
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('each');
  const [locations, setLocations] = React.useState<{ id: string; path?: string; name: string }[]>(
    [],
  );
  const [locationId, setLocationId] = React.useState('');
  const [list, setList] = React.useState<List | null>(null);
  const [attempt, setAttempt] = React.useState<ScannerOperation | null>(null);
  const [closedUnknown, setClosedUnknown] = React.useState<ScannerOperation[]>([]);
  const [recoveryReviewed, setRecoveryReviewed] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [completedDestination, setCompletedDestination] = React.useState<'pantry' | 'shopping'>(
    target,
  );
  const [contextBusy, setContextBusy] = React.useState<'measures' | 'storage-guidance' | null>(
    null,
  );
  const [measures, setMeasures] = React.useState<CatalogMeasure[] | null>(null);
  const [guidance, setGuidance] = React.useState<Guidance[] | null>(null);
  const journal = React.useRef<Journal | null>(null);
  const lock = React.useRef(false);
  const scanLock = React.useRef(false);
  const generation = React.useRef(createRequestGeneration());
  const controller = React.useRef<AbortController | null>(null);
  const alive = React.useRef(true);
  const accountScope = `${instanceUrl ?? ''}\n${user?.id ?? ''}`;
  const currentAccountScope = React.useRef(accountScope);
  React.useEffect(() => {
    currentAccountScope.current = accountScope;
  }, [accountScope]);
  const sourceKey = record?.catalogRef
    ? catalogContextKey(record.catalogRef, record.displayName)
    : (localProduct?.id ?? '');
  const currentKey = React.useRef(sourceKey);
  currentKey.current = sourceKey;
  const clearContext = () => {
    generation.current.next();
    controller.current?.abort();
    setContextBusy(null);
    setMeasures(null);
    setGuidance(null);
    setQuantity('1');
    setUnit('each');
  };
  React.useEffect(() => {
    const requests = generation.current;
    alive.current = true;
    return () => {
      alive.current = false;
      requests.next();
      controller.current?.abort();
    };
  }, []);
  React.useEffect(() => {
    let current = true;
    setReady(false);
    setActor(null);
    setBusy(false);
    void (async () => {
      if (!instanceUrl || !user) return;
      const stored = await nativeScannerRecovery(instanceUrl, user.id);
      const pending = await stored.read();
      const closed = await stored.closedUnknown();
      if (!current) return;
      journal.current = stored;
      setAttempt(pending);
      setRecoveryReviewed(false);
      setClosedUnknown(closed);
      const context = await request<{ actor: ScannerActor }>('/api/v1/auth/context');
      if (!current) return;
      if (context.actor.userId !== user.id)
        throw new Error('The signed-in account changed. Reopen the scanner.');
      setActor(context.actor);
      setReady(true);
      setMessage(
        pending
          ? 'A previous confirmation needs review. Nothing is retried automatically.'
          : 'Scan a barcode or enter it below.',
      );
    })().catch((error) => {
      if (current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Saved confirmation recovery is unavailable. No write can start.',
        );
    });
    return () => {
      current = false;
    };
  }, [instanceUrl, request, user, recoveryCheck]);
  React.useEffect(() => {
    let current = true;
    if (target === 'shopping' && listId) {
      request<{ list: List }>(`/api/v1/shopping-lists/${encodeURIComponent(listId)}`)
        .then((result) => {
          if (current) setList(result.list);
        })
        .catch((error) => {
          if (current) setMessage(error.message);
        });
    } else {
      request<{ locations: { id: string; path?: string; name: string }[] }>(
        '/api/v1/pantry/locations',
      )
        .then((result) => {
          if (current) {
            setLocations(result.locations);
            setLocationId(result.locations[0]?.id ?? '');
          }
        })
        .catch((error) => {
          if (current) setMessage(error.message);
        });
    }
    return () => {
      current = false;
    };
  }, [target, listId, request]);
  usePreventRemove(busy && !!attempt, () =>
    setMessage(
      'The confirmation may already be running on the server. Its recovery record is saved; wait for this response before leaving.',
    ),
  );

  const readContext = async (kind: 'measures' | 'storage-guidance') => {
    if (!record?.catalogRef || contextBusy || busy || attempt) return;
    const token = generation.current.next();
    const key = sourceKey;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = () =>
      alive.current &&
      generation.current.isCurrent(token) &&
      currentKey.current === key &&
      !abort.signal.aborted;
    setContextBusy(kind);
    setMessage('');
    try {
      const result = await request<{ measures?: CatalogMeasure[]; guidance?: Guidance[] }>(
        `/api/v1/food-data/catalog/${kind}`,
        {
          method: 'POST',
          signal: abort.signal,
          body: JSON.stringify(
            kind === 'measures'
              ? { reference: record.catalogRef }
              : { query: record.displayName.slice(0, 200) },
          ),
        },
      );
      if (!current()) return;
      if (kind === 'measures') setMeasures(result.measures ?? []);
      else setGuidance(result.guidance ?? []);
    } catch (error) {
      if (current())
        setMessage(
          error instanceof Error
            ? error.message
            : 'Source context is unavailable. Manual amounts remain usable.',
        );
    } finally {
      if (current()) setContextBusy(null);
    }
  };
  const lookup = async (raw: string) => {
    if (!ready || lock.current || attempt) return;
    clearContext();
    const token = generation.current.next();
    const abort = new AbortController();
    controller.current = abort;
    lock.current = true;
    scanLock.current = true;
    setBusy(true);
    setMessage('Looking up this barcode…');
    try {
      const result = await request<BarcodeReviewResult>('/api/v1/food-data/barcode-lookups', {
        method: 'POST',
        signal: abort.signal,
        body: JSON.stringify({ barcode: raw, language: 'en', compareUsda: true }),
      });
      if (!alive.current || !generation.current.isCurrent(token)) return;
      const choices = barcodeReviewChoices(result);
      if (!choices.localProduct && !choices.records.length)
        throw new Error(
          'No source or saved product match was found. Try again or add the product manually.',
        );
      setRecords(choices.records);
      setLocalProduct(choices.localProduct);
      setSelected(0);
      setUnit(choices.localProduct?.defaultInventoryUnit || 'each');
      setMessage(
        choices.localProduct
          ? 'This verified barcode matches a saved household product. Review the amount and destination; no duplicate import is needed.'
          : 'Review the source and amount before confirming. Lookup has changed nothing.',
      );
    } catch (error) {
      if (alive.current && generation.current.isCurrent(token)) {
        setMessage(error instanceof Error ? error.message : 'Lookup failed.');
        scanLock.current = false;
      }
    } finally {
      lock.current = false;
      if (alive.current && generation.current.isCurrent(token)) setBusy(false);
    }
  };
  const onScanned = (result: BarcodeScanningResult) => {
    if (!scanLock.current) {
      try {
        const barcode = expandScannedBarcode(result.data, result.type);
        setBarcode(barcode);
        void lookup(barcode);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Scan the barcode again.');
      }
    }
  };
  const send = async (command: ScannerOperation) => {
    if (lock.current || !journal.current || !instanceUrl) return;
    const savedJournal = journal.current;
    const submittedScope = accountScope;
    const current = () => alive.current && currentAccountScope.current === submittedScope;
    lock.current = true;
    setBusy(true);
    setMessage('Checking the original account and profile…');
    let sent = false;
    let acknowledged = false;
    let existing: ScannerOperation | null = null;
    try {
      const context = await request<{ actor: ScannerActor }>('/api/v1/auth/context');
      if (!sameScannerActor(command, instanceUrl, context.actor))
        throw new Error(
          'Return to the original account and viewing profile before retrying this confirmation. It has not been retargeted.',
        );
      if (!current()) return;
      existing = await savedJournal.read();
      if (!existing) setRecoveryReviewed(false);
      await savedJournal.write(command);
      if (!current()) return;
      setAttempt(command);
      setMessage('Saving the reviewed selection…');
      sent = true;
      await request(command.path, {
        method: 'POST',
        headers: {
          'Idempotency-Key': command.operationId,
          'X-Bord-Expected-Profile-Id': command.actor.profileId,
          'X-Bord-Expected-User-Id': command.actor.userId,
        },
        body: JSON.stringify(command.body),
      });
      acknowledged = true;
      // Acknowledgement remains durable even when workspace refresh fails.
      await savedJournal.acknowledge(command.operationId);
      if (!current()) return;
      setAttempt(null);
      setCompletedDestination(command.destination);
      setSaved(true);
      setMessage(command.description);
      try {
        await refresh();
      } catch {
        if (current())
          setMessage(
            `${command.description} Workspace refresh failed; refresh the saved destination when connected.`,
          );
      }
    } catch (error) {
      if (!current()) return;
      const knownRejected =
        sent &&
        error instanceof Error &&
        'status' in error &&
        [400, 401, 403, 404, 409, 422].includes(Number(error.status));
      if (knownRejected && !existing) {
        try {
          await savedJournal.acknowledge(command.operationId);
          if (current()) setAttempt(null);
        } catch {
          /* Keep the durable recovery record if local cleanup fails. */
        }
      }
      // A previously uncertain request may have committed before a later authority/version rejection.
      // Keep its original journal until an acknowledged replay; never treat a rejected retry as proof of no write.
      setMessage(
        `${error instanceof Error ? error.message : 'The response was lost.'} ${acknowledged ? 'The server confirmed this operation. Local recovery cleanup failed; retry the same saved operation to retrieve its result.' : sent ? (knownRejected ? (existing ? 'Review the original confirmation and current saved records; its earlier outcome is not erased by this rejection.' : 'This submission was rejected. Correct the reviewed fields before confirming again.') : 'The outcome is unknown. Retry this exact saved confirmation.') : 'No new request was sent.'}`,
      );
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const confirm = (item?: List['items'][number]) => {
    if ((!record && !localProduct) || attempt || busy || contextBusy || !actor || !instanceUrl)
      return;
    try {
      const amount = catalogQuantity(quantity, unit);
      const operationId = randomUUID();
      const base = localProduct
        ? { operationId, localProductId: localProduct.id }
        : catalogConfirmation(record!, operationId, amount.unit);
      let path: string;
      let body: Record<string, unknown>;
      let description: string;
      if (target === 'shopping') {
        if (!list) throw new Error('Reload the selected shopping list before confirming.');
        path = `/api/v1/shopping-lists/${list.id}/catalog-items`;
        body = shoppingScanConfirmation({
          operationId,
          record,
          localProduct,
          quantity,
          unit,
          item,
        });
        description = `${amount.quantity} ${amount.unit} of ${reviewName} recorded in ${list.name}'s cart. No purchase or Pantry intake was recorded.`;
      } else {
        if (!locationId) throw new Error('Choose a storage location.');
        const batch = {
          quantityRemaining: amount.quantity,
          originalQuantity: amount.quantity,
          unit: amount.unit,
          locationId,
          status: 'unopened',
          expiryPrecision: 'unknown',
          source: 'Reviewed barcode',
          notes: '',
        };
        path = localProduct ? '/api/v1/pantry/batches' : '/api/v1/pantry/catalog-imports';
        body = localProduct
          ? { ...batch, productId: localProduct.id }
          : { ...base, batches: [batch] };
        description = `${amount.quantity} ${amount.unit} of ${reviewName} added to Pantry${localProduct ? ' using the saved product' : ' with the reviewed source snapshot'}.`;
      }
      void send({
        version: 1,
        operationId,
        actor,
        instanceUrl,
        createdAt: new Date().toISOString(),
        path,
        body,
        description,
        destination: target,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the fields.');
    }
  };
  const recoverConfirmation = async (action: 'inspect' | 'abandon') => {
    if (!attempt || lock.current || busy || !journal.current || !instanceUrl) return;
    const savedJournal = journal.current;
    const submittedScope = accountScope;
    const current = () => alive.current && currentAccountScope.current === submittedScope;
    lock.current = true;
    setBusy(true);
    try {
      const context = await request<{ actor: ScannerActor }>('/api/v1/auth/context');
      if (!sameScannerActor(attempt, instanceUrl, context.actor))
        throw new Error(
          'Return to the original account and viewing profile. This recovery has not been retargeted.',
        );
      if (!current()) return;
      const result = await request<{
        status: 'acknowledged' | 'not_recorded' | 'abandoned';
        message?: string;
      }>('/api/v1/food-data/confirmations/recovery', {
        method: 'POST',
        headers: {
          'X-Bord-Expected-Profile-Id': attempt.actor.profileId,
          'X-Bord-Expected-User-Id': attempt.actor.userId,
        },
        body: JSON.stringify({
          action,
          operationId: attempt.operationId,
          actor: attempt.actor,
          command: attempt.body,
          commandPath: attempt.path,
        }),
      });
      if (result.status === 'acknowledged') {
        await savedJournal.acknowledge(attempt.operationId);
        if (!current()) return;
        setAttempt(null);
        setCompletedDestination(attempt.destination);
        setSaved(true);
        setMessage('The original confirmation was saved. No additional write was performed.');
      } else if (result.status === 'abandoned') {
        // Preserve the original unknown outcome before clearing the active lock.
        await savedJournal.archiveUnknown(attempt.operationId);
        await savedJournal.acknowledge(attempt.operationId);
        const closed = await savedJournal.closedUnknown();
        if (!current()) return;
        setClosedUnknown(closed);
        setAttempt(null);
        setRecords([]);
        setLocalProduct(null);
        setMessage(
          'Further execution of that operation is blocked. Its original unknown outcome is retained below; no changes were undone.',
        );
      } else {
        if (!current()) return;
        setRecoveryReviewed(true);
        setMessage(
          result.message ??
            'No receipt was found. The earlier outcome remains unknown. Review the saved destination before closing this confirmation.',
        );
      }
    } catch (error) {
      if (current())
        setMessage(
          error instanceof Error
            ? error.message
            : 'Recovery failed. The original confirmation is retained.',
        );
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  };
  const reloadList = async () => {
    if (!listId || busy || attempt) return;
    setBusy(true);
    try {
      const result = await request<{ list: List }>(
        `/api/v1/shopping-lists/${encodeURIComponent(listId)}`,
      );
      setList(result.list);
      setMessage('Current list loaded. Review the amount and matching item.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  };
  const originalPerson = attempt
    ? (state.profiles.find((profile) => profile.id === attempt.actor.profileId)?.displayName ??
      'the original viewing profile')
    : actor
      ? (state.profiles.find((profile) => profile.id === actor.profileId)?.displayName ??
        'the active viewing profile')
      : '';
  return (
    <Screen>
      <AppHeader back assistant={false} title="Scan and review food" />
      {!ready ? (
        <Button
          label="Retry recovery check"
          tone="secondary"
          disabled={busy}
          onPress={() => setRecoveryCheck((value) => value + 1)}
        />
      ) : null}
      {attempt ? (
        <Surface elevated>
          <StatusPill>Confirmation needs reconciliation</StatusPill>
          <Body>{attempt.description.replace(/ added to | recorded in /g, ' reviewed for ')}</Body>
          <Body muted>
            Original person: {originalPerson}. Prepared{' '}
            {new Date(attempt.createdAt).toLocaleString()}. This saved command may already have
            committed; opening this screen does not retry it.
          </Body>
          {scannerRecoveryMode(attempt) === 'exact_retry' ? (
            <Button
              label={busy ? 'Checking confirmation…' : 'Retry original confirmation'}
              disabled={busy || !ready}
              onPress={() => void send(attempt)}
            />
          ) : (
            <Body muted>
              Local Pantry recovery checks the retained receipt first. An absent older receipt
              cannot safely authorize another stock write.
            </Body>
          )}
          <Button
            label="Review saved destination"
            tone="secondary"
            disabled={busy}
            onPress={() =>
              router.push(attempt.destination === 'shopping' ? '/(app)/(lists)' : '/(app)/(pantry)')
            }
          />
          {
            <>
              <Button
                label="Check original confirmation receipt"
                tone="secondary"
                disabled={busy || !ready}
                onPress={() => void recoverConfirmation('inspect')}
              />
              {recoveryReviewed ? (
                <>
                  <Body muted>
                    After reviewing the saved destination, you can stop future execution of this
                    command. This does not prove that an older write failed and does not undo
                    changes. The original command stays in your closed-confirmation history.
                  </Body>
                  <Button
                    label="I reviewed the destination — close unknown confirmation"
                    tone="secondary"
                    disabled={busy}
                    onPress={() => void recoverConfirmation('abandon')}
                  />
                </>
              ) : null}
            </>
          }
          <Button
            label="Switch viewing profile"
            tone="quiet"
            disabled={busy}
            onPress={() => router.push('/settings/profiles')}
          />
        </Surface>
      ) : saved ? (
        <Surface>
          <StatusPill>Saved</StatusPill>
          <Body>{message}</Body>
          <Button
            label="View saved destination"
            onPress={() =>
              router.push(
                completedDestination === 'shopping' ? '/(app)/(lists)' : '/(app)/(pantry)',
              )
            }
          />
        </Surface>
      ) : !reviewName ? (
        <>
          {permission?.granted ? (
            <View
              style={{
                height: 280,
                overflow: 'hidden',
                borderRadius: tokens.radius.card,
                backgroundColor: tokens.color.ink,
              }}
            >
              <CameraView
                key={cameraKey}
                style={{ flex: 1 }}
                facing="back"
                onCameraReady={() => setCameraState('ready')}
                onMountError={() => {
                  setCameraState('error');
                  setMessage('Camera unavailable. Enter a barcode or retry.');
                }}
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={busy || !ready || cameraState !== 'ready' ? undefined : onScanned}
              />
            </View>
          ) : (
            <Surface>
              <Body>
                {permission
                  ? 'Allow camera access to scan, or enter a barcode manually.'
                  : 'Checking camera permission…'}
              </Body>
              <Button
                label="Allow camera access"
                disabled={busy}
                onPress={() => void requestPermission()}
              />
              {permission && !permission.canAskAgain ? (
                <Button
                  label="Open system settings"
                  tone="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              ) : null}
            </Surface>
          )}
          {permission?.granted ? (
            <Body muted>
              {cameraState === 'starting'
                ? 'Starting camera…'
                : cameraState === 'ready'
                  ? 'Camera ready. Aim at an EAN or UPC-A barcode.'
                  : 'Camera unavailable.'}
            </Body>
          ) : null}
          {cameraState === 'error' ? (
            <Button
              label="Retry camera"
              tone="secondary"
              onPress={() => {
                setCameraState('starting');
                setCameraKey((key) => key + 1);
              }}
            />
          ) : null}
          <Surface>
            <FormField
              label="Barcode"
              value={barcode}
              onChangeText={setBarcode}
              keyboardType="number-pad"
              editable={!busy && ready}
            />
            <Button
              label={busy ? 'Looking up…' : 'Look up barcode'}
              disabled={busy || !ready || !barcode.trim()}
              onPress={() => void lookup(barcode)}
            />
          </Surface>
        </>
      ) : (
        <Surface elevated>
          <StatusPill>{localProduct ? 'Review saved product' : 'Review source food'}</StatusPill>
          <EditorialText variant="title">{reviewName}</EditorialText>
          <Body muted>
            {localProduct
              ? [
                  localProduct.brand,
                  localProduct.defaultPackageAmount == null
                    ? ''
                    : `${localProduct.defaultPackageAmount} ${localProduct.defaultPackageUnit ?? ''} package`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : [record?.brand, record?.quantity, record?.canonicalGtin]
                  .filter(Boolean)
                  .join(' · ')}
          </Body>
          {localProduct ? (
            <Body>
              This verified barcode belongs to the saved household product. Its identity and source
              history remain attached; confirmation adds the reviewed amount without importing
              another product.
            </Body>
          ) : record ? (
            <>
              <Body>
                {record.provider === 'usda_fdc' ? 'USDA FoodData Central' : 'Open Food Facts'} ·{' '}
                {record.catalogRef
                  ? `revision ${record.catalogRef.source_revision.slice(0, 12)}`
                  : 'Direct provider record'}
              </Body>
              <Body muted>
                {record.citation} {record.license}
              </Body>
              <Body>
                Nutrition basis: {record.nutrientBasis?.replaceAll('_', ' ') ?? 'Not recorded'}
                {record.servingSize ? ` · ${record.servingSize}` : ''}. Missing nutrient/allergen
                evidence stays unknown.
              </Body>
              {record.nutrients.slice(0, 6).map((nutrient) => (
                <Body key={nutrient.nutrientCode}>
                  {nutrient.nutrientCode.replaceAll('_', ' ')}: {nutrient.amount} {nutrient.unit}
                </Body>
              ))}
              {records.length > 1
                ? records.map((choice, index) => (
                    <Button
                      key={`${choice.provider}:${choice.providerRecordId}`}
                      label={`${index === selected ? 'Selected: ' : ''}${choice.provider.replaceAll('_', ' ')} · ${choice.displayName}`}
                      disabled={busy || saved}
                      tone="secondary"
                      onPress={() => {
                        clearContext();
                        setSelected(index);
                      }}
                    />
                  ))
                : null}
              {record.catalogRef ? (
                <>
                  <Button
                    label={
                      contextBusy === 'measures' ? 'Loading measures…' : 'Show source measures'
                    }
                    tone="secondary"
                    disabled={busy || !!contextBusy || saved}
                    onPress={() => void readContext('measures')}
                  />
                  {measures ? (
                    measures.length ? (
                      measures.map((measure, index) => (
                        <View key={index}>
                          <Body>
                            {measure.label}
                            {measure.gramWeight !== null ? ` · ${measure.gramWeight} g` : ''}
                            {measure.form ? ` · ${measure.form}` : ''}
                            {measure.basis ? ` · ${measure.basis}` : ''}
                          </Body>
                          {measure.description && measure.description !== measure.modifier ? (
                            <Body muted>{measure.description}</Body>
                          ) : null}
                          {sourcePortionAmount(measure) && !saved ? (
                            <Button
                              label={`Use source portion (${measure.label}) · ${measure.gramWeight} g`}
                              tone="quiet"
                              disabled={busy}
                              onPress={() => {
                                const amount = sourcePortionAmount(measure)!;
                                setQuantity(String(amount.quantity));
                                setUnit(amount.unit);
                                setMessage(
                                  'The complete stated source portion was copied. Review before confirming.',
                                );
                              }}
                            />
                          ) : null}
                        </View>
                      ))
                    ) : (
                      <Body>
                        No supported measures exist for this revision. Enter a measured amount.
                      </Body>
                    )
                  ) : null}
                  {instanceUrl ? (
                    <>
                      <Button
                        label="Find official stores in web settings"
                        tone="quiet"
                        onPress={() =>
                          void Linking.openURL(`${instanceUrl}/settings/lists`).catch(() =>
                            setMessage(
                              'The web settings could not be opened. Your reviewed food is retained.',
                            ),
                          )
                        }
                      />
                      <Body muted>
                        Sign in to the same kitchen if requested. Store chain, area and location
                        filters are available there; your reviewed food remains here.
                      </Body>
                    </>
                  ) : null}
                  <Button
                    label={
                      contextBusy === 'storage-guidance'
                        ? 'Loading guidance…'
                        : 'Find storage guidance'
                    }
                    tone="secondary"
                    disabled={busy || !!contextBusy || saved}
                    onPress={() => void readContext('storage-guidance')}
                  />
                  {guidance ? (
                    guidance.length ? (
                      guidance.map((entry) => (
                        <View key={entry.id}>
                          <Body>
                            {[entry.name, entry.form, entry.storageState]
                              .filter(Boolean)
                              .join(' · ')}
                          </Body>
                          {Object.entries(entry.details).map(([key, value]) => (
                            <Body muted key={key}>
                              {key.replaceAll('_', ' ')}:{' '}
                              {value === null ? 'Not recorded' : String(value)}
                            </Body>
                          ))}
                          <Body muted>
                            {entry.attribution} · {entry.license}. Guidance does not set a batch
                            expiry date.
                          </Body>
                        </View>
                      ))
                    ) : (
                      <Body>No matching guidance is available in this source pack.</Body>
                    )
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {!saved ? (
            <>
              <Body>For {originalPerson}</Body>
              <FormField
                label={target === 'shopping' ? 'Amount in cart' : 'Amount added to Pantry'}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                editable={!busy}
              />
              <FormField label="Unit" value={unit} onChangeText={setUnit} editable={!busy} />
              <Body muted>
                Enter the physical amount. Package size, recipe demand and nutrition basis remain
                separate; no density conversion is assumed.
              </Body>
              {target === 'shopping' ? (
                <>
                  <Body>
                    {list
                      ? `Review the item in ${list.name}. Replacing a cart amount does not add to its previous amount.`
                      : 'Loading the selected list…'}
                  </Body>
                  <Button
                    label="Refresh current list"
                    tone="quiet"
                    disabled={busy}
                    onPress={() => void reloadList()}
                  />
                  {list?.items
                    .filter((item) => !item.checked)
                    .map((item) => (
                      <Button
                        key={item.id}
                        label={`Replace ${item.item}'s cart amount`}
                        tone="secondary"
                        disabled={busy || !!contextBusy}
                        onPress={() => confirm(item)}
                      />
                    ))}
                  <Button
                    label="Add separate in-cart entry"
                    disabled={busy || !!contextBusy || !list}
                    onPress={() => confirm()}
                  />
                </>
              ) : (
                <>
                  <Body>Storage location</Body>
                  {locations.map((location) => (
                    <Button
                      key={location.id}
                      label={`${location.id === locationId ? 'Selected: ' : ''}${location.path ?? location.name}`}
                      tone="secondary"
                      disabled={busy}
                      onPress={() => setLocationId(location.id)}
                    />
                  ))}
                  <Button
                    label={busy ? 'Saving…' : 'Confirm Pantry intake'}
                    disabled={busy || !!contextBusy || !locationId}
                    onPress={() => confirm()}
                  />
                </>
              )}
            </>
          ) : (
            <Button
              label={target === 'shopping' ? 'Open shopping list' : 'Open Pantry'}
              onPress={() =>
                router.replace(
                  target === 'shopping' && list ? `/(app)/(lists)/${list.id}` : '/(app)/(pantry)',
                )
              }
            />
          )}
          <Button
            label="Scan another"
            tone="quiet"
            disabled={busy}
            onPress={() => {
              clearContext();
              setRecords([]);
              setLocalProduct(null);
              setBarcode('');
              setSaved(false);
              setMessage('');
              scanLock.current = false;
              setCameraState('starting');
            }}
          />
        </Surface>
      )}
      {message ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[tokens.type.footnote, { color: tokens.color.ink }]}
        >
          {message}
        </Text>
      ) : null}
      {closedUnknown.length ? (
        <Surface>
          <EditorialText>Closed confirmations with unknown outcomes</EditorialText>
          <Body muted>
            These commands cannot run again. An earlier stock change may exist; closing did not undo
            it.
          </Body>
          {closedUnknown.map((operation) => (
            <Body key={operation.operationId}>
              {operation.description.replace(/ added to | recorded in /g, ' reviewed for ')} ·{' '}
              {new Date(operation.createdAt).toLocaleString()} · original operation{' '}
              {operation.operationId}
            </Body>
          ))}
        </Surface>
      ) : null}
    </Screen>
  );
}
