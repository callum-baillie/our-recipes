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
import { NutritionSourcePortions } from '@/components/nutrition-source-portions';
import {
  nutritionSourceContextKey,
  type NutritionSourceRecord,
} from '../../../shared/mobile-domain/nutrition-source-portions';

type SavedProductRecord = Omit<NutritionSourceRecord, 'sourceName'> & { source: { name: string } };
type Correction = FullDiaryEntry & { foodNutritionRecordId?: string | null };

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
  correction?: Correction | null;
  onSaved: () => void;
}) {
  const { request } = useAuth();
  const { state } = useBord();
  const { refresh } = useSync();
  const task = useTask();
  const confirmationLock = React.useRef(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [writeState, setWriteState] = React.useState<'editable' | 'unknown' | 'saved'>('editable');
  const [saveMessage, setSaveMessage] = React.useState('');
  const [portionReviewKey, setPortionReviewKey] = React.useState<string | null>(null);
  const locked = task.busy || writeState !== 'editable';
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
  const productRecords = useResource<{
    records: SavedProductRecord[];
    preferredRecord: SavedProductRecord | null;
  }>(
    source === 'product' && productId
      ? `/api/v1/nutrition/products/${encodeURIComponent(productId)}/records`
      : null,
  );
  const selectedRecord = correction
    ? productRecords.data?.records.find((record) => record.id === correction.foodNutritionRecordId)
    : productRecords.data?.preferredRecord;
  const productRecord: NutritionSourceRecord | null = selectedRecord
    ? { ...selectedRecord, sourceName: selectedRecord.source.name }
    : null;
  const recordKey = productRecord ? nutritionSourceContextKey(productId, productRecord) : null;
  const portionNeedsReview = !!portionReviewKey && portionReviewKey !== recordKey;
  const save = () => {
    if (confirmationLock.current || writeState !== 'editable') return;
    confirmationLock.current = true;
    return task.run(async () => {
      let attempted = false;
      let acknowledged = false;
      try {
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
              ? {
                  ...timing,
                  productId,
                  quantity: positiveNumber(quantity, 'Quantity'),
                  unit,
                  expectedFoodNutritionRecordId: productRecord?.id,
                }
              : {
                  ...timing,
                  sourceName: name.trim(),
                  quantity: positiveNumber(quantity, 'Quantity'),
                  unit,
                  values: nutrientValues(values),
                };
        if (source === 'recipe' && !calculationId)
          throw new Error('Choose a saved recipe calculation.');
        if (source === 'product') {
          if (!productId) throw new Error('Choose a product.');
          if (!productRecord || productRecords.loading || productRecords.error)
            throw new Error(
              'Load and review the saved nutrition record before logging this product.',
            );
          if (portionNeedsReview)
            throw new Error(
              'The saved source changed. Review the retained amount or choose a new source portion.',
            );
        }
        if (source === 'manual' && !name.trim()) throw new Error('Enter the food name.');
        attempted = true;
        await request(`/api/v1/nutrition/profiles/${profileId}/intake/${source}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        acknowledged = true;
        if (!alive.current) return;
        setWriteState('saved');
        setSaveMessage('Food saved.');
        try {
          await refresh();
        } catch {
          if (alive.current)
            setSaveMessage(
              'Food saved. The dashboard could not refresh; open the diary to review the saved entry.',
            );
          return;
        }
        if (alive.current) onSaved();
      } catch (cause) {
        const status =
          cause && typeof cause === 'object' && 'status' in cause ? Number(cause.status) : null;
        if (
          alive.current &&
          attempted &&
          !acknowledged &&
          (status === null || !Number.isFinite(status) || status === 408 || status >= 500)
        ) {
          setWriteState('unknown');
          setSaveMessage(
            'The result could not be confirmed. Your reviewed amount is retained. Check the diary before recording again; this form will not resend it.',
          );
        }
        if (alive.current && source === 'product' && status === 409) productRecords.reload();
        throw cause;
      } finally {
        confirmationLock.current = false;
      }
    });
  };
  return (
    <View style={{ gap: 14 }}>
      <EditorialText>{correction ? 'Correct intake' : 'Record food'}</EditorialText>
      <TaskError error={task.error} />
      {saveMessage ? (
        <View accessible accessibilityLiveRegion="polite">
          <Body>{saveMessage}</Body>
        </View>
      ) : null}
      {!correction ? (
        <ChoiceField
          label="Source"
          value={source}
          onChange={(value) => {
            setSource(value);
            setPortionReviewKey(null);
          }}
          disabled={locked}
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
        disabled={locked}
      />
      {source === 'product' ? (
        <>
          <ResourceState resource={products} />
          <ChoiceField
            label="Pantry product"
            value={productId}
            onChange={setProductId}
            disabled={locked || !!correction}
            searchable
            choices={(products.data?.products ?? []).map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
          />
          {productId ? <ResourceState resource={productRecords} /> : null}
          {productRecord ? (
            <>
              <NutritionSourcePortions
                key={`${profileId}:${correction?.id ?? 'new'}:${recordKey}`}
                productId={productId}
                record={productRecord}
                disabled={locked}
                onSelect={(amount) => {
                  if (confirmationLock.current || locked) return;
                  setQuantity(String(amount.quantity));
                  setUnit(amount.unit);
                  setPortionReviewKey(recordKey);
                }}
              />
              <Body muted>
                Supported units: {productRecord.supportedUnits.join(', ') || 'None recorded'}.
                Amount and unit stay unchanged until you choose a portion or edit them.
              </Body>
              {portionNeedsReview ? (
                <>
                  <Body>
                    The saved source changed. Your amount is retained; choose a new portion or
                    review it for this record.
                  </Body>
                  <Button
                    label="Use the entered amount with this record"
                    tone="secondary"
                    disabled={locked}
                    onPress={() => setPortionReviewKey(null)}
                  />
                </>
              ) : null}
              <Button
                label="Reload saved nutrition record"
                tone="quiet"
                disabled={locked}
                onPress={productRecords.reload}
              />
            </>
          ) : productId && !productRecords.loading && !productRecords.error ? (
            <Body muted>
              {correction
                ? 'The original nutrition snapshot is unavailable. Return to the diary and reload this entry.'
                : 'This product has no saved nutrition record. Review its label in Product nutrition records, or use manual food recording.'}
            </Body>
          ) : null}
        </>
      ) : null}
      {source === 'recipe' ? (
        <>
          <ChoiceField
            label="Recipe"
            disabled={locked}
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
            disabled={locked}
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
            disabled={locked}
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
        <FormField label="Food name" value={name} onChangeText={setName} editable={!locked} />
      ) : null}
      {source === 'recipe' && portionMode === 'weight' ? (
        <FormField
          label="Weight (g)"
          value={weight}
          onChangeText={setWeight}
          editable={!locked}
          keyboardType="decimal-pad"
        />
      ) : (
        <FormField
          label={source === 'recipe' ? 'Servings eaten' : 'Quantity eaten'}
          value={quantity}
          onChangeText={(value) => {
            setQuantity(value);
            setPortionReviewKey(null);
          }}
          editable={!locked}
          keyboardType="decimal-pad"
        />
      )}
      {source !== 'recipe' ? (
        <FormField
          label="Unit"
          value={unit}
          onChangeText={(value) => {
            setUnit(value);
            setPortionReviewKey(null);
          }}
          editable={!locked}
        />
      ) : null}
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
              editable={!locked}
              keyboardType="decimal-pad"
            />
          ))}
        </>
      ) : null}
      {source === 'manual' ? (
        <>
          <ChoiceField
            label="Add another nutrient"
            disabled={locked}
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
            disabled={locked || !extraNutrient}
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
        <FormField
          label="Correction reason"
          value={reason}
          onChangeText={setReason}
          editable={!locked}
        />
      ) : null}
      <Button
        label={task.busy ? 'Saving…' : 'Confirm eaten'}
        disabled={
          locked ||
          state.offline ||
          (source === 'product' &&
            (!productRecord ||
              productRecords.loading ||
              !!productRecords.error ||
              portionNeedsReview))
        }
        onPress={() => void save()}
      />
      {writeState !== 'editable' ? (
        <Button label="Review diary" tone="secondary" disabled={task.busy} onPress={onSaved} />
      ) : null}
    </View>
  );
}
