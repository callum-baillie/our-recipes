import * as React from 'react';
import { router } from 'expo-router';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  FormField,
  NativeToggle,
  Screen,
  Surface,
} from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
type Location = {
  id: string;
  name: string;
  parentId: string | null;
  storageType: string;
  description: string;
  position: number;
  archivedAt: string | null;
};
export function PantryLocationsScreen() {
  const resource = useResource<{ locations: Location[] }>(
    '/api/v1/pantry/locations?includeArchived=true',
  );
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [editing, setEditing] = React.useState<Location | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [storage, setStorage] = React.useState('pantry');
  const [parent, setParent] = React.useState('');
  const [archived, setArchived] = React.useState(false);
  const edit = (item?: Location) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setStorage(item?.storageType ?? 'pantry');
    setParent(item?.parentId ?? '');
    setArchived(Boolean(item?.archivedAt));
    setOpen(true);
  };
  const save = () =>
    task.run(async () => {
      if (!name.trim()) throw new Error('Enter a location name.');
      await request(`/api/v1/pantry/locations${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description,
          parentId: parent,
          storageType: storage,
          archived,
          ...(editing ? { position: editing.position } : {}),
        }),
      });
      setOpen(false);
      resource.reload();
      await refresh();
    });
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Pantry locations</EditorialText>
      <Body muted>Organize storage into rooms, shelves and drawers.</Body>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      <Button label="Add location" onPress={() => edit()} />
      {open ? (
        <Surface style={{ gap: 12 }}>
          <FormField label="Name" value={name} onChangeText={setName} />
          <FormField label="Description" value={description} onChangeText={setDescription} />
          <ChoiceField
            label="Storage"
            value={storage}
            onChange={setStorage}
            choices={['pantry', 'refrigerator', 'freezer', 'counter', 'other'].map((value) => ({
              value,
              label: value,
            }))}
          />
          <ChoiceField
            label="Inside location"
            value={parent}
            onChange={setParent}
            searchable
            choices={[
              { value: '', label: 'Top level' },
              ...(resource.data?.locations ?? [])
                .filter((item) => item.id !== editing?.id && !item.archivedAt)
                .map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
          <NativeToggle label="Archived" value={archived} onChange={setArchived} />
          <Button label="Save location" disabled={task.busy} onPress={() => void save()} />
          <Button label="Cancel" tone="secondary" onPress={() => setOpen(false)} />
        </Surface>
      ) : null}
      {resource.data?.locations.map((item) => (
        <Surface key={item.id} style={{ gap: 8 }}>
          <EditorialText>{item.name}</EditorialText>
          <Body muted>
            {item.storageType}
            {item.archivedAt ? ' · Archived' : ''}
            {item.parentId
              ? ` · inside ${resource.data?.locations.find((parent) => parent.id === item.parentId)?.name ?? 'another location'}`
              : ''}
          </Body>
          {item.description ? <Body>{item.description}</Body> : null}
          <Button label="Edit location" tone="secondary" onPress={() => edit(item)} />
        </Surface>
      ))}
      <Button
        label="Manage stock"
        tone="secondary"
        onPress={() => router.push('/(app)/(pantry)/inventory')}
      />
    </Screen>
  );
}
