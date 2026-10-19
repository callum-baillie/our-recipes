import { NutritionEstimateWorkspace } from '@/components/nutrition-estimate-workspace';
import * as React from 'react';
import { View } from 'react-native';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { localDate } from '@/data/planner';
import { latestRevisions, positiveNumber } from '@/data/nutrition-commands';
import { validDate } from '@/data/meal-entry';
import { nutrientCatalog } from '@/data/nutrient-catalog';
type Goal = {
  id: string;
  seriesId: string;
  revision: number;
  nutrientCode: string;
  unit: string;
  kind: string;
  state: string;
  value: number | null;
  minimum: number | null;
  maximum: number | null;
  startsOn: string;
  endsOn: string | null;
  note: string;
  sourceType: string;
  sourceReferenceId: string | null;
};
export function NutritionGoalsWorkspace({ profileId }: { profileId: string }) {
  const path = `/api/v1/nutrition/profiles/${profileId}/goals`;
  const resource = useResource<{ goals: Goal[] }>(path);
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [editing, setEditing] = React.useState<Goal | null>(null);
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState('energy_kcal');
  const [unit, setUnit] = React.useState('kcal');
  const [kind, setKind] = React.useState('target');
  const [state, setState] = React.useState('active');
  const [value, setValue] = React.useState('');
  const [minimum, setMinimum] = React.useState('');
  const [maximum, setMaximum] = React.useState('');
  const [startsOn, setStartsOn] = React.useState(localDate(new Date()));
  const [endsOn, setEndsOn] = React.useState('');
  const [note, setNote] = React.useState('');
  const edit = (goal?: Goal) => {
    setEditing(goal ?? null);
    setCode(goal?.nutrientCode ?? 'energy_kcal');
    setUnit(goal?.unit ?? 'kcal');
    setKind(goal?.kind ?? 'target');
    setState(goal?.state ?? 'active');
    setValue(String(goal?.value ?? ''));
    setMinimum(String(goal?.minimum ?? ''));
    setMaximum(String(goal?.maximum ?? ''));
    setStartsOn(goal?.startsOn ?? localDate(new Date()));
    setEndsOn(goal?.endsOn ?? '');
    setNote(goal?.note ?? '');
    setOpen(true);
  };
  const save = () =>
    task.run(async () => {
      if (!validDate(startsOn) || (endsOn && (!validDate(endsOn) || endsOn < startsOn)))
        throw new Error('Use valid goal dates, with the end on or after the start.');
      const bounds =
        kind === 'range'
          ? {
              minimum: positiveNumber(minimum, 'Minimum'),
              maximum: positiveNumber(maximum, 'Maximum'),
            }
          : kind === 'limit'
            ? { maximum: positiveNumber(maximum, 'Maximum') }
            : { value: positiveNumber(value, 'Target') };
      if (
        bounds.minimum !== undefined &&
        bounds.maximum !== undefined &&
        bounds.maximum < bounds.minimum
      )
        throw new Error('Maximum must be at least the minimum.');
      await request(path, {
        method: 'POST',
        body: JSON.stringify({
          goal: {
            nutrientCode: code,
            unit,
            kind,
            state,
            startsOn,
            endsOn: endsOn || null,
            note,
            sourceType: editing?.sourceType ?? 'user_defined',
            sourceReferenceId: editing?.sourceReferenceId ?? null,
            ...bounds,
          },
          ...(editing ? { seriesId: editing.seriesId, supersedesGoalVersionId: editing.id } : {}),
        }),
      });
      setOpen(false);
      resource.reload();
      await refresh();
    });
  return (
    <View style={{ gap: 14 }}>
      <NutritionEstimateWorkspace profileId={profileId} onApplied={resource.reload} />
      <EditorialText>Nutrition goals</EditorialText>
      <Body muted>
        Set your own targets, minimums, ranges or limits. Editing preserves previous versions.
      </Body>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      <Button label="Add goal" onPress={() => edit()} />
      {latestRevisions(resource.data?.goals ?? []).map((goal) => (
        <Surface key={goal.id} style={{ gap: 8 }}>
          <EditorialText>
            {nutrientCatalog.find((entry) => entry.code === goal.nutrientCode)?.name ??
              goal.nutrientCode}
          </EditorialText>
          <Body>
            {goal.kind}: {goal.value ?? goal.minimum ?? goal.maximum}
            {goal.kind === 'range' ? ` – ${goal.maximum}` : ''} {goal.unit} · {goal.state}
          </Body>
          <Body muted>
            {goal.startsOn}
            {goal.endsOn ? ` to ${goal.endsOn}` : ''} · revision {goal.revision}
          </Body>
          <Button label="Edit or pause goal" tone="secondary" onPress={() => edit(goal)} />
        </Surface>
      ))}
      {open ? (
        <Surface style={{ gap: 12 }}>
          <ChoiceField
            label="Nutrient"
            value={code}
            searchable
            choices={nutrientCatalog.map((entry) => ({ value: entry.code, label: entry.name }))}
            onChange={(value) => {
              setCode(value);
              setUnit(nutrientCatalog.find((entry) => entry.code === value)?.unit ?? 'g');
            }}
          />
          <Body>Unit: {unit}</Body>
          <ChoiceField
            label="Goal type"
            value={kind}
            onChange={setKind}
            choices={['target', 'minimum', 'range', 'limit'].map((value) => ({
              value,
              label: value,
            }))}
          />
          {['target', 'minimum'].includes(kind) ? (
            <FormField
              label="Amount"
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
            />
          ) : null}
          {kind === 'range' ? (
            <FormField
              label="Minimum"
              value={minimum}
              onChangeText={setMinimum}
              keyboardType="decimal-pad"
            />
          ) : null}
          {['range', 'limit'].includes(kind) ? (
            <FormField
              label="Maximum"
              value={maximum}
              onChangeText={setMaximum}
              keyboardType="decimal-pad"
            />
          ) : null}
          <ChoiceField
            label="State"
            value={state}
            onChange={setState}
            choices={['active', 'paused', 'archived'].map((value) => ({ value, label: value }))}
          />
          <FormField label="Starts on (YYYY-MM-DD)" value={startsOn} onChangeText={setStartsOn} />
          <FormField label="Ends on (optional)" value={endsOn} onChangeText={setEndsOn} />
          <FormField label="Note" value={note} onChangeText={setNote} />
          <Button label="Save goal" disabled={task.busy} onPress={() => void save()} />
          <Button label="Cancel" tone="secondary" onPress={() => setOpen(false)} />
        </Surface>
      ) : null}
    </View>
  );
}
