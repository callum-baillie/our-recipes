import { useResource } from '@/hooks/use-resource';
import type { AppPreferences } from '@/components/server-preferences';
import { ExportPanel } from '@/components/export-panel';
import * as React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  EmptyState,
  Eyebrow,
  FormField,
  IconButton,
  Screen,
  StatusPill,
  Surface,
} from '@/components/ui';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import { localDate, shiftDate, weekDays } from '@/data/planner';
import { tokens } from '@/theme/tokens';

type Entry = {
  id: string;
  plannedFor: string;
  meal: string;
  recipeId: string | null;
  title: string;
  servings: number;
  note: string;
  expectedUpdatedAt?: string;
  updatedAt: string;
  kind?: string;
  recipeOverride?: unknown;
  foodItem?: unknown;
  leftoverSourceId?: string | null;
};

export function PlanScreen() {
  const { state } = useBord();
  const { request } = useAuth();
  const { refresh, lastSyncedAt } = useSync();
  const params = useLocalSearchParams<{ recipeId?: string }>();
  const today = localDate(new Date());
  const [selectedDate, setSelectedDate] = React.useState(today);
  const preferences = useResource<{ preferences: AppPreferences }>('/api/v1/settings/preferences');
  const planDefaults = preferences.data?.preferences.mealPlan;
  const mealTypes = planDefaults?.visibleMealTypes ?? [
    'breakfast',
    'brunch',
    'lunch',
    'dinner',
    'snack',
  ];
  const days = React.useMemo(
    () =>
      weekDays(selectedDate, planDefaults?.weekStartsOn ?? 1, planDefaults?.defaultDuration ?? 7),
    [selectedDate, planDefaults?.weekStartsOn, planDefaults?.defaultDuration],
  );
  const [open, setOpen] = React.useState(Boolean(params.recipeId));
  const [editing, setEditing] = React.useState<Entry | null>(null);
  const [recipeId, setRecipeId] = React.useState(params.recipeId ?? '');
  const [title, setTitle] = React.useState('');
  const [meal, setMeal] = React.useState('dinner');
  const [servings, setServings] = React.useState('4');
  const [note, setNote] = React.useState('');
  const [date, setDate] = React.useState(today);
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const actionLock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!params.recipeId) return;
    setRecipeId(params.recipeId);
    const recipe = state.recipes.find((entry) => entry.id === params.recipeId);
    setServings(String(recipe?.servings ?? 4));
    setDate(selectedDate);
    setEditing(null);
    setOpen(true);
    router.setParams({ recipeId: undefined });
  }, [params.recipeId, selectedDate, state.recipes]);
  const deferredQuery = React.useDeferredValue(query.trim().toLowerCase());
  const choices = React.useMemo(
    () => state.recipes.filter((recipe) => recipe.title.toLowerCase().includes(deferredQuery)),
    [state.recipes, deferredQuery],
  );
  const [remoteWeek, setRemoteWeek] = React.useState<{
    start: string;
    meals: (Entry & { recipeTitle: string })[];
  } | null>(null);
  const weekStart = days[0].iso;
  const weekEnd = days[days.length - 1].iso;
  React.useEffect(() => {
    let cancelled = false;
    void request<{ meals: (Entry & { recipeTitle: string })[] }>(
      `/api/v1/meal-plan?start=${weekStart}&end=${weekEnd}`,
    )
      .then((result) => {
        if (!cancelled) setRemoteWeek({ start: weekStart, meals: result.meals });
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load this week.');
      });
    return () => {
      cancelled = true;
    };
  }, [request, weekStart, weekEnd, lastSyncedAt]);
  const weekMeals =
    remoteWeek?.start === weekStart
      ? remoteWeek.meals.map((entry) => ({
          ...entry,
          date: entry.plannedFor,
          title: entry.recipeTitle,
        }))
      : state.mealPlan;
  const meals = weekMeals.filter((item) => item.date === selectedDate);
  const selectedRecipe = state.recipes.find((recipe) => recipe.id === recipeId);

  const run = async (action: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again.');
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const startNew = () => {
    setEditing(null);
    setRecipeId('');
    setTitle('');
    setServings('4');
    setNote('');
    setDate(selectedDate);
    setOpen(true);
    setError(null);
  };
  const save = () =>
    run(async () => {
      const count = Number(servings);
      if (!Number.isInteger(count) || count < 1 || count > 100)
        throw new Error('Choose between 1 and 100 servings.');
      if (
        !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
        Number.isNaN(Date.parse(`${date}T12:00:00`)) ||
        localDate(new Date(`${date}T12:00:00`)) !== date
      )
        throw new Error('Enter a valid date as YYYY-MM-DD.');
      if (!recipeId && !title.trim()) throw new Error('Choose a recipe or enter a meal title.');
      await request(
        editing ? `/api/v1/meal-plan/${encodeURIComponent(editing.id)}` : '/api/v1/meal-plan',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: editing ? undefined : { 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({
            kind:
              editing?.kind === 'item'
                ? undefined
                : (editing?.kind ?? (recipeId ? 'recipe' : 'custom')),
            recipeId,
            title: title.trim(),
            plannedFor: date,
            meal,
            servings: count,
            note: note.trim(),
            ...(editing
              ? { expectedUpdatedAt: editing.updatedAt, leftoverSourceId: editing.leftoverSourceId }
              : {}),
          }),
        },
      );
      setOpen(false);
      setSelectedDate(date);
      await refresh();
    });
  const remove = (id: string) =>
    Alert.alert('Remove planned meal?', 'This removes it from your meal plan.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await request(`/api/v1/meal-plan/${encodeURIComponent(id)}`, { method: 'DELETE' });
            await refresh();
          }),
      },
    ]);
  const copyWeek = () =>
    Alert.alert(
      'Copy this week?',
      `Copy the seven days starting ${weekStart} to ${shiftDate(weekStart, 7)}. Existing meals there will remain.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Copy meals',
          onPress: () =>
            void run(async () => {
              await request('/api/v1/meal-plan/duplicate', {
                method: 'POST',
                body: JSON.stringify({ weekStart, destinationWeekStart: shiftDate(weekStart, 7) }),
              });
              await refresh();
              setSelectedDate(shiftDate(selectedDate, 7));
            }),
        },
      ],
    );
  const generateList = () =>
    run(async () => {
      const { list } = await request<{ list: { id: string } }>('/api/v1/shopping-lists', {
        method: 'POST',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          kind: 'planner',
          weekStart: days[0].iso,
          weekEnd: days[days.length - 1].iso,
          sourceMode: 'pantry_missing',
        }),
      });
      await refresh();
      router.push(`/(app)/(lists)/${list.id}`);
    });
  return (
    <Screen>
      <AppHeader title="Meal plan" />
      <View style={{ gap: 6 }}>
        <Eyebrow>YOUR WEEK AT THE TABLE</Eyebrow>
        <EditorialText variant="display">Meal plan</EditorialText>
        <Body muted>Make room for good food, every day.</Body>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton
          label="Previous week"
          icon="chevron.left"
          onPress={() => setSelectedDate(shiftDate(selectedDate, -7))}
        />
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Body>
            {new Date(`${days[0].iso}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}{' '}
            –{' '}
            {new Date(`${days[days.length - 1].iso}T12:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Body>
          <Pressable
            accessibilityRole="button"
            onPress={() => setSelectedDate(today)}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: tokens.color.olive, fontWeight: '700' }}>Back to today</Text>
          </Pressable>
        </View>
        <IconButton
          label="Next week"
          icon="chevron.right"
          onPress={() => setSelectedDate(shiftDate(selectedDate, 7))}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        {days.map((day) => (
          <Pressable
            key={day.iso}
            accessibilityRole="button"
            accessibilityLabel={day.iso}
            accessibilityState={{ selected: selectedDate === day.iso }}
            onPress={() => setSelectedDate(day.iso)}
            style={{
              minWidth: 48,
              padding: 10,
              minHeight: 76,
              borderRadius: 16,
              alignItems: 'center',
              gap: 6,
              backgroundColor: selectedDate === day.iso ? tokens.color.dark : tokens.color.surface,
              borderWidth: 1,
              borderColor: day.iso === today ? tokens.color.olive : tokens.color.separator,
            }}
          >
            <Text
              style={{
                color: selectedDate === day.iso ? tokens.color.sage : tokens.color.inkSecondary,
                fontSize: 12,
              }}
            >
              {day.label}
            </Text>
            <Text
              style={{
                color: selectedDate === day.iso ? tokens.color.inverse : tokens.color.ink,
                fontSize: 22,
                fontWeight: '600',
              }}
            >
              {day.number}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Button label="Add meal" icon="plus" onPress={startNew} disabled={busy} />
      {error ? (
        <Surface>
          <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        </Surface>
      ) : null}
      <Button
        label="Plan food, takeout, leftovers or a variation"
        tone="secondary"
        onPress={() => router.push(`/(app)/(plan)/entry?date=${selectedDate}`)}
      />
      {open ? (
        <Surface style={{ gap: 14 }}>
          <EditorialText>{editing ? 'Edit meal' : 'Plan a meal'}</EditorialText>
          <FormField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {[...new Set([...mealTypes, meal])].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: meal === value }}
                onPress={() => setMeal(value)}
                style={{
                  padding: 12,
                  minHeight: 44,
                  borderRadius: 12,
                  backgroundColor: meal === value ? tokens.color.sage : tokens.color.paper,
                }}
              >
                <Text style={{ color: tokens.color.ink, textTransform: 'capitalize' }}>
                  {value}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {!editing ? (
            <>
              <FormField
                label="Find a recipe"
                value={query}
                onChangeText={setQuery}
                placeholder="Search your whole cookbook"
              />
              <ScrollView
                style={{ maxHeight: 220 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: !recipeId }}
                  onPress={() => setRecipeId('')}
                  style={{
                    padding: 12,
                    minHeight: 44,
                    backgroundColor: !recipeId ? tokens.color.sage : tokens.color.surface,
                  }}
                >
                  <Body>Custom meal / takeout</Body>
                </Pressable>
                {choices.map((recipe) => (
                  <Pressable
                    key={recipe.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: recipeId === recipe.id }}
                    onPress={() => {
                      setRecipeId(recipe.id);
                      setServings(String(recipe.servings));
                    }}
                    style={{
                      padding: 12,
                      minHeight: 44,
                      backgroundColor:
                        recipeId === recipe.id ? tokens.color.sage : tokens.color.surface,
                    }}
                  >
                    <Body>{recipe.title}</Body>
                  </Pressable>
                ))}
                {!choices.length ? <Body muted>No matching recipes.</Body> : null}
              </ScrollView>
            </>
          ) : null}
          {selectedRecipe ? (
            <StatusPill>{selectedRecipe.title}</StatusPill>
          ) : (
            <FormField label="Meal title" value={title} onChangeText={setTitle} />
          )}
          <FormField
            label="Servings"
            value={servings}
            onChangeText={setServings}
            keyboardType="number-pad"
          />
          <FormField label="Notes" value={note} onChangeText={setNote} multiline />
          <Button
            label={busy ? 'Saving…' : 'Save meal'}
            onPress={() => void save()}
            disabled={busy || state.offline}
          />
          <Button label="Cancel" tone="secondary" onPress={() => setOpen(false)} disabled={busy} />
        </Surface>
      ) : null}
      <EditorialText>
        {new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </EditorialText>
      {meals.map((item) => (
        <Surface key={item.id} style={{ gap: 12 }}>
          <Eyebrow>
            {item.meal.toUpperCase()} · {item.servings} SERVINGS
          </Eyebrow>
          <EditorialText>
            {item.title ||
              state.recipes.find((recipe) => recipe.id === item.recipeId)?.title ||
              'Planned meal'}
          </EditorialText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {item.recipeId ? (
              <Button
                label="Cook planned meal"
                tone="secondary"
                onPress={() =>
                  router.push(`/(app)/(recipes)/${item.recipeId}/cook?mealPlanEntryId=${item.id}`)
                }
              />
            ) : null}
            <Button
              label="Edit"
              tone="secondary"
              disabled={busy || state.offline}
              onPress={() =>
                router.push(`/(app)/(plan)/entry?entryId=${encodeURIComponent(item.id)}`)
              }
            />
            <IconButton
              label="Remove meal"
              icon="trash"
              disabled={busy || state.offline}
              onPress={() => remove(item.id)}
            />
          </View>
        </Surface>
      ))}
      {!meals.length ? (
        <EmptyState
          icon="calendar"
          title="A little room to plan"
          detail="Choose a recipe or add a custom meal for this day."
        />
      ) : null}
      <Button
        label={busy ? 'Working…' : 'Shop this week’s missing ingredients'}
        icon="list.bullet"
        tone="secondary"
        onPress={() => void generateList()}
        disabled={
          busy ||
          state.offline ||
          !weekMeals.some(
            (item) =>
              item.date && item.date >= days[0].iso && item.date <= days[days.length - 1].iso,
          )
        }
      />
      <Button
        label="Copy week to next week"
        icon="doc.on.doc"
        tone="secondary"
        disabled={busy || state.offline}
        onPress={copyWeek}
      />
      <ExportPanel
        path="/api/v1/meal-plan/export/pdf"
        filename="meal-plan"
        body={{ start: weekStart, end: weekEnd }}
      />
      <Button
        label="Plan with assistant"
        tone="secondary"
        icon="sparkles"
        onPress={() => router.push('/assistant')}
      />
    </Screen>
  );
}
