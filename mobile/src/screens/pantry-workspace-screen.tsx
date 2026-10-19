import type { AppPreferences } from '@/components/server-preferences';
import * as React from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  FormField,
  Screen,
  Surface,
} from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { localDate } from '@/data/planner';
import { positiveNumber } from '@/data/nutrition-commands';
import { validDate } from '@/data/meal-entry';

type Batch = {
  id: string;
  version: number;
  productId: string;
  quantityRemaining: number | null;
  unit: string;
  status: string;
  product?: { displayName: string; category?: string };
  location?: { name: string };
  expiry?: { state: string; date: string | null };
  quantityLabel?: string;
};
export function PantryWorkspaceScreen() {
  const params = useLocalSearchParams<{ batchId?: string }>();
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [batchId, setBatchId] = React.useState(params.batchId ?? '');
  const preferences = useResource<{ preferences: AppPreferences }>('/api/v1/settings/preferences');
  const [chosenFilter, setFilter] = React.useState<string | null>(null);
  const [chosenSort, setSort] = React.useState<string | null>(null);
  const [chosenGroup, setGroup] = React.useState<string | null>(null);
  const [limit, setLimit] = React.useState(60);
  const group = chosenGroup ?? preferences.data?.preferences.pantry.defaultGroup ?? 'none';
  const filter = chosenFilter ?? preferences.data?.preferences.pantry.defaultView ?? 'all';
  const sort = chosenSort ?? preferences.data?.preferences.pantry.defaultSort ?? 'expiry';
  const batches = useResource<{ batches: Batch[] }>(
    `/api/v1/pantry/batches?includeInactive=true&view=${filter}&sort=${sort}`,
  );
  const grouped = React.useMemo(() => {
    const groups = new Map<string, Batch[]>();
    for (const batch of (batches.data?.batches ?? []).slice(0, limit)) {
      const label =
        group === 'location'
          ? (batch.location?.name ?? 'Unknown location')
          : group === 'category'
            ? batch.product?.category || 'Uncategorized'
            : group === 'expiry'
              ? (batch.expiry?.state ?? 'Unknown date')
              : 'All batches';
      groups.set(label, [...(groups.get(label) ?? []), batch]);
    }
    return [...groups];
  }, [batches.data, group, limit]);
  const detail = useResource<{ batch: Batch }>(
    batchId ? `/api/v1/pantry/batches/${batchId}` : null,
  );
  const locations = useResource<{ locations: { id: string; name: string; storageType: string }[] }>(
    '/api/v1/pantry/locations',
  );
  const events = useResource<{
    events: { id: string; eventType: string; reason: string; note: string; createdAt: string }[];
  }>(batchId ? `/api/v1/pantry/events?batchId=${batchId}&limit=50` : null);
  const [action, setAction] = React.useState('consume');
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [targetId, setTargetId] = React.useState('');
  const [date, setDate] = React.useState(localDate(new Date()));
  const [reason, setReason] = React.useState('');
  const [note, setNote] = React.useState('');
  React.useEffect(() => {
    if (detail.data) setUnit(detail.data.batch.unit);
  }, [detail.data]);
  const perform = () =>
    task.run(async () => {
      const batch = detail.data?.batch;
      if (!batch) throw new Error('Choose a current batch.');
      const payload: Record<string, unknown> = {
        type: action,
        expectedVersion: batch.version,
        note,
      };
      if (['consume', 'split'].includes(action))
        Object.assign(payload, { quantity: positiveNumber(quantity, 'Quantity'), unit });
      if (['correct', 'restore'].includes(action)) {
        const number = Number(quantity);
        if (!quantity.trim() || !Number.isFinite(number) || number < 0)
          throw new Error('Enter a nonnegative quantity.');
        Object.assign(payload, { quantityRemaining: number, unit, approximateState: null });
      }
      if (['consume', 'correct', 'discard', 'donate'].includes(action))
        payload.reason = reason || (action === 'consume' ? 'Manual consumption' : '');
      if (action === 'correct' && !reason.trim()) throw new Error('Add a correction reason.');
      if (['open', 'freeze', 'thaw'].includes(action)) {
        if (!validDate(date)) throw new Error('Enter a valid date.');
        payload[
          action === 'open' ? 'openedDate' : action === 'freeze' ? 'frozenDate' : 'thawedDate'
        ] = date;
      }
      if (['move', 'freeze', 'split'].includes(action)) {
        if (action === 'move' && !locationId) throw new Error('Choose a destination location.');
        payload.locationId = locationId;
      }
      if (action === 'combine') {
        const target = batches.data?.batches.find((entry) => entry.id === targetId);
        if (!target) throw new Error('Choose the target batch.');
        Object.assign(payload, { targetBatchId: target.id, targetExpectedVersion: target.version });
      }
      await request(`/api/v1/pantry/batches/${batch.id}/actions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      batches.reload();
      detail.reload();
      events.reload();
      await refresh();
    });
  return (
    <Screen>
      <AppHeader back />
      <Button
        label="Manage storage locations"
        tone="secondary"
        onPress={() => router.push('/(app)/(pantry)/locations')}
      />
      <EditorialText variant="title">Pantry inventory</EditorialText>
      <TaskError error={task.error} />
      <ChoiceField
        label="Show batches"
        value={filter}
        onChange={setFilter}
        choices={[
          'all',
          'pantry',
          'refrigerator',
          'freezer',
          'opened',
          'unopened',
          'frozen',
          'depleted',
          'discarded',
          'donated',
          'low_stock',
          'recent',
        ].map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
      />
      <ChoiceField
        label="Sort inventory"
        value={sort}
        onChange={setSort}
        choices={['expiry', 'name', 'quantity', 'location', 'updated', 'added'].map((value) => ({
          value,
          label: value,
        }))}
      />
      <ChoiceField
        label="Group inventory"
        value={group}
        onChange={setGroup}
        choices={['none', 'location', 'category', 'expiry'].map((value) => ({
          value,
          label: value,
        }))}
      />
      <ResourceState resource={batches} />
      {group !== 'none' ? (
        <>
          {grouped.map(([label, items]) => (
            <Surface key={label} style={{ gap: 8 }}>
              <EditorialText>{label}</EditorialText>
              {items.map((batch) => (
                <View key={batch.id}>
                  <Button
                    label={`${batch.product?.displayName ?? 'Batch'} · ${batch.quantityLabel ?? batch.unit}`}
                    tone="secondary"
                    onPress={() => setBatchId(batch.id)}
                  />
                </View>
              ))}
            </Surface>
          ))}
          {(batches.data?.batches.length ?? 0) > limit ? (
            <Button
              label="Show more inventory"
              tone="secondary"
              onPress={() => setLimit((value) => value + 60)}
            />
          ) : null}
        </>
      ) : null}
      <ChoiceField
        label="Batch"
        value={batchId}
        onChange={setBatchId}
        searchable
        choices={(batches.data?.batches ?? []).map((batch) => ({
          value: batch.id,
          label: `${batch.product?.displayName ?? 'Batch'} · ${batch.quantityLabel ?? batch.unit} · ${batch.status}`,
        }))}
      />
      <ResourceState resource={detail} />
      {detail.data ? (
        <Surface style={{ gap: 12 }}>
          <Body>
            Current quantity: {detail.data.batch.quantityRemaining ?? 'approximate'}{' '}
            {detail.data.batch.unit}
          </Body>
          <ChoiceField
            label="Action"
            value={action}
            onChange={setAction}
            choices={[
              'consume',
              'consume_one',
              'mark_empty',
              'open',
              'move',
              'freeze',
              'thaw',
              'correct',
              'split',
              'combine',
              'discard',
              'donate',
              'restore',
              'undo',
            ].map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
          />
          {['consume', 'correct', 'split', 'restore'].includes(action) ? (
            <>
              <FormField
                label="Quantity"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
              <FormField label="Unit" value={unit} onChangeText={setUnit} />
            </>
          ) : null}
          {['move', 'freeze', 'split'].includes(action) ? (
            <ChoiceField
              label="Destination"
              value={locationId}
              onChange={setLocationId}
              choices={(locations.data?.locations ?? [])
                .filter((location) => action !== 'freeze' || location.storageType === 'freezer')
                .map((location) => ({ value: location.id, label: location.name }))}
            />
          ) : null}
          {action === 'combine' ? (
            <ChoiceField
              label="Combine into"
              value={targetId}
              onChange={setTargetId}
              searchable
              choices={(batches.data?.batches ?? [])
                .filter(
                  (batch) =>
                    batch.id !== batchId && batch.productId === detail.data?.batch.productId,
                )
                .map((batch) => ({
                  value: batch.id,
                  label: `${batch.product?.displayName} · ${batch.quantityLabel ?? batch.quantityRemaining}`,
                }))}
            />
          ) : null}
          {['open', 'freeze', 'thaw'].includes(action) ? (
            <FormField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          ) : null}
          {['consume', 'correct', 'discard', 'donate'].includes(action) ? (
            <FormField label="Reason" value={reason} onChangeText={setReason} />
          ) : null}
          <FormField label="Note" value={note} onChangeText={setNote} />
          <Button
            label={task.busy ? 'Saving…' : `Confirm ${action.replaceAll('_', ' ')}`}
            disabled={task.busy}
            onPress={() =>
              ['discard', 'donate', 'mark_empty', 'combine'].includes(action)
                ? Alert.alert(
                    'Update this batch?',
                    'The quantity and inventory history will be updated.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Confirm', onPress: () => void perform() },
                    ],
                  )
                : void perform()
            }
          />
        </Surface>
      ) : null}
      {batchId ? (
        <>
          <EditorialText>Inventory history</EditorialText>
          <ResourceState resource={events} />
          {events.data?.events.map((event) => (
            <Surface key={event.id} style={{ gap: 6 }}>
              <Body>{event.eventType.replaceAll('_', ' ')}</Body>
              <Body muted>
                {new Date(event.createdAt).toLocaleString()} · {event.reason}
              </Body>
              {event.note ? <Body>{event.note}</Body> : null}
            </Surface>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
