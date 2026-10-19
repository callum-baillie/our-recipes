import { nutrientCatalog } from '@/data/nutrient-catalog';
import * as React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import { useTask } from '@/hooks/use-task';
import { useResource } from '@/hooks/use-resource';
import { localDate } from '@/data/planner';
import { localTimestamp, positiveNumber, nutrientValues } from '@/data/nutrition-commands';
import { Body, Button, EditorialText, FormField } from '@/components/ui';
import { ChoiceField } from '@/components/choice-field';
import { IntakeTiming, ResourceState, TaskError } from '@/components/nutrition-workspace-common';
import type { FullDiaryEntry } from '@/components/nutrition-diary-workspace';

const nutrients = [
  ['energy_kcal', 'Calories (kcal)'],
  ['protein', 'Protein (g)'],
  ['carbohydrate', 'Carbohydrate (g)'],
  ['total_fat', 'Fat (g)'],
  ['fiber', 'Fiber (g)'],
  ['sodium', 'Sodium (mg)'],
] as const;
export function NutritionLogWorkspace({
  profileId,
  correction,
  onSaved,
}: {
  profileId: string;
  correction?: FullDiaryEntry | null;
  onSaved: () => void;
}) {
  const { request } = useAuth();
  const { state } = useBord();
  const { refresh } = useSync();
  const task = useTask();
  const [source, setSource] = React.useState(
    correction?.sourceType === 'recipe'
      ? 'recipe'
      : correction?.sourceType === 'product'
        ? 'product'
        : 'manual',
  );
  const [name, setName] = React.useState(correction?.sourceNameSnapshot ?? '');
  const [quantity, setQuantity] = React.useState(
    String(correction?.quantity ?? correction?.servingCount ?? 1),
  );
  const [unit, setUnit] = React.useState(correction?.unit ?? 'serving');
  const [productId, setProductId] = React.useState(correction?.productId ?? '');
  const [recipeId, setRecipeId] = React.useState('');
  const [calculationId, setCalculationId] = React.useState(correction?.recipeCalculationId ?? '');
  const [portionMode, setPortionMode] = React.useState(
    correction?.portionWeightGrams ? 'weight' : 'servings',
  );
  const [weight, setWeight] = React.useState(String(correction?.portionWeightGrams ?? ''));
  const originalDate = correction ? new Date(correction.occurredAt) : new Date();
  const [date, setDate] = React.useState(localDate(originalDate));
  const [time, setTime] = React.useState(
    `${String(originalDate.getHours()).padStart(2, '0')}:${String(originalDate.getMinutes()).padStart(2, '0')}`,
  );
  const [meal, setMeal] = React.useState(correction?.mealSlot ?? 'lunch');
  const [reason, setReason] = React.useState('');
  const [extraNutrient, setExtraNutrient] = React.useState('');
  const [values, setValues] = React.useState<Record<string, string>>(
    Object.fromEntries(
      (correction?.values ?? []).map((value) => [value.nutrientCode, String(value.amount)]),
    ),
  );
  const products = useResource<{ products: { id: string; displayName: string }[] }>(
    source === 'product' ? '/api/v1/pantry/products' : null,
  );
  const calculations = useResource<{
    calculations: { id: string; revision: number; completeness: number }[];
  }>(source === 'recipe' && recipeId ? `/api/v1/nutrition/recipes/${recipeId}/calculations` : null);
  const save = () =>
    task.run(async () => {
      if (correction && !reason.trim()) throw new Error('Explain the correction before saving.');
      if (correction && !['recipe', 'product', 'manual'].includes(correction.sourceType))
        throw new Error(
          'This source cannot be corrected here. Use its original prepared-meal allocation.',
        );
      const timing = {
        occurredAt: localTimestamp(date, time),
        mealSlot: meal,
        supersedesIntakeRevisionId: correction?.id ?? null,
        revisionReason: reason,
      };
      const payload =
        source === 'recipe'
          ? {
              ...timing,
              recipeCalculationId: calculationId,
              servingCount:
                portionMode === 'servings' ? positiveNumber(quantity, 'Servings') : null,
              portionWeightGrams:
                portionMode === 'weight' ? positiveNumber(weight, 'Weight') : null,
            }
          : source === 'product'
            ? { ...timing, productId, quantity: positiveNumber(quantity, 'Quantity'), unit }
            : {
                ...timing,
                sourceName: name.trim(),
                quantity: positiveNumber(quantity, 'Quantity'),
                unit,
                values: nutrientValues(values),
              };
      if (source === 'recipe' && !calculationId)
        throw new Error('Choose a saved recipe calculation.');
      if (source === 'product' && !productId) throw new Error('Choose a product.');
      if (source === 'manual' && !name.trim()) throw new Error('Enter the food name.');
      await request(`/api/v1/nutrition/profiles/${profileId}/intake/${source}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refresh();
      onSaved();
    });
  return (
    <View style={{ gap: 14 }}>
      <EditorialText>{correction ? 'Correct intake' : 'Record food'}</EditorialText>
      <TaskError error={task.error} />
      {!correction ? (
        <ChoiceField
          label="Source"
          value={source}
          onChange={setSource}
          choices={['manual', 'recipe', 'product'].map((value) => ({ value, label: value }))}
        />
      ) : (
        <Body muted>A correction creates a new revision and keeps the original history.</Body>
      )}
      <IntakeTiming
        date={date}
        time={time}
        meal={meal}
        setDate={setDate}
        setTime={setTime}
        setMeal={setMeal}
      />
      {source === 'product' ? (
        <>
          <ResourceState resource={products} />
          <ChoiceField
            label="Pantry product"
            value={productId}
            onChange={setProductId}
            searchable
            choices={(products.data?.products ?? []).map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
          />
        </>
      ) : null}
      {source === 'recipe' ? (
        <>
          <ChoiceField
            label="Recipe"
            value={recipeId}
            onChange={(value) => {
              setRecipeId(value);
              setCalculationId('');
            }}
            searchable
            choices={state.recipes.map((recipe) => ({ value: recipe.id, label: recipe.title }))}
          />
          <ResourceState resource={calculations} />
          <ChoiceField
            label="Saved nutrition calculation"
            value={calculationId}
            onChange={setCalculationId}
            choices={(calculations.data?.calculations ?? []).map((calculation) => ({
              value: calculation.id,
              label: `Calculation ${calculation.revision} · ${Math.round(calculation.completeness * 100)}% complete`,
            }))}
          />
          {correction?.recipeCalculationId && !recipeId ? (
            <Body muted>Using the original entry’s saved calculation.</Body>
          ) : null}
          <ChoiceField
            label="Portion"
            value={portionMode}
            onChange={setPortionMode}
            choices={[
              { value: 'servings', label: 'Servings' },
              { value: 'weight', label: 'Weighed portion' },
            ]}
          />
        </>
      ) : null}
      {source === 'manual' ? (
        <FormField label="Food name" value={name} onChangeText={setName} />
      ) : null}
      {source === 'recipe' && portionMode === 'weight' ? (
        <FormField
          label="Weight (g)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
        />
      ) : (
        <FormField
          label={source === 'recipe' ? 'Servings eaten' : 'Quantity eaten'}
          value={quantity}
          onChangeText={setQuantity}
          keyboardType="decimal-pad"
        />
      )}
      {source !== 'recipe' ? <FormField label="Unit" value={unit} onChangeText={setUnit} /> : null}
      {source === 'manual' ? (
        <>
          <Body muted>Enter totals for the portion eaten. Leave unknown nutrients blank.</Body>
          {[
            ...nutrients,
            ...Object.keys(values)
              .filter((code) => !nutrients.some(([known]) => known === code))
              .map(
                (code) =>
                  [
                    code,
                    `${nutrientCatalog.find((item) => item.code === code)?.name ?? code} (${nutrientCatalog.find((item) => item.code === code)?.unit ?? ''})`,
                  ] as const,
              ),
          ].map(([code, label]) => (
            <FormField
              key={code}
              label={label}
              value={values[code] ?? ''}
              onChangeText={(value) => setValues({ ...values, [code]: value })}
              keyboardType="decimal-pad"
            />
          ))}
        </>
      ) : null}
      {source === 'manual' ? (
        <>
          <ChoiceField
            label="Add another nutrient"
            value={extraNutrient}
            onChange={setExtraNutrient}
            searchable
            choices={nutrientCatalog.map((entry) => ({
              value: entry.code,
              label: `${entry.name} (${entry.unit})`,
            }))}
          />
          <Button
            label="Add nutrient field"
            tone="secondary"
            disabled={!extraNutrient}
            onPress={() =>
              setValues((current) => ({
                ...current,
                [extraNutrient]: current[extraNutrient] ?? '',
              }))
            }
          />
        </>
      ) : null}
      {correction ? (
        <FormField label="Correction reason" value={reason} onChangeText={setReason} />
      ) : null}
      <Button
        label={task.busy ? 'Saving…' : 'Confirm eaten'}
        disabled={task.busy || state.offline}
        onPress={() => void save()}
      />
    </View>
  );
}
