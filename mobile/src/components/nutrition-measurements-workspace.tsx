import { bodyMetricFields, parseBodyMetrics } from '@/data/body-metrics';
import * as React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useTask } from '@/hooks/use-task';
import { useResource } from '@/hooks/use-resource';
import { localDate } from '@/data/planner';
import { localTimestamp, positiveNumber } from '@/data/nutrition-commands';
import { Body, Button, EditorialText, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { ResourceState, TaskError } from '@/components/nutrition-workspace-common';
export function NutritionMeasurementsWorkspace({ profileId }: { profileId: string }) {
  const path = `/api/v1/nutrition/profiles/${profileId}`;
  const resource = useResource<{
    measurements: {
      id: string;
      measuredAt: string;
      weightKilograms: number;
      approximate: boolean;
      note: string;
      sourceType: string;
      advancedBodyMetrics: string;
    }[];
  }>(`${path}/measurements`);
  const scale = useResource<{ connected: boolean; measuredAt?: string }>(`${path}/scale`);
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [advanced, setAdvanced] = React.useState(false);
  const [metrics, setMetrics] = React.useState<Record<string, string>>({});
  const [weight, setWeight] = React.useState('');
  const [units, setUnits] = React.useState('kg');
  const [date, setDate] = React.useState(localDate(new Date()));
  const [time, setTime] = React.useState('08:00');
  const [note, setNote] = React.useState('');
  const [approximate, setApproximate] = React.useState(false);
  const save = () =>
    task.run(async () => {
      const amount = positiveNumber(weight, 'Weight', units === 'lb' ? 2204.62 : 1000);
      await request(`${path}/measurements`, {
        method: 'POST',
        body: JSON.stringify({
          advancedMetrics: parseBodyMetrics(metrics, units === 'lb' ? amount * 0.45359237 : amount),
          measuredAt: localTimestamp(date, time),
          weightKilograms: units === 'lb' ? amount * 0.45359237 : amount,
          sourceType: 'manual',
          approximate,
          note,
        }),
      });
      setWeight('');
      setMetrics({});
      resource.reload();
      await refresh();
    });
  return (
    <View style={{ gap: 14 }}>
      <EditorialText>Weight & measurements</EditorialText>
      <TaskError error={task.error} />
      <ResourceState resource={resource} />
      <ChoiceField
        label="Units"
        value={units}
        onChange={setUnits}
        choices={[
          { value: 'kg', label: 'Kilograms' },
          { value: 'lb', label: 'Pounds' },
        ]}
      />
      <FormField
        label={`Weight (${units})`}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
      />
      <FormField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <FormField label="Device time (HH:MM)" value={time} onChangeText={setTime} />
      <FormField label="Note" value={note} onChangeText={setNote} />
      <NativeToggle label="Approximate measurement" value={approximate} onChange={setApproximate} />
      <Button
        label={advanced ? 'Hide body composition' : 'Add body composition'}
        tone="secondary"
        onPress={() => setAdvanced(!advanced)}
      />
      {advanced
        ? bodyMetricFields.map((field) => (
            <View key={field.key} style={{ gap: 4 }}>
              <FormField
                label={`${field.label} (${field.unit})`}
                value={metrics[field.key] ?? ''}
                onChangeText={(value) =>
                  setMetrics((current) => ({ ...current, [field.key]: value }))
                }
                keyboardType="decimal-pad"
              />
              <Body muted>{field.help}</Body>
            </View>
          ))
        : null}
      <Button label="Record measurement" disabled={task.busy} onPress={() => void save()} />
      {scale.data?.connected ? (
        <Button
          label="Import latest connected-scale reading"
          tone="secondary"
          disabled={task.busy}
          onPress={() =>
            void task.run(async () => {
              await request(`${path}/scale`, { method: 'POST' });
              resource.reload();
              scale.reload();
              await refresh();
            })
          }
        />
      ) : null}
      {resource.data?.measurements.map((measurement) => (
        <Surface key={measurement.id} style={{ gap: 6 }}>
          <EditorialText>
            {(units === 'kg'
              ? measurement.weightKilograms
              : measurement.weightKilograms / 0.45359237
            ).toFixed(1)}{' '}
            {units}
          </EditorialText>
          <Body muted>
            {new Date(measurement.measuredAt).toLocaleString()} · {measurement.sourceType}
            {measurement.approximate ? ' · approximate' : ''}
          </Body>
          {(() => {
            try {
              const values = JSON.parse(measurement.advancedBodyMetrics || '{}') as Record<
                string,
                number | null
              >;
              return bodyMetricFields
                .filter((field) => values[field.key] != null)
                .map((field) => (
                  <Body key={field.key} muted>
                    {field.label}: {values[field.key]} {field.unit}
                  </Body>
                ));
            } catch {
              return null;
            }
          })()}
          {measurement.note ? <Body>{measurement.note}</Body> : null}
        </Surface>
      ))}
    </View>
  );
}
