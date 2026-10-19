import * as React from 'react';
import { Linking } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { localDate } from '@/data/planner';
import { validDate } from '@/data/meal-entry';
type Preview = {
  estimate: {
    roundedKcal: number;
    unit: string;
    sourceVersion: string;
    sourceUrl: string;
    formula: string;
    disclosure: string;
  };
  currentEnergyGoals: { id: string; value: number; unit: string; revision: number }[];
};
export function NutritionEstimateWorkspace({
  profileId,
  onApplied,
}: {
  profileId: string;
  onApplied: () => void;
}) {
  const path = `/api/v1/nutrition/profiles/${profileId}`;
  const profile = useResource<{ profile: { version: number } }>(path);
  const task = useTask();
  const { request } = useAuth();
  const { refresh } = useSync();
  const [date, setDate] = React.useState(localDate(new Date()));
  const [activity, setActivity] = React.useState('inactive');
  const [replacement, setReplacement] = React.useState('');
  const [preview, setPreview] = React.useState<(Preview & { key: string; version: number }) | null>(
    null,
  );
  const operation = React.useRef(randomUUID());
  const [saved, setSaved] = React.useState(false);
  const key = `${date}:${activity}:${profile.data?.profile.version}`;
  const current = preview?.key === key ? preview : null;
  const run = (apply: boolean) =>
    task.run(async () => {
      if (!validDate(date)) throw new Error('Enter a valid effective date.');
      const version = profile.data?.profile.version;
      if (!version) throw new Error('Wait for the profile to load.');
      if (apply && !current) throw new Error('Preview the current inputs first.');
      if (apply && current?.currentEnergyGoals.length && !replacement)
        throw new Error('Choose the current goal to replace.');
      const result = await request<Preview>(`${path}/goals/estimate`, {
        method: 'POST',
        body: JSON.stringify({
          action: apply ? 'apply' : 'preview',
          expectedProfileVersion: version,
          effectiveOn: date,
          palCategory: activity,
          ...(apply
            ? { operationId: operation.current, supersedesGoalVersionId: replacement || null }
            : {}),
        }),
      });
      if (apply) {
        setSaved(true);
        onApplied();
        setPreview(null);
        operation.current = randomUUID();
        await refresh();
      } else {
        setPreview({ ...result, key, version });
        setReplacement('');
        setSaved(false);
        operation.current = randomUUID();
      }
    });
  return (
    <Surface style={{ gap: 12 }}>
      <EditorialText>Estimate an energy target</EditorialText>
      <Body muted>
        Uses the same reference calculation and saved profile inputs as the web app. Enable
        estimated targets and consent in Profile settings first.
      </Body>
      <ResourceState resource={profile} />
      <TaskError error={task.error} />
      <FormField label="Effective date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <ChoiceField
        label="Physical activity category"
        value={activity}
        onChange={setActivity}
        choices={['inactive', 'low_active', 'active', 'very_active'].map((value) => ({
          value,
          label: value.replaceAll('_', ' '),
        }))}
      />
      <Button
        label="Preview estimate"
        disabled={task.busy || !profile.data}
        onPress={() => void run(false)}
      />
      {current ? (
        <>
          <EditorialText>
            {current.estimate.roundedKcal} {current.estimate.unit}
          </EditorialText>
          <Body>{current.estimate.disclosure}</Body>
          <Body muted>{current.estimate.sourceVersion}</Body>
          <Body muted>{current.estimate.formula}</Body>
          <Button
            label="Read reference source"
            tone="secondary"
            onPress={() => void Linking.openURL(current.estimate.sourceUrl)}
          />
          {current.currentEnergyGoals.length ? (
            <ChoiceField
              label="Goal to replace"
              value={replacement}
              onChange={setReplacement}
              choices={current.currentEnergyGoals.map((goal) => ({
                value: goal.id,
                label: `${goal.value} ${goal.unit} · revision ${goal.revision}`,
              }))}
            />
          ) : null}
          <Button
            label="Apply this estimate as my goal"
            disabled={task.busy}
            onPress={() => void run(true)}
          />
        </>
      ) : null}
      {saved ? <Body>Estimated goal saved. Previous goal versions remain in history.</Body> : null}
    </Surface>
  );
}
