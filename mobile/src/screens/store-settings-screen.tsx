import * as React from 'react';
import { View } from 'react-native';
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
import { useAuth } from '@/auth/auth-context';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';

type Section = { aisleId: string; name: string; matchTerms: string[] };
type Store = {
  id: string;
  name: string;
  locationLabel: string;
  notes: string;
  archivedAt: string | null;
  sections: Section[];
};
type Settings = {
  defaultSupermarketProfileId: string | null;
  automaticRestockListId: string | null;
  completedItemsBehavior: string;
  openPantryPurchaseOnCheck: boolean;
  keepScreenAwake: boolean;
};
export function StoreSettingsScreen() {
  const { request } = useAuth();
  const task = useTask();
  const resource = useResource<{ settings: Settings; profiles: Store[] }>('/api/v1/settings/lists');
  const lists = useResource<{ lists: { id: string; name: string }[] }>('/api/v1/shopping-lists');
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [editing, setEditing] = React.useState<Store | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [archived, setArchived] = React.useState(false);
  const [sections, setSections] = React.useState<Section[]>([]);
  React.useEffect(() => {
    if (resource.data) setSettings(resource.data.settings);
  }, [resource.data]);
  const edit = (store?: Store) => {
    setEditing(store ?? null);
    setName(store?.name ?? '');
    setLocation(store?.locationLabel ?? '');
    setNotes(store?.notes ?? '');
    setArchived(Boolean(store?.archivedAt));
    setSections(
      store?.sections.map(({ aisleId, name, matchTerms }) => ({ aisleId, name, matchTerms })) ?? [
        { aisleId: '', name: 'Produce', matchTerms: [] },
      ],
    );
    setOpen(true);
  };
  const saveStore = () =>
    task.run(async () => {
      await request(
        editing ? `/api/v1/supermarket-profiles/${editing.id}` : '/api/v1/supermarket-profiles',
        {
          method: editing ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name,
            locationLabel: location,
            notes,
            sections: sections.map((section) => ({
              ...section,
              matchTerms: section.matchTerms.filter(Boolean),
            })),
            ...(editing ? { archived } : {}),
          }),
        },
      );
      setOpen(false);
      resource.reload();
    });
  const move = (index: number, direction: number) => {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
  };
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Shopping preferences</EditorialText>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      {settings ? (
        <Surface style={{ gap: 12 }}>
          <ChoiceField
            label="Default supermarket"
            value={settings.defaultSupermarketProfileId ?? ''}
            onChange={(value) => setSettings({ ...settings, defaultSupermarketProfileId: value })}
            choices={[
              { value: '', label: 'None' },
              ...(resource.data?.profiles ?? [])
                .filter((profile) => !profile.archivedAt)
                .map((profile) => ({ value: profile.id, label: profile.name })),
            ]}
          />
          <ChoiceField
            label="Automatic restock list"
            value={settings.automaticRestockListId ?? ''}
            onChange={(value) => setSettings({ ...settings, automaticRestockListId: value })}
            choices={[
              { value: '', label: 'None' },
              ...(lists.data?.lists ?? []).map((list) => ({ value: list.id, label: list.name })),
            ]}
          />
          <ChoiceField
            label="Completed items"
            value={settings.completedItemsBehavior}
            onChange={(value) => setSettings({ ...settings, completedItemsBehavior: value })}
            choices={['completed_section', 'hide', 'in_place'].map((value) => ({
              value,
              label: value.replaceAll('_', ' '),
            }))}
          />
          <NativeToggle
            label="Offer Pantry intake when checking items"
            value={settings.openPantryPurchaseOnCheck}
            onChange={(value) => setSettings({ ...settings, openPantryPurchaseOnCheck: value })}
          />
          <NativeToggle
            label="Keep shopping screen awake"
            value={settings.keepScreenAwake}
            onChange={(value) => setSettings({ ...settings, keepScreenAwake: value })}
          />
          <Button
            label="Save shopping preferences"
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                await request('/api/v1/settings/lists', {
                  method: 'PATCH',
                  body: JSON.stringify({
                    ...settings,
                    defaultSupermarketProfileId: settings.defaultSupermarketProfileId ?? '',
                    automaticRestockListId: settings.automaticRestockListId ?? '',
                  }),
                });
                resource.reload();
              })
            }
          />
        </Surface>
      ) : null}
      <EditorialText>Supermarkets & aisle order</EditorialText>
      <Button label="Add supermarket" onPress={() => edit()} />
      {resource.data?.profiles.map((store) => (
        <Surface key={store.id} style={{ gap: 8 }}>
          <EditorialText>{store.name}</EditorialText>
          <Body muted>
            {store.locationLabel}
            {store.archivedAt ? ' · archived' : ''}
          </Body>
          <Button label="Edit store & aisle order" tone="secondary" onPress={() => edit(store)} />
          <Button
            label="Duplicate store"
            tone="quiet"
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                await request(`/api/v1/supermarket-profiles/${store.id}/duplicate`, {
                  method: 'POST',
                });
                resource.reload();
              })
            }
          />
        </Surface>
      ))}
      {open ? (
        <Surface style={{ gap: 12 }}>
          <FormField label="Supermarket name" value={name} onChangeText={setName} />
          <FormField label="Location label" value={location} onChangeText={setLocation} />
          <FormField label="Notes" value={notes} onChangeText={setNotes} />
          {editing ? (
            <NativeToggle label="Archived" value={archived} onChange={setArchived} />
          ) : null}
          {sections.map((section, index) => (
            <View key={index} style={{ gap: 8 }}>
              <FormField
                label={`${index + 1}. Aisle name`}
                value={section.name}
                onChangeText={(value) =>
                  setSections(
                    sections.map((entry, i) => (i === index ? { ...entry, name: value } : entry)),
                  )
                }
              />
              <FormField
                label="Matching terms (comma separated)"
                value={section.matchTerms.join(', ')}
                onChangeText={(value) =>
                  setSections(
                    sections.map((entry, i) =>
                      i === index
                        ? { ...entry, matchTerms: value.split(',').map((term) => term.trim()) }
                        : entry,
                    ),
                  )
                }
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Button label="Up" tone="quiet" onPress={() => move(index, -1)} />
                <Button label="Down" tone="quiet" onPress={() => move(index, 1)} />
                <Button
                  label="Remove aisle"
                  tone="quiet"
                  disabled={sections.length === 1}
                  onPress={() => setSections(sections.filter((_, i) => i !== index))}
                />
              </View>
            </View>
          ))}
          <Button
            label="Add aisle"
            tone="secondary"
            onPress={() => setSections([...sections, { aisleId: '', name: '', matchTerms: [] }])}
          />
          <Button label="Save supermarket" disabled={task.busy} onPress={() => void saveStore()} />
          <Button label="Cancel" tone="secondary" onPress={() => setOpen(false)} />
        </Surface>
      ) : null}
    </Screen>
  );
}
