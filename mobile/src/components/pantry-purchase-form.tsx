import * as React from 'react';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/auth-context';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useSync } from '@/sync/sync-context';
import { positiveNumber } from '@/data/nutrition-commands';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
export function PantryPurchaseForm({
  listId,
  itemId,
  itemName,
  onDone,
}: {
  listId: string;
  itemId: string;
  itemName: string;
  onDone: () => void;
}) {
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const products = useResource<{ products: { id: string; displayName: string }[] }>(
    '/api/v1/pantry/products',
  );
  const locations = useResource<{ locations: { id: string; name: string }[] }>(
    '/api/v1/pantry/locations',
  );
  const [productId, setProductId] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('each');
  const [mode, setMode] = React.useState('complete');
  const key = React.useRef(randomUUID());
  const save = () =>
    task.run(async () => {
      if (!productId || !locationId)
        throw new Error('Choose the Pantry product and storage location.');
      await request(`/api/v1/shopping-lists/${listId}/items/${itemId}/pantry-intake`, {
        method: 'POST',
        body: JSON.stringify({
          operationKey: key.current,
          productId,
          locationId,
          quantity: positiveNumber(quantity, 'Purchased quantity'),
          unit,
          intakeMode: mode,
          source: 'shopping-list-purchase',
        }),
      });
      await refresh();
      onDone();
    });
  return (
    <Surface style={{ gap: 12 }}>
      <EditorialText>Put {itemName} in Pantry</EditorialText>
      <Body muted>
        Record the quantity you actually bought. Partial intake keeps the remaining amount on your
        list.
      </Body>
      <TaskError error={task.error} />
      <ResourceState resource={products} />
      <ResourceState resource={locations} />
      <ChoiceField
        label="Pantry product"
        value={productId}
        onChange={setProductId}
        searchable
        choices={(products.data?.products ?? []).map((product) => ({
          value: product.id,
          label: product.displayName,
        }))}
      />
      <ChoiceField
        label="Storage location"
        value={locationId}
        onChange={setLocationId}
        choices={(locations.data?.locations ?? []).map((location) => ({
          value: location.id,
          label: location.name,
        }))}
      />
      <FormField
        label="Quantity purchased"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="decimal-pad"
      />
      <FormField label="Stock unit" value={unit} onChangeText={setUnit} />
      <ChoiceField
        label="Purchase"
        value={mode}
        onChange={setMode}
        choices={[
          { value: 'complete', label: 'Finished buying this item' },
          { value: 'partial', label: 'Still more to buy' },
        ]}
      />
      <Button label="Record purchase" disabled={task.busy} onPress={() => void save()} />
      <Button label="Cancel" tone="secondary" onPress={onDone} />
    </Surface>
  );
}
