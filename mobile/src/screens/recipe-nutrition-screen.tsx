import { IngredientMappingEditor } from '@/components/ingredient-mapping-editor';
import * as React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
import { useResource } from '@/hooks/use-resource';
import { useTask } from '@/hooks/use-task';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import { positiveNumber } from '@/data/nutrition-commands';
import { nutrientCatalog } from '@/data/nutrient-catalog';
type Ingredient = {
  id: string;
  item: string;
  quantity: number | null;
  unit: string;
  productId: string | null;
  productName: string | null;
  isOptional: boolean;
  reason: string;
};
type Calculation = {
  id: string;
  revision: number;
  recipeRevision: number;
  servingCount: number | null;
  completeness: number;
  confidence: number;
  warnings: string[];
  values: {
    nutrientCode: string;
    amount: number;
    perServing: number | null;
    per100g: number | null;
  }[];
  contributions: { recipeIngredientId: string; missingReason: string | null }[];
};
type Adjustment = {
  excluded: boolean;
  optional: boolean;
  productId: string;
  edible: string;
  drained: string;
  evidence: string;
};
const emptyAdjustment = (): Adjustment => ({
  excluded: false,
  optional: false,
  productId: '',
  edible: '1',
  drained: '1',
  evidence: '',
});
export function RecipeNutritionScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();
  const path = `/api/v1/nutrition/recipes/${recipeId}/calculations`;
  const history = useResource<{ calculations: Calculation[] }>(path);
  const availability = useResource<{ availability: { ingredients: Ingredient[] } }>(
    `/api/v1/pantry/recipes/${recipeId}/availability`,
  );
  const products = useResource<{ products: { id: string; displayName: string }[] }>(
    '/api/v1/pantry/products',
  );
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [adjustments, setAdjustments] = React.useState<Record<string, Adjustment>>({});
  const [selected, setSelected] = React.useState('');
  const [weight, setWeight] = React.useState('');
  const [basis, setBasis] = React.useState('perServing');
  const [historyId, setHistoryId] = React.useState('');
  const ingredient = availability.data?.availability.ingredients.find(
    (item) => item.id === selected,
  );
  const adjustment = adjustments[selected] ?? emptyAdjustment();
  const set = (key: keyof Adjustment, value: string | boolean) =>
    setAdjustments((current) => ({
      ...current,
      [selected]: { ...(current[selected] ?? emptyAdjustment()), [key]: value },
    }));
  const calculate = () =>
    task.run(async () => {
      const entries = Object.entries(adjustments);
      const factors = entries
        .filter(([, value]) => !value.excluded && (value.edible !== '1' || value.drained !== '1'))
        .map(([recipeIngredientId, value]) => {
          const ediblePortion = positiveNumber(value.edible, 'Edible proportion', 1);
          const drainedYield = positiveNumber(value.drained, 'Drained proportion', 1);
          if (!value.evidence.trim())
            throw new Error('Add an evidence note for each preparation adjustment.');
          return { recipeIngredientId, ediblePortion, drainedYield, evidenceNote: value.evidence };
        });
      await request(path, {
        method: 'POST',
        body: JSON.stringify({
          includedOptionalIngredientIds: entries
            .filter(([, v]) => v.optional && !v.excluded)
            .map(([id]) => id),
          excludedIngredientIds: entries.filter(([, v]) => v.excluded).map(([id]) => id),
          substitutions: entries
            .filter(([, v]) => v.productId && !v.excluded)
            .map(([recipeIngredientId, v]) => ({ recipeIngredientId, productId: v.productId })),
          preparationFactors: factors,
          finalWeightGrams: weight.trim() ? positiveNumber(weight, 'Final cooked weight') : null,
        }),
      });
      history.reload();
      setHistoryId('');
      await refresh();
    });
  const calculation =
    history.data?.calculations.find((item) => item.id === historyId) ??
    history.data?.calculations[0];
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Recipe nutrition</EditorialText>
      <Body muted>
        Calculate from saved product nutrition records. Missing ingredients remain unknown. Each
        calculation preserves its sources and recipe revision.
      </Body>
      <Button
        label="Manage product nutrition records"
        tone="secondary"
        onPress={() => router.push('/(app)/(nutrition)/products')}
      />
      <IngredientMappingEditor recipeId={recipeId} onSaved={availability.reload} />
      <ResourceState resource={history} />
      <ResourceState resource={availability} />
      <TaskError error={task.error} />
      <Surface style={{ gap: 12 }}>
        <EditorialText>Preparation</EditorialText>
        <FormField
          label="Final cooked weight in grams (optional)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
        />
        <ChoiceField
          label="Ingredient adjustments"
          value={selected}
          onChange={setSelected}
          searchable
          choices={(availability.data?.availability.ingredients ?? []).map((item) => ({
            value: item.id,
            label: `${item.item}${item.isOptional ? ' · optional' : ''}${adjustments[item.id]?.excluded ? ' · excluded' : ''}`,
          }))}
        />
        {ingredient ? (
          <View style={{ gap: 12 }}>
            <Body>
              {ingredient.productName
                ? `Mapped to ${ingredient.productName}`
                : 'No Pantry product mapping'}
              {ingredient.reason ? ` · ${ingredient.reason}` : ''}
            </Body>
            <NativeToggle
              label="Exclude from this calculation"
              value={adjustment.excluded}
              onChange={(value) => set('excluded', value)}
            />
            {!adjustment.excluded ? (
              <>
                <NativeToggle
                  label="Include optional ingredient"
                  value={adjustment.optional}
                  onChange={(value) => set('optional', value)}
                />
                <ResourceState resource={products} />
                <ChoiceField
                  label="Substitute product for this calculation"
                  value={adjustment.productId}
                  onChange={(value) => set('productId', value)}
                  searchable
                  choices={[
                    { value: '', label: 'Use existing mapping' },
                    ...(products.data?.products ?? []).map((item) => ({
                      value: item.id,
                      label: item.displayName,
                    })),
                  ]}
                />
                <FormField
                  label="Edible proportion (0–1)"
                  value={adjustment.edible}
                  onChangeText={(value) => set('edible', value)}
                  keyboardType="decimal-pad"
                />
                <FormField
                  label="Drained yield (0–1)"
                  value={adjustment.drained}
                  onChangeText={(value) => set('drained', value)}
                  keyboardType="decimal-pad"
                />
                <FormField
                  label="Preparation evidence"
                  value={adjustment.evidence}
                  onChangeText={(value) => set('evidence', value)}
                />
              </>
            ) : null}
          </View>
        ) : null}
        <Button
          label="Save nutrition calculation"
          disabled={task.busy || !availability.data}
          onPress={() => void calculate()}
        />
      </Surface>
      {calculation ? (
        <>
          <ChoiceField
            label="Calculation history"
            value={calculation.id}
            onChange={setHistoryId}
            choices={(history.data?.calculations ?? []).map((item) => ({
              value: item.id,
              label: `Calculation ${item.revision} · recipe revision ${item.recipeRevision}`,
            }))}
          />
          <Surface style={{ gap: 10 }}>
            <EditorialText>Calculated nutrients</EditorialText>
            <Body muted>
              {Math.round(calculation.completeness * 100)}% complete ·{' '}
              {Math.round(calculation.confidence * 100)}% confidence
            </Body>
            <ChoiceField
              label="Amounts"
              value={basis}
              onChange={setBasis}
              choices={[
                { value: 'perServing', label: 'Per serving' },
                { value: 'amount', label: 'Whole recipe' },
                { value: 'per100g', label: 'Per 100 g' },
              ]}
            />
            {calculation.warnings.map((warning, index) => (
              <Body key={index}>{warning}</Body>
            ))}
            {calculation.values.map((value) => {
              const nutrient = nutrientCatalog.find((item) => item.code === value.nutrientCode);
              const amount = value[basis as 'amount' | 'perServing' | 'per100g'];
              return (
                <Body key={value.nutrientCode}>
                  {nutrient?.name ?? value.nutrientCode}:{' '}
                  {amount == null
                    ? 'Unknown'
                    : `${Number(amount.toFixed(2))} ${nutrient?.unit ?? ''}`}
                </Body>
              );
            })}
            {calculation.contributions
              .filter((item) => item.missingReason)
              .map((item, index) => (
                <Body key={index} muted>
                  {availability.data?.availability.ingredients.find(
                    (ingredient) => ingredient.id === item.recipeIngredientId,
                  )?.item ?? 'Ingredient'}
                  : {item.missingReason}
                </Body>
              ))}
          </Surface>
        </>
      ) : (
        <Body muted>No saved calculation yet.</Body>
      )}
    </Screen>
  );
}
