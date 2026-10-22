import * as React from 'react';
import * as Crypto from 'expo-crypto';
import { View } from 'react-native';
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
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';

type Item = {
  id: string;
  revision: number;
  name: string;
  typeKey: string;
  availability: string;
  measurements: { value: number; unit: string; basis: string; provenance: string }[];
  capabilities: string[];
  [key: string]: unknown;
};
type Kitchen = {
  viewerProfileId: string;
  id: string;
  revision: number;
  coverage: string;
  items: Item[];
  canManage: boolean;
};
type Template = {
  key: string;
  name: string;
  category: string;
  capabilities: string[];
  aliases: string[];
};
const inputOf = (item: Item) =>
  Object.fromEntries(
    Object.entries(item).filter(
      ([key]) => !['id', 'revision', 'createdAt', 'updatedAt', 'actorProfileId'].includes(key),
    ),
  );
export function MyKitchenScreen() {
  const { request, instanceUrl, user } = useAuth();
  const resource = useResource<{ kitchen: Kitchen }>('/api/v1/kitchen');
  const catalog = useResource<{ templates: Template[] }>('/api/v1/kitchen/catalog');
  const task = useTask();
  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null);
  const [target, setTarget] = React.useState<Item | null>(null);
  const [count, setCount] = React.useState('1');
  const [baseline, setBaseline] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [message, setMessage] = React.useState('');
  const retry = React.useRef<{ fingerprint: string; body: string } | null>(null);
  // An account/instance switch invalidates the command, never replays it into another kitchen.
  React.useEffect(() => {
    setDraft(null);
    setTarget(null);
    retry.current = null;
  }, [instanceUrl, user?.id]);
  const kitchen = resource.data?.kitchen;
  const edit = (item?: Item, duplicate = false) => {
    if (!kitchen) return;
    setTarget(duplicate ? null : (item ?? null));
    setDraft(
      item ? inputOf(item) : { typeKey: 'custom', name: 'Custom equipment', measurements: [] },
    );
    setCount('1');
    setBaseline(kitchen.revision);
    setMessage('Unsaved draft. Offline changes are not sent automatically.');
  };
  const save = () =>
    task.run(async () => {
      if (!draft || !kitchen) return;
      if (!String(draft.name ?? '').trim()) throw new Error('Enter an equipment name.');
      if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 20)
        throw new Error('Add between 1 and 20 physical items.');
      const command = target
        ? {
            kind: 'update',
            itemId: target.id,
            expectedItemRevision: target.revision,
            expectedRevision: baseline,
            item: draft,
          }
        : { kind: 'add', count: Number(count), expectedRevision: baseline, item: draft };
      const fingerprint = JSON.stringify(command);
      const body =
        retry.current?.fingerprint === fingerprint
          ? retry.current.body
          : JSON.stringify({ ...command, operationId: Crypto.randomUUID() });
      retry.current = { fingerprint, body };
      await request('/api/v1/kitchen', {
        method: 'POST',
        body,
        headers: { 'x-bord-expected-profile-id': kitchen.viewerProfileId },
      });
      setDraft(null);
      retry.current = null;
      setMessage('Equipment saved.');
      resource.reload();
    });
  return (
    <Screen>
      <AppHeader title="My Kitchen" back />
      <EditorialText>Your appliances, cookware and cooking setup.</EditorialText>
      <Body>
        Shared with your household. Each row is one physical item; modes and attachments do not
        create another base.
      </Body>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      {message ? <Body>{message}</Body> : null}
      {kitchen?.canManage ? <Button label="Add equipment" onPress={() => edit()} /> : null}
      {draft ? (
        <Surface>
          <Body>Unsaved household equipment draft</Body>
          <ChoiceField
            label="Equipment type"
            searchable
            value={String(draft.typeKey)}
            choices={(catalog.data?.templates ?? []).map((t) => ({
              value: t.key,
              label: `${t.category} · ${t.name} · ${t.aliases.join(', ')}`,
            }))}
            onChange={(value) => {
              const t = catalog.data?.templates.find((t) => t.key === value);
              if (t)
                setDraft({
                  ...draft,
                  typeKey: t.key,
                  name: t.name,
                  capabilities: t.capabilities,
                  measurements: [],
                });
            }}
          />
          <FormField
            label="Nickname"
            value={String(draft.name ?? '')}
            onChangeText={(name) => setDraft({ ...draft, name })}
          />
          {!target ? (
            <FormField
              label="Number of separate physical items"
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
            />
          ) : null}
          <FormField
            label="Make (optional)"
            value={String(draft.make ?? '')}
            onChangeText={(make) => setDraft({ ...draft, make })}
          />
          <FormField
            label="Model / variant (optional)"
            value={String(draft.model ?? '')}
            onChangeText={(model) => setDraft({ ...draft, model })}
          />
          <ChoiceField
            label="Availability"
            value={String(draft.availability ?? 'available')}
            choices={[
              { value: 'available', label: 'Available' },
              { value: 'unavailable', label: 'Unavailable until restored' },
              ...(target
                ? [{ value: 'archived', label: 'Remove selected item; keep history' }]
                : []),
            ]}
            onChange={(availability) => setDraft({ ...draft, availability })}
          />
          <Body>
            Review: {draft.name as string}.{' '}
            {target
              ? 'Updates this selected item.'
              : 'Adds separate equipment and preserves existing items.'}{' '}
            Unknown size stays unknown. Earlier plan reviews require revalidation.
          </Body>
          <Button label="Review and save" disabled={task.busy} onPress={() => void save()} />
          <Button
            label="Discard draft"
            disabled={task.busy}
            tone="secondary"
            onPress={() => setDraft(null)}
          />
        </Surface>
      ) : null}
      <FormField label="Search inventory" value={query} onChangeText={setQuery} />
      {kitchen?.items
        .filter(
          (i) =>
            i.availability !== 'archived' && i.name.toLowerCase().includes(query.toLowerCase()),
        )
        .map((item, index) => (
          <Surface key={item.id}>
            <View
              accessible
              accessibilityLabel={`${item.name}, item ${index + 1}, ${item.availability}`}
            >
              <EditorialText>
                {item.name} · Item {index + 1}
              </EditorialText>
              <Body>
                {item.measurements.length
                  ? item.measurements.map((m) => `${m.value} ${m.unit} (${m.basis})`).join(', ')
                  : 'Size not recorded'}
              </Body>
              <Body>
                {item.capabilities.join(', ').replaceAll('-', ' ')} · {item.availability}
              </Body>
            </View>
            {kitchen.canManage ? (
              <>
                <Button label={`Edit ${item.name}`} tone="secondary" onPress={() => edit(item)} />
                <Button
                  label="Add another like this"
                  tone="secondary"
                  onPress={() => edit(item, true)}
                />
              </>
            ) : null}
          </Surface>
        ))}
      <Body>
        Manual cooking remains available with an incomplete kitchen. AI equipment sharing is a
        separate account choice in AI preferences.
      </Body>
    </Screen>
  );
}
