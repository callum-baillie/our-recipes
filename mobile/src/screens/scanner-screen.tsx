import * as React from 'react';
import { Alert, Linking, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  Eyebrow,
  Screen,
  StatusPill,
  Surface,
} from '@/components/ui';
import { tokens } from '@/theme/tokens';

type FoodRecord = {
  provider: string;
  providerRecordId: string;
  canonicalGtin: string | null;
  displayName: string;
  brand: string;
  quantity: string;
  nutriScore: string;
};

export function BarcodeScannerScreen() {
  const { target = 'pantry', listId } = useLocalSearchParams<{
    target?: 'pantry' | 'shopping';
    listId?: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const { request } = useAuth();
  const { state } = useBord();
  const { refresh } = useSync();
  const [barcode, setBarcode] = React.useState('');
  const [record, setRecord] = React.useState<FoodRecord | null>(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scanLock = React.useRef(false);
  const list = state.lists.find((entry) => entry.id === listId);

  const lookup = React.useCallback(
    async (raw: string) => {
      const normalized = raw.replace(/[\s-]+/gu, '');
      if (!normalized || busy) return;
      setBusy(true);
      setBarcode(normalized);
      setRecord(null);
      setMessage('Looking up this exact barcode…');
      try {
        const result = await request<{
          preferred?: FoodRecord | null;
          alternatives?: FoodRecord[];
        }>('/api/v1/food-data/barcode-lookups', {
          method: 'POST',
          body: JSON.stringify({ barcode: normalized, language: 'en', compareUsda: true }),
        });
        const found = result.preferred ?? result.alternatives?.[0] ?? null;
        if (!found) throw new Error('No exact product was found for that barcode.');
        setRecord(found);
        setMessage('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Barcode lookup failed.');
        scanLock.current = false;
      } finally {
        setBusy(false);
      }
    },
    [busy, request],
  );

  const onScanned = (result: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    void lookup(result.data);
  };

  const matchShoppingItem = async (itemId: string) => {
    const item = list?.items.find((entry) => entry.id === itemId);
    if (!item || !record || !list) return;
    setBusy(true);
    try {
      await request(`/api/v1/shopping-lists/${list.id}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: item.quantity ?? '',
          unit: item.unit ?? '',
          item: item.name,
          note: [
            item.note,
            `Scanned ${record.displayName}${record.brand ? ` by ${record.brand}` : ''}`,
            record.canonicalGtin ? `GTIN ${record.canonicalGtin}` : '',
          ]
            .filter(Boolean)
            .join(' · ')
            .slice(0, 240),
          aisleId: item.aisleId ?? '',
          checked: false,
          shoppingState: 'in_cart',
        }),
      });
      await refresh();
      Alert.alert('Added to cart', `${item.name} was matched to ${record.displayName}.`, [
        { text: 'Done', onPress: () => router.back() },
        {
          text: 'Scan another',
          onPress: () => {
            setRecord(null);
            setBarcode('');
            scanLock.current = false;
          },
        },
      ]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The shopping item could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  };
  const addShoppingItem = async () => {
    if (!record || !list) return;
    setBusy(true);
    try {
      await request(`/api/v1/shopping-lists/${encodeURIComponent(list.id)}/items`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: '',
          unit: '',
          item: record.displayName,
          note: [record.brand, record.canonicalGtin ? `GTIN ${record.canonicalGtin}` : '']
            .filter(Boolean)
            .join(' · '),
          aisleId: '',
          checked: false,
          shoppingState: 'in_cart',
        }),
      });
      await refresh();
      Alert.alert('Added to cart', `${record.displayName} was added to ${list.name}.`, [
        { text: 'Done', onPress: () => router.back() },
        {
          text: 'Scan another',
          onPress: () => {
            setRecord(null);
            setBarcode('');
            scanLock.current = false;
          },
        },
      ]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The item could not be added.');
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <Screen scroll={false}>
        <AppHeader back assistant={false} title="Barcode scanner" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Body muted>Checking camera access…</Body>
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <AppHeader back assistant={false} title="Barcode scanner" />
        <Surface elevated>
          <Eyebrow>CAMERA ACCESS</Eyebrow>
          <EditorialText variant="title">Scan grocery barcodes</EditorialText>
          <Body muted>
            Bòrd uses the camera only while this scanner is open. Photos and video are not saved.
          </Body>
          <Button
            label="Allow camera access"
            icon="camera"
            onPress={() => void requestPermission()}
          />
          {!permission.canAskAgain ? (
            <Button
              label="Open system settings"
              tone="secondary"
              icon="gearshape"
              onPress={() => void Linking.openSettings()}
            />
          ) : null}
        </Surface>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader back assistant={false} title="Barcode scanner" />
      {!record ? (
        <>
          <View
            style={{
              height: 330,
              overflow: 'hidden',
              borderRadius: tokens.radius.largeCard,
              backgroundColor: tokens.color.ink,
            }}
          >
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={busy ? undefined : onScanned}
            />
            <View
              style={{
                pointerEvents: 'none',
                position: 'absolute',
                top: 75,
                left: 32,
                right: 32,
                height: 150,
                borderWidth: 3,
                borderColor: tokens.color.inverse,
                borderRadius: tokens.radius.control,
              }}
            />
          </View>
          <Surface>
            <Eyebrow>MANUAL FALLBACK</Eyebrow>
            <View style={{ flexDirection: 'row', gap: tokens.space.xs }}>
              <TextInput
                accessibilityLabel="Barcode"
                keyboardType="number-pad"
                value={barcode}
                onChangeText={setBarcode}
                placeholder="UPC or EAN"
                placeholderTextColor={tokens.color.inkTertiary}
                style={{
                  flex: 1,
                  minHeight: tokens.layout.touch,
                  borderWidth: 1,
                  borderColor: tokens.color.separator,
                  borderRadius: tokens.radius.control,
                  paddingHorizontal: tokens.space.sm,
                  color: tokens.color.ink,
                }}
              />
              <Button
                label={busy ? 'Looking up…' : 'Look up'}
                disabled={busy}
                onPress={() => {
                  scanLock.current = true;
                  void lookup(barcode);
                }}
              />
            </View>
          </Surface>
        </>
      ) : (
        <Surface elevated>
          <StatusPill>Exact barcode match</StatusPill>
          <EditorialText variant="title">{record.displayName}</EditorialText>
          <Body muted>
            {[record.brand, record.quantity, record.canonicalGtin].filter(Boolean).join(' · ')}
          </Body>
          {target === 'shopping' && list ? (
            <>
              <Eyebrow>ADD TO CART</Eyebrow>
              {list.items
                .filter((item) => !item.done)
                .slice(0, 8)
                .map((item) => (
                  <Button
                    key={item.id}
                    label={`Match ${item.name}`}
                    tone="secondary"
                    disabled={busy}
                    onPress={() => void matchShoppingItem(item.id)}
                  />
                ))}
              <Button
                label={`Add ${record.displayName} as a new item`}
                disabled={busy}
                onPress={() => void addShoppingItem()}
              />
            </>
          ) : (
            <>
              <Body>
                Product lookup is complete. Quantity and storage location still need confirmation
                before the server can create a Pantry batch.
              </Body>
              <Button
                label="Continue to Pantry intake"
                icon="shippingbox"
                onPress={() =>
                  router.replace({
                    pathname: '/(app)/(pantry)/new',
                    params: { name: record.displayName },
                  })
                }
              />
            </>
          )}
          <Button
            label="Scan another"
            tone="quiet"
            icon="barcode.viewfinder"
            onPress={() => {
              setRecord(null);
              setBarcode('');
              setMessage('');
              scanLock.current = false;
            }}
          />
        </Surface>
      )}
      {message ? (
        <Text
          accessibilityRole="alert"
          style={[tokens.type.footnote, { color: tokens.color.danger }]}
        >
          {message}
        </Text>
      ) : null}
    </Screen>
  );
}
