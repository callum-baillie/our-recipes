import { useBord } from '@/state/bord-store';
import * as React from 'react';
import { View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { localDate, shiftDate } from '@/data/planner';
import { localTimestamp, positiveNumber } from '@/data/nutrition-commands';
import { Body, Button, EditorialText, FormField, NativeToggle, Surface } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { IntakeTiming, ResourceState, TaskError } from '@/components/nutrition-workspace-common';

type Allocation = {
  id: string;
  seriesId: string;
  revision: number;
  state: string;
  servings: number | null;
  portionWeightGrams: number | null;
  note: string;
};
type Prepared = {
  id: string;
  recipeNameSnapshot: string;
  actualServings: number;
  remainingServings: number;
  finalWeightGrams: number | null;
  assignedServings: number;
  overallocatedServings: number;
  calculationAlignment: string;
  ownAllocations: Allocation[];
};
export function NutritionPreparedWorkspace({ profileId }: { profileId: string }) {
  const { state } = useBord();
  const path = `/api/v1/nutrition/profiles/${profileId}`;
  const resource = useResource<{ workspace: Prepared[] }>(`${path}/prepared-recipes`);
  const today = localDate(new Date());
  const meals = useResource<{
    meals: {
      id: string;
      plannedFor: string;
      recipeTitle: string;
      recipeCalculationId: string | null;
      recipeId: string | null;
    }[];
  }>(`/api/v1/meal-plan?start=${shiftDate(today, -30)}&end=${shiftDate(today, 7)}`);
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [selectedId, setSelectedId] = React.useState('');
  const [allocationId, setAllocationId] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [sourceType, setSourceType] = React.useState('meal');
  const [sessionId, setSessionId] = React.useState('');
  const [calculationId, setCalculationId] = React.useState('');
  const sessions = useResource<{
    sessions: { id: string; recipeId: string; completedAt: string }[];
  }>('/api/v1/cook-sessions');
  const session = sessions.data?.sessions.find((item) => item.id === sessionId);
  const calculations = useResource<{ calculations: { id: string; revision: number }[] }>(
    session ? `/api/v1/nutrition/recipes/${session.recipeId}/calculations` : null,
  );
  const [mealId, setMealId] = React.useState('');
  const [yieldCount, setYieldCount] = React.useState('4');
  const [yieldWeight, setYieldWeight] = React.useState('');
  const [aligned, setAligned] = React.useState(false);
  const [amount, setAmount] = React.useState('1');
  const [unit, setUnit] = React.useState('servings');
  const [action, setAction] = React.useState('served');
  const [date, setDate] = React.useState(today);
  const [time, setTime] = React.useState('12:00');
  const [meal, setMeal] = React.useState('lunch');
  const [note, setNote] = React.useState('');
  const instanceKey = React.useRef(randomUUID());
  const commandKey = React.useRef(randomUUID());
  const allocationKey = React.useRef(randomUUID());
  const selected = resource.data?.workspace?.find((entry) => entry.id === selectedId);
  const allocation = selected?.ownAllocations.find((entry) => entry.id === allocationId);
  const create = () =>
    task.run(async () => {
      const source = meals.data?.meals.find((entry) => entry.id === mealId);
      const calculation =
        sourceType === 'meal'
          ? source?.recipeCalculationId
          : calculations.data?.calculations.find((item) => item.id === calculationId)?.id;
      if (!calculation)
        throw new Error('Choose a preparation source and its saved nutrition calculation.');
      if (!aligned) throw new Error('Confirm that the preparation matches the saved calculation.');
      await request(`${path}/prepared-recipes`, {
        method: 'POST',
        body: JSON.stringify({
          preparedInstanceId: instanceKey.current,
          recipeCalculationId: calculation,
          mealPlanEntryId: sourceType === 'meal' ? source!.id : null,
          cookSessionId: sourceType === 'cook' ? sessionId : null,
          actualServings: positiveNumber(yieldCount, 'Actual yield'),
          finalWeightGrams: yieldWeight.trim() ? positiveNumber(yieldWeight, 'Final weight') : null,
          preparationMatchesCalculation: true,
          note,
        }),
      });
      instanceKey.current = randomUUID();
      setCreating(false);
      resource.reload();
      await refresh();
    });
  const save = () =>
    task.run(async () => {
      if (!selected) throw new Error('Choose a prepared recipe.');
      const number = positiveNumber(amount, 'Portion');
      if (action === 'eaten')
        await request(`${path}/prepared-recipes/${selected.id}/consume`, {
          method: 'POST',
          body: JSON.stringify({
            idempotencyKey: commandKey.current,
            servingCount: unit === 'servings' ? number : null,
            portionWeightGrams: unit === 'weight' ? number : null,
            occurredAt: localTimestamp(date, time),
            mealSlot: meal,
            allocationSeriesId: allocation?.seriesId,
            supersedesAllocationVersionId: allocation?.id ?? null,
            note,
          }),
        });
      else
        await request(`${path}/prepared-recipes/${selected.id}/allocations`, {
          method: 'POST',
          body: JSON.stringify({
            allocationSeriesId: allocation?.seriesId ?? allocationKey.current,
            supersedesAllocationVersionId: allocation?.id ?? null,
            state: action,
            servingCount: number,
            note,
          }),
        });
      commandKey.current = randomUUID();
      allocationKey.current = randomUUID();
      setSelectedId('');
      setAllocationId('');
      resource.reload();
      await refresh();
    });
  return (
    <View style={{ gap: 14 }}>
      <EditorialText>Prepared meals & portions</EditorialText>
      <ResourceState resource={resource} />
      <TaskError error={task.error} />
      <Button
        label={creating ? 'Hide prepared-meal form' : 'Record prepared yield'}
        tone="secondary"
        onPress={() => setCreating(!creating)}
      />
      {creating ? (
        <Surface style={{ gap: 12 }}>
          <ChoiceField
            label="Preparation source"
            value={sourceType}
            onChange={setSourceType}
            choices={[
              { value: 'meal', label: 'Planned meal' },
              { value: 'cook', label: 'Completed cooking session' },
            ]}
          />
          {sourceType === 'cook' ? (
            <>
              <ResourceState resource={sessions} />
              <ChoiceField
                label="Completed session"
                value={sessionId}
                onChange={(value) => {
                  setSessionId(value);
                  setCalculationId('');
                }}
                searchable
                choices={(sessions.data?.sessions ?? []).map((item) => ({
                  value: item.id,
                  label: `${new Date(item.completedAt).toLocaleString()} · ${state.recipes.find((recipe) => recipe.id === item.recipeId)?.title ?? 'Recipe'}`,
                }))}
              />
              <ResourceState resource={calculations} />
              <ChoiceField
                label="Matching saved calculation"
                value={calculationId}
                onChange={setCalculationId}
                choices={(calculations.data?.calculations ?? []).map((item) => ({
                  value: item.id,
                  label: `Calculation ${item.revision}`,
                }))}
              />
            </>
          ) : (
            <>
              <ResourceState resource={meals} />
              <ChoiceField
                label="Planned meal"
                value={mealId}
                onChange={setMealId}
                searchable
                choices={(meals.data?.meals ?? [])
                  .filter((entry) => entry.recipeCalculationId)
                  .map((entry) => ({
                    value: entry.id,
                    label: `${entry.plannedFor} · ${entry.recipeTitle}`,
                  }))}
              />
            </>
          )}
          <FormField
            label="Actual servings prepared"
            value={yieldCount}
            onChangeText={setYieldCount}
            keyboardType="decimal-pad"
          />
          <FormField
            label="Final weight in grams (optional)"
            value={yieldWeight}
            onChangeText={setYieldWeight}
            keyboardType="decimal-pad"
          />
          <NativeToggle
            label="Preparation matches the saved nutrition calculation"
            value={aligned}
            onChange={setAligned}
          />
          <FormField label="Preparation note" value={note} onChangeText={setNote} />
          <Button
            label="Save prepared meal"
            disabled={task.busy || !aligned}
            onPress={() => void create()}
          />
        </Surface>
      ) : null}
      {resource.data?.workspace?.map((prepared) => (
        <Surface key={prepared.id} style={{ gap: 10 }}>
          <EditorialText>{prepared.recipeNameSnapshot}</EditorialText>
          <Body>
            {prepared.remainingServings} remaining · {prepared.assignedServings} assigned of{' '}
            {prepared.actualServings} servings
          </Body>
          {prepared.overallocatedServings > 0 ? (
            <Body>
              Recorded portions exceed yield by {prepared.overallocatedServings} servings. Review
              existing allocations.
            </Body>
          ) : null}
          <Button
            label="Allocate or record eating"
            tone="secondary"
            disabled={task.busy}
            onPress={() => {
              setSelectedId(prepared.id);
              setAllocationId('');
              setAmount('1');
              setAction('served');
              setUnit('servings');
              commandKey.current = randomUUID();
              allocationKey.current = randomUUID();
            }}
          />
          {prepared.ownAllocations.map((entry) => (
            <View key={entry.id} style={{ gap: 6 }}>
              <Body>
                {entry.servings ?? '—'} servings · {entry.state} · revision {entry.revision}
              </Body>
              {entry.state !== 'eaten' ? (
                <Button
                  label="Update this portion"
                  tone="quiet"
                  onPress={() => {
                    setSelectedId(prepared.id);
                    setAllocationId(entry.id);
                    setAmount(String(entry.servings ?? 1));
                    setAction('eaten');
                    setUnit('servings');
                    setNote(entry.note);
                    commandKey.current = randomUUID();
                  }}
                />
              ) : null}
            </View>
          ))}
        </Surface>
      ))}
      {selected ? (
        <Surface style={{ gap: 12 }}>
          <EditorialText>{selected.recipeNameSnapshot}</EditorialText>
          <ChoiceField
            label="Portion state"
            value={action}
            onChange={setAction}
            choices={['served', 'eaten', 'skipped', 'leftover'].map((value) => ({
              value,
              label: value,
            }))}
          />
          {action === 'eaten' && selected.finalWeightGrams ? (
            <ChoiceField
              label="Measure by"
              value={unit}
              onChange={setUnit}
              choices={[
                { value: 'servings', label: 'Servings' },
                { value: 'weight', label: 'Grams' },
              ]}
            />
          ) : null}
          <FormField
            label={action === 'eaten' && unit === 'weight' ? 'Grams eaten' : 'Servings'}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          {action === 'eaten' ? (
            <IntakeTiming
              date={date}
              time={time}
              meal={meal}
              setDate={setDate}
              setTime={setTime}
              setMeal={setMeal}
            />
          ) : null}
          <FormField label="Note" value={note} onChangeText={setNote} />
          <Button
            label={task.busy ? 'Saving…' : 'Confirm portion'}
            disabled={task.busy}
            onPress={() => void save()}
          />
          <Button label="Cancel" tone="secondary" onPress={() => setSelectedId('')} />
        </Surface>
      ) : null}
    </View>
  );
}
