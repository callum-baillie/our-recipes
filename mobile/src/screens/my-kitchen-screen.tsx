import { NativeKitchenSetupGuide } from '@/components/kitchen-setup-guide';
import { useBord } from '@/state/bord-store';
import {
  nativeKitchenRecovery,
  parseKitchenDraft,
  sameKitchenDraftScope,
  type KitchenDraftScope,
  type KitchenPendingCommand,
} from '@/data/kitchen-recovery';
import {
  NativeKitchenMeasurementsEditor,
  type KitchenMeasurementDraft,
} from '@/components/kitchen-measurements-editor';
import {
  validateMeasurementDrafts,
  type MeasurementKind,
} from '../../../shared/kitchen-measurements';
import * as React from 'react';
import * as Crypto from 'expo-crypto';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
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
  measurements: KitchenMeasurementDraft[];
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
  resource: string;
  supportsIndependentResources: boolean;
  measurement: MeasurementKind;
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
  const { state, dispatch, hydrated } = useBord();
  const resource = useResource<{ kitchen: Kitchen }>('/api/v1/kitchen');
  const reloadKitchen = resource.reload;
  const hasFocused = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      if (hasFocused.current) reloadKitchen();
      else hasFocused.current = true;
    }, [reloadKitchen]),
  );

  const catalog = useResource<{ templates: Template[] }>('/api/v1/kitchen/catalog');
  const task = useTask();
  const [draft, setDraft] = React.useState<Record<string, unknown> | null>(null);
  const [draftOwner, setDraftOwner] = React.useState('');
  const [target, setTarget] = React.useState<Item | null>(null);
  const [count, setCount] = React.useState('1');
  const [baseline, setBaseline] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [message, setMessage] = React.useState('');
  const generation = React.useRef(0);
  const [pendingCommand, setPendingCommand] = React.useState<KitchenPendingCommand | null>(null);
  const [recoveredScope, setRecoveredScope] = React.useState('');
  const [recoveryError, setRecoveryError] = React.useState(false);
  const retry = React.useRef<{ fingerprint: string; body: string } | null>(null);
  const kitchen = resource.data?.kitchen;
  const profileId = kitchen?.viewerProfileId,
    kitchenId = kitchen?.id,
    userId = user?.id;
  const scope = React.useMemo<KitchenDraftScope | null>(
    () =>
      instanceUrl && userId && profileId && kitchenId
        ? { instanceUrl, userId, profileId, kitchenId }
        : null,
    [instanceUrl, userId, profileId, kitchenId],
  );
  const scopeKey = scope ? JSON.stringify(scope) : '';
  const recoveryReady = Boolean(scopeKey) && recoveredScope === scopeKey;
  React.useEffect(() => {
    let active = true;
    const runGeneration = ++generation.current;
    setDraft(null);
    setDraftOwner('');
    setTarget(null);
    setPendingCommand(null);
    retry.current = null;
    setRecoveredScope('');
    setRecoveryError(false);
    if (scope)
      void nativeKitchenRecovery(scope)
        .then((journal) => journal.read())
        .then((command) => {
          if (active) {
            setPendingCommand(command);
            setRecoveredScope(scopeKey);
          }
        })
        .catch((error) => {
          if (active) {
            setRecoveryError(true);
            setMessage(
              error instanceof Error ? error.message : 'Kitchen recovery could not be read.',
            );
          }
        });
    return () => {
      active = false;
      generation.current = runGeneration + 1;
    };
  }, [scope, scopeKey]);
  React.useEffect(() => {
    if (!draft || !scope || !hydrated || draftOwner !== scopeKey) return;
    try {
      const saved = parseKitchenDraft(
        JSON.stringify({
          version: 1,
          scope,
          item: draft,
          itemId: target?.id ?? null,
          itemRevision: target?.revision ?? null,
          kitchenRevision: baseline,
          count,
        }),
        scope,
      );
      dispatch({ type: 'set-kitchen-draft', draft: saved });
    } catch {
      setMessage('This draft is unsaved and could not be cached for restart recovery.');
    }
  }, [draft, scope, scopeKey, draftOwner, count, target, baseline, hydrated, dispatch]);
  const resumeDraft = () => {
    if (!state.kitchenDraft || !scope) return;
    try {
      const saved = parseKitchenDraft(JSON.stringify(state.kitchenDraft), scope);
      setDraftOwner(scopeKey);
      setDraft(saved.item);
      setTarget(
        saved.itemId
          ? ({ ...saved.item, id: saved.itemId, revision: saved.itemRevision } as Item)
          : null,
      );
      setBaseline(saved.kitchenRevision);
      setCount(saved.count);
      setMessage(
        'Unsaved draft restored with its original reviewed versions. Review current inventory before saving.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'This draft needs a fresh review.');
    }
  };
  const preflight = async (owner: KitchenDraftScope) => {
    const current = await request<{ actor: { userId: string; profileId: string } }>(
      '/api/v1/auth/context',
    );
    if (current.actor.userId !== owner.userId || current.actor.profileId !== owner.profileId)
      throw new Error(
        'The account or active profile changed. Return to the original profile to recover this change.',
      );
  };
  const reconcile = async (command: KitchenPendingCommand) => {
    if (!scope) throw new Error('Reconnect to the original kitchen first.');
    const ownGeneration = generation.current;
    const journal = await nativeKitchenRecovery(scope);
    await preflight(command.scope);
    const result = await request<{
      receipt: { itemIds: string[] };
      replayed: boolean;
      kitchen: Kitchen;
    }>('/api/v1/kitchen', {
      method: 'POST',
      body: command.body,
      headers: { 'x-bord-expected-profile-id': command.scope.profileId },
    });
    if (ownGeneration !== generation.current) return;
    await preflight(command.scope);
    await journal.acknowledge(command.operationId);
    if (ownGeneration !== generation.current) return;
    setPendingCommand(null);
    setDraft(null);
    retry.current = null;
    dispatch({ type: 'set-kitchen-draft', draft: null });
    const names = result.receipt.itemIds
      .map((id) => result.kitchen.items.find((item) => item.id === id)?.name)
      .filter(Boolean)
      .join(', ');
    setMessage(
      `${result.replayed ? 'Recovered the saved change' : 'Saved equipment'}${names ? ': ' + names : ''}.`,
    );
    resource.reload();
  };
  const recover = () =>
    task.run(async () => {
      if (!scope || !pendingCommand) return;
      const command = await (await nativeKitchenRecovery(scope)).read();
      if (!command)
        throw new Error(
          'This recovery record is no longer available. Review inventory before starting another change.',
        );
      await reconcile(command);
    });
  const discardPending = () =>
    task.run(async () => {
      if (!scope || !pendingCommand) return;
      await preflight(scope);
      await (await nativeKitchenRecovery(scope)).acknowledge(pendingCommand.operationId);
      setPendingCommand(null);
      setDraft(null);
      retry.current = null;
      dispatch({ type: 'set-kitchen-draft', draft: null });
      setMessage(
        'Pending command discarded after your inventory review. Any already saved equipment remains saved.',
      );
    });
  const clearUnreadable = () =>
    task.run(async () => {
      if (!scope) return;
      await preflight(scope);
      await (await nativeKitchenRecovery(scope)).discardUnreadableAfterReview();
      setRecoveryError(false);
      setRecoveredScope(scopeKey);
      setMessage(
        'Unreadable local recovery cleared after your inventory review. No equipment was changed.',
      );
    });
  const edit = (item?: Item, duplicate = false) => {
    if (!kitchen || !recoveryReady || pendingCommand) return;
    setDraftOwner(scopeKey);
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
      if (
        !draft ||
        draftOwner !== scopeKey ||
        !kitchen ||
        !scope ||
        !recoveryReady ||
        pendingCommand
      )
        return;
      validateMeasurementDrafts((draft.measurements ?? []) as KitchenMeasurementDraft[]);
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
      const commandRecord: KitchenPendingCommand = {
        version: 1,
        scope,
        operationId: JSON.parse(body).operationId,
        body,
        createdAt: new Date().toISOString(),
      };
      await preflight(scope);
      await (await nativeKitchenRecovery(scope)).write(commandRecord);
      setPendingCommand(commandRecord);
      await reconcile(commandRecord);
    });
  return (
    <Screen>
      <AppHeader title="My Kitchen" back />
      <EditorialText>Your appliances, cookware and cooking setup.</EditorialText>
      <Body>
        Shared with your household. Each row is one physical item; modes and attachments do not
        create another base.
      </Body>
      {scope && kitchen ? (
        <NativeKitchenSetupGuide
          key={scopeKey}
          scope={scope}
          items={kitchen.items}
          draftOpen={Boolean(draft)}
          disabled={!recoveryReady || Boolean(pendingCommand) || task.busy}
        />
      ) : null}
      <ResourceState resource={resource} />
      {!scope &&
      hydrated &&
      state.kitchenDraft?.scope.userId === user?.id &&
      state.kitchenDraft?.scope.instanceUrl === instanceUrl ? (
        <Body>
          An unsaved kitchen draft is retained on this device. Reconnect to its original kitchen and
          profile to review it. It will not be sent automatically.
        </Body>
      ) : null}
      <TaskError error={task.error} />
      {message ? <Body>{message}</Body> : null}
      {recoveryError && scope ? (
        <Button
          label="I reviewed inventory; clear unreadable local recovery"
          tone="secondary"
          disabled={task.busy}
          onPress={() => void clearUnreadable()}
        />
      ) : null}
      {pendingCommand && recoveryReady ? (
        <Surface>
          <Body>
            A reviewed equipment change from {new Date(pendingCommand.createdAt).toLocaleString()}{' '}
            may already be saved. Recover its outcome before making another change. No retry is sent
            automatically.
          </Body>
          <Button
            label="Recover saved equipment change"
            disabled={task.busy}
            onPress={() => void recover()}
          />
          <Button
            label="Discard pending command after reviewing saved inventory"
            tone="secondary"
            disabled={task.busy}
            onPress={() => void discardPending()}
          />
        </Surface>
      ) : null}
      {!draft &&
      state.kitchenDraft &&
      scope &&
      sameKitchenDraftScope(state.kitchenDraft.scope, scope) &&
      recoveryReady &&
      !pendingCommand ? (
        <Button label="Resume unsaved kitchen draft" tone="secondary" onPress={resumeDraft} />
      ) : null}
      {kitchen?.canManage ? (
        <Button
          label="Add equipment"
          disabled={!recoveryReady || Boolean(pendingCommand) || task.busy}
          onPress={() => edit()}
        />
      ) : null}
      {draft && draftOwner === scopeKey && recoveryReady && !pendingCommand ? (
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
                  independentZones: 1,
                  independentZonesConfirmed: false,
                  parentId: null,
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
          {catalog.data?.templates.find((t) => t.key === draft.typeKey)
            ?.supportsIndependentResources ? (
            <>
              <FormField
                label="Independent zones, burners or cavities"
                value={String(draft.independentZones ?? 1)}
                keyboardType="number-pad"
                onChangeText={(value) => setDraft({ ...draft, independentZones: Number(value) })}
              />
              <ChoiceField
                label="Can these compartments cook separately at the same time?"
                value={draft.independentZonesConfirmed ? 'yes' : 'no'}
                choices={[
                  { value: 'no', label: 'Not confirmed; shelves and spare pots do not count' },
                  { value: 'yes', label: 'Yes, independent cooking control confirmed' },
                ]}
                onChange={(value) =>
                  setDraft({ ...draft, independentZonesConfirmed: value === 'yes' })
                }
              />
            </>
          ) : null}
          <ChoiceField
            label="Add a confirmed capability"
            searchable
            value=""
            choices={[
              ...new Set(
                (catalog.data?.templates ?? []).flatMap((template) => template.capabilities),
              ),
            ]
              .sort()
              .filter(
                (capability) =>
                  !(Array.isArray(draft.capabilities) && draft.capabilities.includes(capability)),
              )
              .map((capability) => ({ value: capability, label: capability.replaceAll('-', ' ') }))}
            onChange={(capability) =>
              setDraft({
                ...draft,
                capabilities: [
                  ...(Array.isArray(draft.capabilities) ? draft.capabilities : []),
                  capability,
                ],
              })
            }
          />
          {(Array.isArray(draft.capabilities) ? (draft.capabilities as string[]) : []).map(
            (capability) => (
              <Button
                key={capability}
                label={`Remove confirmed ${capability.replaceAll('-', ' ')}`}
                tone="secondary"
                onPress={() =>
                  setDraft({
                    ...draft,
                    capabilities: (draft.capabilities as string[]).filter(
                      (value) => value !== capability,
                    ),
                  })
                }
              />
            ),
          )}
          <Body>
            A brand name alone does not confirm a mode. Multiple capabilities share this physical
            base.
          </Body>
          <NativeKitchenMeasurementsEditor
            key={`${target?.id ?? 'new'}:${draft.typeKey}`}
            values={(draft.measurements ?? []) as KitchenMeasurementDraft[]}
            resourceCount={Number(draft.independentZones ?? 1)}
            kind={catalog.data?.templates.find((t) => t.key === draft.typeKey)?.measurement ?? null}
            custom={draft.typeKey === 'custom'}
            onChange={(measurements) => setDraft({ ...draft, measurements })}
          />
          {['vessel', 'accessory'].includes(
            catalog.data?.templates.find((t) => t.key === draft.typeKey)?.resource ?? '',
          ) || draft.typeKey === 'custom' ? (
            <>
              <FormField
                label="Material (optional)"
                value={String(draft.material ?? '')}
                onChangeText={(material) => setDraft({ ...draft, material })}
              />
              {(['induction', 'ovenSafe', 'lid'] as const).map((field) => (
                <ChoiceField
                  key={field}
                  label={
                    {
                      induction: 'Induction compatible',
                      ovenSafe: 'Oven safe',
                      lid: 'Compatible lid available',
                    }[field]
                  }
                  value={String(draft[field] ?? 'unknown')}
                  choices={[
                    { value: 'unknown', label: 'Not sure' },
                    { value: 'yes', label: 'Yes, confirmed' },
                    { value: 'no', label: 'No' },
                  ]}
                  onChange={(value) => setDraft({ ...draft, [field]: value })}
                />
              ))}
              {draft.ovenSafe === 'yes' ? (
                <FormField
                  label="Confirmed oven temperature limit (°C, optional)"
                  keyboardType="decimal-pad"
                  value={draft.ovenMaxC == null ? '' : String(draft.ovenMaxC)}
                  onChangeText={(value) =>
                    setDraft({ ...draft, ovenMaxC: value ? Number(value) : null })
                  }
                />
              ) : null}
            </>
          ) : null}
          {catalog.data?.templates.find((t) => t.key === draft.typeKey)?.resource ===
          'accessory' ? (
            <ChoiceField
              label="Compatible attachment belongs to"
              value={String(draft.parentId ?? '')}
              choices={[
                { value: '', label: 'Standalone tool; no parent base' },
                ...(kitchen?.items ?? [])
                  .filter(
                    (item) =>
                      !item.parentId && item.availability === 'available' && item.id !== target?.id,
                  )
                  .map((item, index) => ({
                    value: item.id,
                    label: `${item.name} · Item ${index + 1}`,
                  })),
              ]}
              onChange={(value) => setDraft({ ...draft, parentId: value || null })}
            />
          ) : null}
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
            onPress={() => {
              setDraft(null);
              dispatch({ type: 'set-kitchen-draft', draft: null });
              setMessage('Draft discarded. Saved inventory is unchanged.');
            }}
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
                <Button
                  label={`Edit ${item.name}`}
                  tone="secondary"
                  disabled={!recoveryReady || Boolean(pendingCommand) || task.busy}
                  onPress={() => edit(item)}
                />
                <Button
                  label="Add another like this"
                  tone="secondary"
                  disabled={!recoveryReady || Boolean(pendingCommand) || task.busy}
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
