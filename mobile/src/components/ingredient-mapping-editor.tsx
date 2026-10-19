import * as React from 'react';
import { Alert } from 'react-native';
import { Body, Button, EditorialText, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
export function IngredientMappingEditor({
  recipeId,
  onSaved,
}: {
  recipeId: string;
  onSaved: () => void;
}) {
  const data = useResource<{
    availability: {
      ingredients: {
        id: string;
        item: string;
        productId: string | null;
        productName: string | null;
        isOptional: boolean;
      }[];
    };
  }>(`/api/v1/pantry/recipes/${recipeId}/availability`);
  const products = useResource<{ products: { id: string; displayName: string }[] }>(
    '/api/v1/pantry/products',
  );
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [open, setOpen] = React.useState(false);
  const [ingredientId, setIngredientId] = React.useState('');
  const [productId, setProductId] = React.useState('');
  const [optional, setOptional] = React.useState(false);
  const [compatible, setCompatible] = React.useState(false);
  const [unmapped, setUnmapped] = React.useState(false);
  const selected = data.data?.availability.ingredients.find((item) => item.id === ingredientId);
  const save = (remove = false) =>
    task.run(async () => {
      if (!selected || (!remove && !productId))
        throw new Error('Choose an ingredient and product.');
      await request(`/api/v1/pantry/mappings/${selected.id}`, {
        method: remove ? 'DELETE' : 'PUT',
        ...(remove
          ? {}
          : {
              body: JSON.stringify({
                productId,
                isOptional: optional,
                compatibleVariant: compatible,
              }),
            }),
      });
      data.reload();
      onSaved();
      setIngredientId('');
      await refresh();
    });
  return (
    <Surface style={{ gap: 12 }}>
      <Button
        label={open ? 'Hide ingredient mappings' : 'Map ingredients to Pantry products'}
        tone="secondary"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <>
          <Body muted>
            Mappings are shared by Pantry availability, shopping calculations and nutrition. Saving
            changes the recipe’s persistent mapping.
          </Body>
          <ResourceState resource={data} />
          <ResourceState resource={products} />
          <TaskError error={task.error} />
          <NativeToggle
            label="Show unmapped ingredients only"
            value={unmapped}
            onChange={setUnmapped}
          />
          <ChoiceField
            label="Ingredient"
            value={ingredientId}
            onChange={(value) => {
              setIngredientId(value);
              const item = data.data?.availability.ingredients.find((item) => item.id === value);
              setProductId(item?.productId ?? '');
              setOptional(item?.isOptional ?? false);
              setCompatible(false);
            }}
            searchable
            choices={(data.data?.availability.ingredients ?? [])
              .filter((item) => !unmapped || !item.productId)
              .map((item) => ({
                value: item.id,
                label: `${item.item} · ${item.productName ?? 'Not mapped'}`,
              }))}
          />
          {selected ? (
            <>
              <EditorialText>{selected.item}</EditorialText>
              <ChoiceField
                label="Pantry product"
                value={productId}
                onChange={setProductId}
                searchable
                choices={(products.data?.products ?? []).map((item) => ({
                  value: item.id,
                  label: item.displayName,
                }))}
              />
              <NativeToggle label="Optional ingredient" value={optional} onChange={setOptional} />
              <NativeToggle
                label="This is a compatible product variant"
                value={compatible}
                onChange={setCompatible}
              />
              <Button
                label="Save shared mapping"
                disabled={task.busy}
                onPress={() => void save()}
              />
              {selected.productId ? (
                <Button
                  label="Remove mapping"
                  tone="danger"
                  disabled={task.busy}
                  onPress={() =>
                    Alert.alert('Remove ingredient mapping?', selected.item, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => void save(true) },
                    ])
                  }
                />
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </Surface>
  );
}
