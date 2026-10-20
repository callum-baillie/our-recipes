import { shoppingAmountSummary } from '../../../shared/mobile-domain/shopping-amounts';
import { PantryPurchaseForm } from '@/components/pantry-purchase-form';
import * as React from 'react';
import { Alert, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useTask } from '@/hooks/use-task';
import { useResource } from '@/hooks/use-resource';
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
import { positiveNumber } from '@/data/nutrition-commands';

type Item = {
  id: string;
  item: string;
  quantity: number | null;
  unit: string;
  note: string;
  aisleId: string | null;
  shoppingState: string;
  cartQuantity?: number | null;
  cartUnit?: string | null;
  pantry?: { productId?: string | null } | null;
  checked: boolean;
};
type List = {
  id: string;
  name: string;
  archivedAt: string | null;
  notes: string;
  notesVersion: number;
  items: Item[];
  aisles: { id: string; name: string }[];
  supermarketProfileId: string | null;
};
export function ListManagerScreen() {
  const params = useLocalSearchParams<{ listId?: string; intakeItemId?: string }>();
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [intakeId, setIntakeId] = React.useState(params.intakeItemId ?? '');
  const [listId, setListId] = React.useState(params.listId ?? '');
  const [query, setQuery] = React.useState('');
  const lists = useResource<{ lists: Pick<List, 'id' | 'name' | 'archivedAt'>[] }>(
    '/api/v1/shopping-lists?includeArchived=true',
  );
  const resource = useResource<{ list: List }>(listId ? `/api/v1/shopping-lists/${listId}` : null);
  const stores = useResource<{
    profiles: { id: string; name: string; archivedAt: string | null }[];
  }>('/api/v1/supermarket-profiles');
  const [name, setName] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [storeId, setStoreId] = React.useState('');
  const [editItem, setEditItem] = React.useState<Item | null>(null);
  const [itemName, setItemName] = React.useState('');
  const [quantity, setQuantity] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [itemNote, setItemNote] = React.useState('');
  const [aisleId, setAisleId] = React.useState('');
  const [formOpen, setFormOpen] = React.useState(false);
  React.useEffect(() => {
    if (resource.data) {
      setName(resource.data.list.name);
      setNotes(resource.data.list.notes);
      setStoreId(resource.data.list.supermarketProfileId ?? '');
      setFormOpen(false);
    }
  }, [resource.data]);
  const reconcile = async () => {
    resource.reload();
    lists.reload();
    await refresh();
  };
  const manage = (action: string, extra: Record<string, unknown> = {}) =>
    task.run(async () => {
      const { list } = await request<{ list: List }>(`/api/v1/shopping-lists/${listId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...extra }),
      });
      if (action === 'duplicate') setListId(list.id);
      await reconcile();
    });
  const edit = (item?: Item) => {
    setEditItem(item ?? null);
    setItemName(item?.item ?? '');
    setQuantity(item?.quantity == null ? '' : String(item.quantity));
    setUnit(item?.unit ?? '');
    setItemNote(item?.note ?? '');
    setAisleId(item?.aisleId ?? '');
    setFormOpen(true);
  };
  const saveItem = () =>
    task.run(async () => {
      if (!itemName.trim()) throw new Error('Enter an item name.');
      await request(`/api/v1/shopping-lists/${listId}/items${editItem ? `/${editItem.id}` : ''}`, {
        method: editItem ? 'PATCH' : 'POST',
        body: JSON.stringify({
          item: itemName.trim(),
          quantity: quantity.trim() ? positiveNumber(quantity, 'Quantity', 10000) : '',
          unit,
          note: itemNote,
          aisleId,
          checked: editItem?.checked ?? false,
          shoppingState: editItem?.shoppingState ?? 'to_buy',
        }),
      });
      setFormOpen(false);
      await reconcile();
    });
  const move = (item: Item, direction: -1 | 1) =>
    task.run(async () => {
      const ids = resource.data?.list.items.map((entry) => entry.id) ?? [];
      const index = ids.indexOf(item.id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      await request(`/api/v1/shopping-lists/${listId}`, {
        method: 'PATCH',
        body: JSON.stringify({ itemIds: ids }),
      });
      await reconcile();
    });
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Manage shopping lists</EditorialText>
      <TaskError error={task.error} />
      <ResourceState resource={lists} />
      <ChoiceField
        label="List"
        value={listId}
        onChange={(value) => {
          setListId(value);
          setIntakeId('');
        }}
        searchable
        choices={(lists.data?.lists ?? []).map((list) => ({
          value: list.id,
          label: `${list.name}${list.archivedAt ? ' · archived' : ''}`,
        }))}
      />
      <ResourceState resource={resource} />
      {intakeId && resource.data?.list.items.some((item) => item.id === intakeId) ? (
        <PantryPurchaseForm
          key={`${listId}:${intakeId}`}
          listId={listId}
          itemId={intakeId}
          itemName={resource.data.list.items.find((item) => item.id === intakeId)!.item}
          reviewedItem={resource.data.list.items.find((item) => item.id === intakeId)!}
          onDone={() => {
            setIntakeId('');
            resource.reload();
          }}
        />
      ) : null}
      {resource.data ? (
        <>
          <Surface style={{ gap: 12 }}>
            <FormField label="List name" value={name} onChangeText={setName} />
            <Button
              label="Rename list"
              tone="secondary"
              disabled={task.busy}
              onPress={() => void manage('rename', { name })}
            />
            <FormField label="Shared notes" multiline value={notes} onChangeText={setNotes} />
            <Button
              label="Save notes"
              tone="secondary"
              disabled={task.busy}
              onPress={() =>
                void manage('set_notes', {
                  note: notes,
                  expectedVersion: resource.data!.list.notesVersion,
                })
              }
            />
            <ChoiceField
              label="Supermarket"
              value={storeId}
              onChange={setStoreId}
              choices={[
                { value: '', label: 'No supermarket' },
                ...(stores.data?.profiles ?? [])
                  .filter((store) => !store.archivedAt)
                  .map((store) => ({ value: store.id, label: store.name })),
              ]}
            />
            <Button
              label="Use supermarket route"
              tone="secondary"
              disabled={task.busy}
              onPress={() =>
                void task.run(async () => {
                  await request(`/api/v1/shopping-lists/${listId}/supermarket-profile`, {
                    method: 'PATCH',
                    body: JSON.stringify({ supermarketProfileId: storeId }),
                  });
                  await reconcile();
                })
              }
            />
            <Button
              label="Duplicate list"
              tone="secondary"
              disabled={task.busy}
              onPress={() => void manage('duplicate')}
            />
            <Button
              label={resource.data.list.archivedAt ? 'Restore list' : 'Archive list'}
              tone="secondary"
              disabled={task.busy}
              onPress={() => void manage(resource.data!.list.archivedAt ? 'restore' : 'archive')}
            />
            <Button
              label="Delete list permanently"
              tone="danger"
              disabled={task.busy}
              onPress={() =>
                Alert.alert('Permanently delete this list?', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () =>
                      void task.run(async () => {
                        await request(`/api/v1/shopping-lists/${listId}`, { method: 'DELETE' });
                        setListId('');
                        await reconcile();
                      }),
                  },
                ])
              }
            />
          </Surface>
          <Button label="Add item" icon="plus" onPress={() => edit()} />
          {formOpen ? (
            <Surface style={{ gap: 12 }}>
              <EditorialText>{editItem ? 'Edit item' : 'New item'}</EditorialText>
              <FormField label="Item" value={itemName} onChangeText={setItemName} />
              <FormField
                label="Quantity (optional)"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
              <FormField label="Unit" value={unit} onChangeText={setUnit} />
              <FormField label="Note" value={itemNote} onChangeText={setItemNote} />
              <ChoiceField
                label="Aisle"
                value={aisleId}
                onChange={setAisleId}
                choices={[
                  { value: '', label: 'Other' },
                  ...resource.data.list.aisles.map((aisle) => ({
                    value: aisle.id,
                    label: aisle.name,
                  })),
                ]}
              />
              <Button label="Save item" disabled={task.busy} onPress={() => void saveItem()} />
              <Button label="Cancel" tone="secondary" onPress={() => setFormOpen(false)} />
            </Surface>
          ) : null}
          <FormField label="Find items" value={query} onChangeText={setQuery} />
          {resource.data.list.items
            .filter((item) => item.item.toLowerCase().includes(query.toLowerCase()))
            .map((item) => (
              <Surface key={item.id} style={{ gap: 8 }}>
                <EditorialText>{item.item}</EditorialText>
                <Button
                  label="Record purchase in Pantry"
                  tone="secondary"
                  onPress={() => setIntakeId(item.id)}
                />
                <Body>
                  Requested: {shoppingAmountSummary(item).requested} ·{' '}
                  {item.shoppingState.replaceAll('_', ' ')}
                </Body>
                {item.cartQuantity != null || item.cartUnit ? (
                  <Body>In cart: {shoppingAmountSummary(item).cart}</Body>
                ) : null}
                <Button label="Edit item" tone="secondary" onPress={() => edit(item)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button
                    label="Move up"
                    tone="quiet"
                    disabled={task.busy}
                    onPress={() => void move(item, -1)}
                  />
                  <Button
                    label="Move down"
                    tone="quiet"
                    disabled={task.busy}
                    onPress={() => void move(item, 1)}
                  />
                </View>
                <Button
                  label="Remove item"
                  tone="danger"
                  disabled={task.busy}
                  onPress={() =>
                    Alert.alert('Remove item?', item.item, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () =>
                          void task.run(async () => {
                            await request(`/api/v1/shopping-lists/${listId}/items/${item.id}`, {
                              method: 'DELETE',
                            });
                            await reconcile();
                          }),
                      },
                    ])
                  }
                />
              </Surface>
            ))}
          <Button
            label="Open shopping mode"
            disabled={Boolean(resource.data.list.archivedAt)}
            onPress={() => router.push(`/(app)/(lists)/${listId}`)}
          />
        </>
      ) : null}
    </Screen>
  );
}
