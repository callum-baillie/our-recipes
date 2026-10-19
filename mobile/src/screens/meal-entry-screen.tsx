import { useResource } from '@/hooks/use-resource';
import type { AppPreferences } from '@/components/server-preferences';
import * as React from 'react';
import { Alert, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
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
import { MealAdaptationEditor } from '@/components/meal-adaptation-editor';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import { useTask } from '@/hooks/use-task';
import { localDate, shiftDate } from '@/data/planner';
import {
  mealEntryPayload,
  validDate,
  type MealEntry,
  type MealAdaptation,
} from '@/data/meal-entry';
import { tokens } from '@/theme/tokens';

export function MealEntryScreen() {
  const params = useLocalSearchParams<{ entryId?: string; date?: string; recipeId?: string }>();
  const { request } = useAuth();
  const { state } = useBord();
  const { refresh } = useSync();
  const task = useTask();
  const preferences = useResource<{ preferences: AppPreferences }>('/api/v1/settings/preferences');
  const [original, setOriginal] = React.useState<MealEntry | null>(null);
  const [loaded, setLoaded] = React.useState(!params.entryId);
  const [kind, setKind] = React.useState<MealEntry['kind']>(params.recipeId ? 'recipe' : 'item');
  const [date, setDate] = React.useState(params.date ?? localDate(new Date()));
  const [meal, setMeal] = React.useState('dinner');
  const [recipeId, setRecipeId] = React.useState(params.recipeId ?? '');
  const [title, setTitle] = React.useState('');
  const [servings, setServings] = React.useState('4');
  const [note, setNote] = React.useState('');
  const [quantity, setQuantity] = React.useState('1');
  const [unit, setUnit] = React.useState('each');
  const [sourceId, setSourceId] = React.useState('');
  const [sourceMeals, setSourceMeals] = React.useState<MealEntry[]>([]);
  const [adapt, setAdapt] = React.useState(false);
  const [adaptation, setAdaptation] = React.useState<MealAdaptation | null>(null);
  const [productId, setProductId] = React.useState('');
  const [swapId, setSwapId] = React.useState('');
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const operationKey = React.useRef(randomUUID());
  React.useEffect(() => {
    if (!params.entryId) return;
    let active = true;
    void request<{ meal: MealEntry }>(`/api/v1/meal-plan/${encodeURIComponent(params.entryId)}`)
      .then(({ meal: entry }) => {
        if (!active) return;
        setOriginal(entry);
        setKind(entry.kind);
        setDate(entry.plannedFor);
        setMeal(entry.meal);
        setRecipeId(entry.recipeId ?? '');
        setTitle(entry.title || entry.recipeTitle);
        setServings(String(entry.servings));
        setNote(entry.note);
        setSourceId(entry.leftoverSourceId ?? '');
        if (entry.recipeOverride) {
          setAdaptation(JSON.parse(entry.recipeOverride) as MealAdaptation);
          setAdapt(true);
        }
        if (entry.kind === 'item' && entry.recipeIngredientsSnapshot) {
          const snapshot = JSON.parse(entry.recipeIngredientsSnapshot) as {
            ingredients: { quantity: number | null; unit: string; productId?: string }[];
          };
          setQuantity(String(snapshot.ingredients[0]?.quantity ?? ''));
          setUnit(snapshot.ingredients[0]?.unit ?? '');
          setProductId(snapshot.ingredients[0]?.productId ?? '');
        }
        setLoaded(true);
      })
      .catch((cause) => {
        if (active) setLoadError(cause instanceof Error ? cause.message : 'Could not load meal.');
      });
    return () => {
      active = false;
    };
  }, [params.entryId, request]);
  React.useEffect(() => {
    if (!validDate(date)) return;
    let active = true;
    void request<{ meals: MealEntry[] }>(
      `/api/v1/meal-plan?start=${shiftDate(date, -30)}&end=${shiftDate(date, 7)}`,
    )
      .then(({ meals }) => {
        if (active) setSourceMeals(meals);
      })
      .catch((cause) => {
        if (active)
          setLoadError(cause instanceof Error ? cause.message : 'Could not load earlier meals.');
      });
    return () => {
      active = false;
    };
  }, [request, date]);
  const loadVariation = () =>
    task.run(async () => {
      if (!recipeId) throw new Error('Choose a recipe first.');
      if (!adaptation) {
        const { recipe } = await request<{
          recipe: Pick<MealAdaptation, 'title' | 'summary' | 'servings'> & {
            ingredientGroups: {
              name: string;
              ingredients: {
                quantity: number | null;
                unit: string;
                item: string;
                note: string;
                shoppingCategory: string;
              }[];
            }[];
            instructionSections: { title: string; steps: { body: string }[] }[];
          };
        }>(`/api/v1/recipes/${encodeURIComponent(recipeId)}`);
        setAdaptation({
          title: recipe.title,
          summary: recipe.summary,
          servings: recipe.servings,
          ingredientGroups: recipe.ingredientGroups.map((group) => ({
            name: group.name,
            ingredients: group.ingredients.map((ingredient) => ({
              ...ingredient,
              quantity: ingredient.quantity ?? '',
            })),
          })),
          instructionSections: recipe.instructionSections.map((section) => ({
            title: section.title,
            steps: section.steps.map((step) => (typeof step === 'string' ? step : step.body)),
          })),
        });
      }
      setAdapt(true);
    });
  const save = () =>
    task.run(async () => {
      const payload = mealEntryPayload({
        kind,
        date,
        meal,
        recipeId,
        title,
        servings,
        note,
        sourceId,
        quantity,
        unit,
        adaptation,
        adapt: kind === 'recipe' && adapt,
        original,
        pantryProductId: productId,
      });
      await request(
        original ? `/api/v1/meal-plan/${encodeURIComponent(original.id)}` : '/api/v1/meal-plan',
        {
          method: original ? 'PATCH' : 'POST',
          headers: original ? undefined : { 'Idempotency-Key': operationKey.current },
          body: JSON.stringify(payload),
        },
      );
      await refresh();
      router.back();
    });
  const changeStatus = (status: MealEntry['status']) =>
    task.run(async () => {
      if (!original) return;
      const { meal: updated } = await request<{ meal: MealEntry }>(
        `/api/v1/meal-plan/${encodeURIComponent(original.id)}`,
        { method: 'PATCH', body: JSON.stringify({ status }) },
      );
      setOriginal(updated);
      await refresh();
    });
  const swap = () =>
    task.run(async () => {
      const other = sourceMeals.find((entry) => entry.id === swapId);
      if (!original || !other) throw new Error('Choose another meal to swap with.');
      await request('/api/v1/meal-plan/swap', {
        method: 'POST',
        body: JSON.stringify({
          sourceId: original.id,
          targetId: other.id,
          sourceExpectedUpdatedAt: original.updatedAt,
          targetExpectedUpdatedAt: other.updatedAt,
        }),
      });
      await refresh();
      router.back();
    });
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">
        {original ? 'Edit planned meal' : 'Plan a meal'}
      </EditorialText>
      {task.error || loadError ? (
        <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
          {task.error || loadError}
        </Text>
      ) : null}
      {!loaded ? (
        <Body muted>Loading meal…</Body>
      ) : (
        <>
          <ChoiceField
            label="Meal type"
            value={kind}
            onChange={(value) => setKind(value as MealEntry['kind'])}
            choices={['recipe', 'item', 'takeout', 'custom', 'leftover'].map((value) => ({
              value,
              label: value === 'item' ? 'Food item' : value,
            }))}
          />
          <FormField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <ChoiceField
            label="Meal slot"
            value={meal}
            onChange={setMeal}
            choices={[
              ...new Set([
                ...(preferences.data?.preferences.mealPlan.visibleMealTypes ?? [
                  'breakfast',
                  'brunch',
                  'lunch',
                  'dinner',
                  'snack',
                ]),
                meal,
              ]),
            ].map((value) => ({ value, label: value }))}
          />
          {kind === 'recipe' ? (
            <ChoiceField
              label="Recipe"
              value={recipeId}
              onChange={(id) => {
                setRecipeId(id);
                setAdapt(false);
                setAdaptation(null);
              }}
              searchable
              choices={state.recipes.map((recipe) => ({ value: recipe.id, label: recipe.title }))}
            />
          ) : null}
          {kind === 'leftover' ? (
            <ChoiceField
              label="Earlier meal"
              value={sourceId}
              onChange={setSourceId}
              searchable
              choices={sourceMeals
                .filter(
                  (entry) =>
                    entry.id !== original?.id &&
                    entry.status === 'planned' &&
                    ['recipe', 'item'].includes(entry.kind) &&
                    entry.plannedFor <= date,
                )
                .map((entry) => ({
                  value: entry.id,
                  label: `${entry.plannedFor} · ${entry.recipeTitle || entry.title}`,
                }))}
            />
          ) : null}
          {!['recipe', 'leftover'].includes(kind) ? (
            <FormField
              label="Meal / food name"
              value={title}
              onChangeText={(text) => {
                setTitle(text);
                setProductId('');
              }}
            />
          ) : null}
          {kind === 'item' ? (
            <>
              <FormField
                label="Quantity per serving"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
              <FormField label="Unit" value={unit} onChangeText={setUnit} />
            </>
          ) : null}
          <FormField
            label="Servings"
            value={servings}
            onChangeText={setServings}
            keyboardType="number-pad"
          />
          <FormField label="Notes" value={note} onChangeText={setNote} multiline />
          {kind === 'recipe' ? (
            <>
              <NativeToggle
                label="Adapt this planned recipe"
                value={adapt}
                onChange={(value) => {
                  if (value) void loadVariation();
                  else setAdapt(false);
                }}
              />
              <Body muted>
                Changes apply only to this planned meal. Your cookbook recipe stays unchanged.
              </Body>
              {adapt && adaptation ? (
                <MealAdaptationEditor value={adaptation} onChange={setAdaptation} />
              ) : null}
            </>
          ) : null}
          <Button
            label={task.busy ? 'Saving…' : 'Save meal'}
            disabled={task.busy || state.offline}
            onPress={() => void save()}
          />
          {original ? (
            <Surface style={{ gap: 12 }}>
              <Body>Status: {original.effectiveStatus ?? original.status}</Body>
              <ChoiceField
                label="Set meal status"
                value={original.status}
                disabled={task.busy}
                choices={['planned', 'skipped', 'cancelled'].map((value) => ({
                  value,
                  label: value,
                }))}
                onChange={(value) => void changeStatus(value as MealEntry['status'])}
              />
              <ChoiceField
                label="Swap with another meal"
                value={swapId}
                onChange={setSwapId}
                searchable
                choices={sourceMeals
                  .filter((entry) => entry.id !== original.id)
                  .map((entry) => ({
                    value: entry.id,
                    label: `${entry.plannedFor} · ${entry.meal} · ${entry.recipeTitle}`,
                  }))}
              />
              <Button
                label="Swap meals"
                tone="secondary"
                disabled={task.busy || !swapId}
                onPress={() => void swap()}
              />
              {original.recipeId ? (
                <Button
                  label="Refresh from cookbook recipe"
                  tone="secondary"
                  disabled={task.busy}
                  onPress={() =>
                    Alert.alert(
                      'Refresh planned recipe?',
                      'Replace this meal’s saved recipe snapshot with the current cookbook version.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Refresh',
                          onPress: () =>
                            void task.run(async () => {
                              await request(`/api/v1/meal-plan/${original.id}/refresh-recipe`, {
                                method: 'POST',
                              });
                              await refresh();
                              router.back();
                            }),
                        },
                      ],
                    )
                  }
                />
              ) : null}
            </Surface>
          ) : null}
        </>
      )}
    </Screen>
  );
}
