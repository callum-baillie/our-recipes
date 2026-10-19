import * as React from 'react';
import { Alert, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { Body, Button, EditorialText, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError, IntakeTiming } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { localDate } from '@/data/planner';
import { latestRevisions, localTimestamp } from '@/data/nutrition-commands';
import { validDate } from '@/data/meal-entry';
import type { DiaryEntry } from '@/data/nutrition-diary';
export type FullDiaryEntry = DiaryEntry & {
  sourceType: string;
  recipeCalculationId: string | null;
  productId: string | null;
  quantity: number | null;
  unit: string | null;
  servingCount: number | null;
  portionWeightGrams: number | null;
};
export function NutritionDiaryWorkspace({
  profileId,
  profiles,
  onCorrect,
}: {
  profileId: string;
  profiles: { value: string; label: string }[];
  onCorrect: (entry: FullDiaryEntry) => void;
}) {
  const path = `/api/v1/nutrition/profiles/${encodeURIComponent(profileId)}`;
  const resource = useResource<{ revisions: FullDiaryEntry[] }>(`${path}/intake`);
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [selected, setSelected] = React.useState<FullDiaryEntry | null>(null);
  const [command, setCommand] = React.useState('copy_entry');
  const [date, setDate] = React.useState(localDate(new Date()));
  const [time, setTime] = React.useState('12:00');
  const [meal, setMeal] = React.useState('lunch');
  const [target, setTarget] = React.useState(profileId);
  const [reason, setReason] = React.useState('');
  const [showDeleted, setShowDeleted] = React.useState(false);
  const [sourceDate, setSourceDate] = React.useState(localDate(new Date()));
  const key = React.useRef(randomUUID());
  const entries = latestRevisions(resource.data?.revisions ?? []).filter(
    (entry) => showDeleted || entry.state !== 'deleted',
  );
  const submit = () =>
    task.run(async () => {
      if (!selected && command !== 'copy_day') throw new Error('Choose an entry.');
      if (['move', 'restore', 'reassign', 'delete'].includes(command) && !reason.trim())
        throw new Error('Add a reason for this change.');
      if (command === 'copy_day' && (!validDate(date) || !validDate(sourceDate)))
        throw new Error('Choose valid source and destination dates.');
      if (command === 'delete')
        await request(`${path}/intake/${selected!.id}/delete`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        });
      else {
        const payload =
          command === 'copy_day'
            ? {
                command,
                sourceDate,
                targetDate: date,
                targetProfileId: target,
                idempotencyKey: key.current,
              }
            : command === 'restore'
              ? { command, sourceRevisionId: selected!.id, reason, idempotencyKey: key.current }
              : {
                  command,
                  sourceRevisionId: selected!.id,
                  occurredAt: localTimestamp(date, time),
                  mealSlot: meal,
                  idempotencyKey: key.current,
                  ...(command === 'copy_entry' || command === 'reassign'
                    ? { targetProfileId: target }
                    : {}),
                  ...(command === 'move' || command === 'reassign' ? { reason } : {}),
                };
        await request(`${path}/diary-commands`, { method: 'POST', body: JSON.stringify(payload) });
      }
      key.current = randomUUID();
      setSelected(null);
      setCommand('copy_entry');
      resource.reload();
      await refresh();
    });
  return (
    <View style={{ gap: 16 }}>
      <EditorialText>Food diary</EditorialText>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      <NativeToggle label="Show deleted entries" value={showDeleted} onChange={setShowDeleted} />
      {entries.map((entry) => (
        <Surface key={entry.id} style={{ gap: 8 }}>
          <EditorialText>{entry.sourceNameSnapshot}</EditorialText>
          <Body muted>
            {new Date(entry.occurredAt).toLocaleString()} · {entry.mealSlot} · {entry.state}
          </Body>
          <Button
            label="Manage entry"
            tone="secondary"
            onPress={() => {
              setSelected(entry);
              setCommand(entry.state === 'deleted' ? 'restore' : 'copy_entry');
              setReason('');
              key.current = randomUUID();
            }}
          />
          {entry.state !== 'deleted' ? (
            <Button label="Correct entry" tone="quiet" onPress={() => onCorrect(entry)} />
          ) : null}
        </Surface>
      ))}
      {!resource.loading && resource.data && !entries.length ? (
        <Body muted>No entries to show.</Body>
      ) : null}
      <Button
        label="Copy a day"
        tone="secondary"
        onPress={() => {
          setSelected(null);
          setCommand('copy_day');
          key.current = randomUUID();
        }}
      />
      {selected || command === 'copy_day' ? (
        <Surface style={{ gap: 12 }}>
          <EditorialText>{selected?.sourceNameSnapshot ?? 'Copy a day'}</EditorialText>
          {selected ? (
            <ChoiceField
              label="Action"
              value={command}
              onChange={(value) => {
                setCommand(value);
                key.current = randomUUID();
              }}
              choices={(selected.state === 'deleted'
                ? ['restore']
                : ['copy_entry', 'move', 'reassign', 'delete']
              ).map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
            />
          ) : (
            <FormField
              label="Source date (profile timezone)"
              value={sourceDate}
              onChangeText={setSourceDate}
            />
          )}
          {!['delete', 'restore'].includes(command) ? (
            <IntakeTiming
              date={date}
              time={time}
              meal={meal}
              setDate={setDate}
              setTime={setTime}
              setMeal={setMeal}
            />
          ) : null}
          {['copy_entry', 'copy_day', 'reassign'].includes(command) ? (
            <ChoiceField
              label="Destination profile"
              value={target}
              onChange={setTarget}
              choices={profiles}
            />
          ) : null}
          {['move', 'restore', 'reassign', 'delete'].includes(command) ? (
            <FormField label="Reason" value={reason} onChangeText={setReason} />
          ) : null}
          <Button
            label={task.busy ? 'Saving…' : 'Apply diary action'}
            disabled={task.busy}
            onPress={() =>
              command === 'delete'
                ? Alert.alert(
                    'Delete intake entry?',
                    'Its history is retained and it can be restored.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => void submit() },
                    ],
                  )
                : void submit()
            }
          />
          <Button
            label="Cancel"
            tone="secondary"
            onPress={() => {
              setSelected(null);
              setCommand('copy_entry');
            }}
          />
        </Surface>
      ) : null}
    </View>
  );
}
