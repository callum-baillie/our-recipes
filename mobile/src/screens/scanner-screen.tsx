import * as React from 'react';
import { usePreventRemove } from '@react-navigation/native';
import { Linking, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { randomUUID } from 'expo-crypto';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { catalogConfirmation, catalogQuantity, type ReviewedCatalogFood } from '@/data/catalog';
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
type Attempt = { path: string; body: unknown; description: string };

export function BarcodeScannerScreen() {
  const { target = 'pantry', listId } = useLocalSearchParams<{
    target?: 'pantry' | 'shopping';
    listId?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [barcode, setBarcode] = React.useState('');
  const [records, setRecords] = React.useState<ReviewedCatalogFood[]>([]);
  const [selected, setSelected] = React.useState(0);
  const record = records[selected] ?? null;
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [cameraState, setCameraState] = React.useState<'starting' | 'ready' | 'error'>('starting');
  const [cameraKey, setCameraKey] = React.useState(0);
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('each');
  const [locations, setLocations] = React.useState<{ id: string; path?: string; name: string }[]>(
    [],
  );
  const [locationId, setLocationId] = React.useState('');
  const [list, setList] = React.useState<List | null>(null);
  const [attempt, setAttempt] = React.useState<Attempt | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [contextBusy, setContextBusy] = React.useState<'measures' | 'storage-guidance' | null>(
    null,
  );
  const [measures, setMeasures] = React.useState<
    { label: string; gramWeight: number | null; form: string | null; basis: string | null }[] | null
  >(null);
  const [guidance, setGuidance] = React.useState<
    | {
        id: string;
        name: string;
        storageState: string | null;
        form: string | null;
        details: Record<string, string | number | boolean | null>;
        attribution: string;
        license: string;
      }[]
    | null
  >(null);
  const readContext = async (kind: 'measures' | 'storage-guidance') => {
    if (!record?.catalogRef || contextBusy || busy || attempt) return;
    const reviewed = record;
    setContextBusy(kind);
    try {
      const response = await request<{
        measures?: NonNullable<typeof measures>;
        guidance?: NonNullable<typeof guidance>;
      }>(`/api/v1/food-data/catalog/${kind}`, {
        method: 'POST',
        body: JSON.stringify(
          kind === 'measures'
            ? { reference: reviewed.catalogRef }
            : { query: reviewed.displayName.slice(0, 200) },
        ),
      });
      if (kind === 'measures') setMeasures(response.measures ?? []);
      else setGuidance(response.guidance ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Source context is unavailable. Manual amounts remain usable.',
      );
    } finally {
      setContextBusy(null);
    }
  };
  usePreventRemove(!!attempt, () =>
    setMessage(
      busy
        ? 'This confirmation is still saving. Closing cannot cancel a server operation; wait for its result.'
        : 'This confirmation has no acknowledged result. Retry the same confirmation before leaving so its outcome can be reconciled.',
    ),
  );
  const reloadList = async () => {
    if (!listId || busy || attempt) return;
    setBusy(true);
    try {
      const result = await request<{ list: List }>(
        `/api/v1/shopping-lists/${encodeURIComponent(listId)}`,
      );
      setList(result.list);
      setMessage('Current list loaded. Review the matching item before confirming.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The list could not be refreshed.');
    } finally {
      setBusy(false);
    }
  };
  const lock = React.useRef(false);
  const scanLock = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
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
  const lookup = async (raw: string) => {
    if (lock.current || attempt) return;
    lock.current = true;
    scanLock.current = true;
    setBusy(true);
    setMessage('Looking up this barcode…');
    try {
      const result = await request<{
        preferred?: ReviewedCatalogFood | null;
        alternatives?: ReviewedCatalogFood[];
      }>('/api/v1/food-data/barcode-lookups', {
        method: 'POST',
        body: JSON.stringify({ barcode: raw, language: 'en', compareUsda: true }),
      });
      if (!alive.current) return;
      const choices = [result.preferred, ...(result.alternatives ?? [])].filter(
        (item): item is ReviewedCatalogFood => Boolean(item),
      );
      if (!choices.length)
        throw new Error(
          'No source match was found. Keep the barcode and try again, or add the product manually.',
        );
      setRecords(choices);
      setSelected(0);
      setMessage('Review the source and amount before confirming. Lookup has changed nothing.');
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : 'Lookup failed.');
      scanLock.current = false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const onScanned = (result: BarcodeScanningResult) => {
    if (!scanLock.current) {
      setBarcode(result.data);
      void lookup(result.data);
    }
  };
  const send = async (command: Attempt) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setAttempt(command);
    setMessage('Saving the reviewed selection…');
    try {
      await request(command.path, { method: 'POST', body: JSON.stringify(command.body) });
      if (!alive.current) return;
      setAttempt(null);
      setSaved(true);
      setMessage(command.description);
      try {
        await refresh();
      } catch {
        if (alive.current)
          setMessage(
            `${command.description} The workspace refresh failed; pull to refresh when connected.`,
          );
      }
    } catch (error) {
      if (!alive.current) return;
      const knownRejected =
        error instanceof Error &&
        'status' in error &&
        [400, 401, 403, 404, 409, 422].includes(Number(error.status));
      if (knownRejected) setAttempt(null);
      setMessage(
        `${error instanceof Error ? error.message : 'The response was lost.'}${knownRejected ? ' Review the fields before trying again.' : ' The outcome is unknown. Retry the same confirmation to reconcile it safely.'}`,
      );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const confirm = (item?: List['items'][number]) => {
    if (!record || attempt || busy || contextBusy) return;
    try {
      const amount = catalogQuantity(quantity, unit);
      const base = catalogConfirmation(record, randomUUID(), amount.unit);
      if (target === 'shopping') {
        if (!list) throw new Error('Reload the selected shopping list before confirming.');
        void send({
          path: `/api/v1/shopping-lists/${list.id}/catalog-items`,
          body: {
            ...base,
            ...(item ? { itemId: item.id, expectedUpdatedAt: item.updatedAt } : {}),
            cartQuantity: amount.quantity,
            cartUnit: amount.unit,
          },
          description: `${record.displayName} was matched to ${list.name} and marked in cart. No purchase or Pantry intake was recorded.`,
        });
      } else {
        if (!locationId) throw new Error('Choose a storage location.');
        void send({
          path: '/api/v1/pantry/catalog-imports',
          body: {
            ...base,
            batches: [
              {
                quantityRemaining: amount.quantity,
                originalQuantity: amount.quantity,
                unit: amount.unit,
                locationId,
                status: 'unopened',
                expiryPrecision: 'unknown',
                source: 'Reviewed barcode',
                notes: '',
              },
            ],
          },
          description: `${amount.quantity} ${amount.unit} of ${record.displayName} added to Pantry with the reviewed source snapshot.`,
        });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Check the fields.');
    }
  };
  return (
    <Screen>
      <AppHeader back assistant={false} title="Scan and review food" />
      {!record ? (
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
                  setMessage(
                    'The camera could not start. Enter the barcode or retry camera access.',
                  );
                }}
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
                onBarcodeScanned={busy || cameraState !== 'ready' ? undefined : onScanned}
              />
            </View>
          ) : (
            <Surface>
              <Body>
                {permission
                  ? 'Allow camera access to scan. Manual barcode entry works without camera permission.'
                  : 'Checking camera permission…'}
              </Body>
              <Button
                label="Allow camera access"
                disabled={busy}
                onPress={() => void requestPermission()}
              />
              {permission && !permission.canAskAgain && (
                <Button
                  label="Open system settings"
                  tone="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              )}
            </Surface>
          )}
          {permission?.granted && (
            <Body muted>
              {cameraState === 'starting'
                ? 'Starting camera…'
                : cameraState === 'ready'
                  ? 'Camera ready. Aim at an EAN or UPC-A barcode.'
                  : 'Camera unavailable.'}
            </Body>
          )}
          {cameraState === 'error' && (
            <Button
              label="Retry camera"
              tone="secondary"
              onPress={() => {
                setCameraState('starting');
                setCameraKey((key) => key + 1);
              }}
            />
          )}
          <Surface>
            <FormField
              label="Barcode"
              value={barcode}
              onChangeText={setBarcode}
              keyboardType="number-pad"
              editable={!busy}
            />
            <Button
              label={busy ? 'Looking up…' : 'Look up barcode'}
              disabled={busy || !barcode.trim()}
              onPress={() => void lookup(barcode)}
            />
          </Surface>
        </>
      ) : (
        <Surface elevated>
          <StatusPill>Review source food</StatusPill>
          <EditorialText variant="title">{record.displayName}</EditorialText>
          <Body muted>
            {[record.brand, record.quantity, record.canonicalGtin].filter(Boolean).join(' · ')}
          </Body>
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
            {record.servingSize ? ` · ${record.servingSize}` : ''}. Missing nutrients and allergen
            evidence remain unknown.
          </Body>
          {record.nutrients.slice(0, 6).map((nutrient) => (
            <Body key={nutrient.nutrientCode}>
              {nutrient.nutrientCode.replaceAll('_', ' ')}: {nutrient.amount} {nutrient.unit}
            </Body>
          ))}
          {records.length > 1 &&
            records.map((choice, index) => (
              <Button
                key={`${choice.provider}:${choice.providerRecordId}`}
                label={`${index === selected ? 'Selected: ' : ''}${choice.provider.replaceAll('_', ' ')} · ${choice.displayName}`}
                disabled={busy || !!contextBusy || !!attempt || saved}
                tone="secondary"
                onPress={() => {
                  setSelected(index);
                  setMeasures(null);
                  setGuidance(null);
                }}
              />
            ))}
          {record.catalogRef && (
            <>
              <Button
                label={contextBusy === 'measures' ? 'Loading measures…' : 'Show source measures'}
                tone="secondary"
                disabled={busy || !!contextBusy || !!attempt}
                onPress={() => void readContext('measures')}
              />
              {measures &&
                (measures.length ? (
                  measures.map((measure, index) => (
                    <View key={index}>
                      <Body>
                        {measure.label}
                        {measure.gramWeight !== null ? ` · ${measure.gramWeight} g` : ''}
                        {measure.form ? ` · ${measure.form}` : ''}
                        {measure.basis ? ` · ${measure.basis}` : ''}
                      </Body>
                      {measure.gramWeight !== null && !saved && (
                        <Button
                          label={`Use one ${measure.label} as ${measure.gramWeight} g`}
                          tone="quiet"
                          disabled={busy || !!attempt}
                          onPress={() => {
                            setQuantity(String(measure.gramWeight));
                            setUnit('g');
                            setMessage(
                              'Source measure copied to the amount. Review it before confirming.',
                            );
                          }}
                        />
                      )}
                    </View>
                  ))
                ) : (
                  <Body>
                    No supported measures exist for this revision. Enter a measured amount.
                  </Body>
                ))}
              <Button
                label={
                  contextBusy === 'storage-guidance'
                    ? 'Loading storage guidance…'
                    : 'Find storage guidance'
                }
                tone="secondary"
                disabled={busy || !!contextBusy || !!attempt}
                onPress={() => void readContext('storage-guidance')}
              />
              {guidance &&
                (guidance.length ? (
                  guidance.map((entry) => (
                    <View key={entry.id}>
                      <Body>
                        {[entry.name, entry.form, entry.storageState].filter(Boolean).join(' · ')}
                      </Body>
                      {Object.entries(entry.details).map(([key, value]) => (
                        <Body muted key={key}>
                          {key.replaceAll('_', ' ')}:{' '}
                          {value === null ? 'Not recorded' : String(value)}
                        </Body>
                      ))}
                      <Body muted>
                        {entry.attribution} · {entry.license}. Source guidance does not set a batch
                        expiry date.
                      </Body>
                    </View>
                  ))
                ) : (
                  <Body>No matching guidance is available in this source pack.</Body>
                ))}
            </>
          )}
          {!saved && (
            <>
              <FormField
                label={target === 'shopping' ? 'Amount in cart' : 'Amount added to Pantry'}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                editable={!busy && !attempt}
              />
              <FormField
                label="Unit"
                value={unit}
                onChangeText={setUnit}
                editable={!busy && !attempt}
              />
              <Body muted>
                Package size and nutrition basis are separate. Enter the physical amount; no density
                or serving conversion is assumed.
              </Body>
              {target === 'shopping' ? (
                <>
                  <Body>
                    {list
                      ? `Confirm the matching item in ${list.name}.`
                      : 'Loading the selected shopping list…'}
                  </Body>
                  <Button
                    label="Refresh current list"
                    tone="quiet"
                    disabled={busy || !!attempt}
                    onPress={() => void reloadList()}
                  />
                  {list?.items
                    .filter((item) => !item.checked)
                    .map((item) => (
                      <Button
                        key={item.id}
                        label={`Match ${item.item} and mark in cart`}
                        tone="secondary"
                        disabled={busy || !!attempt}
                        onPress={() => confirm(item)}
                      />
                    ))}
                  <Button
                    label="Add as new in-cart item"
                    disabled={busy || !!attempt || !list}
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
                      disabled={busy || !!attempt}
                      onPress={() => setLocationId(location.id)}
                    />
                  ))}
                  <Button
                    label={busy ? 'Saving…' : 'Confirm Pantry intake'}
                    disabled={busy || !!attempt || !locationId}
                    onPress={() => confirm()}
                  />
                </>
              )}
            </>
          )}
          {attempt && !busy && (
            <Button label="Retry the same confirmation" onPress={() => void send(attempt)} />
          )}
          {saved && (
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
            disabled={busy || !!attempt}
            onPress={() => {
              setRecords([]);
              setMeasures(null);
              setGuidance(null);
              setBarcode('');
              setSaved(false);
              setMessage('');
              scanLock.current = false;
              setCameraState('starting');
            }}
          />
        </Surface>
      )}
      {message && (
        <Text accessibilityRole="alert" style={[tokens.type.footnote, { color: tokens.color.ink }]}>
          {message}
        </Text>
      )}
    </Screen>
  );
}
