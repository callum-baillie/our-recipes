import { ExportPanel } from '@/components/export-panel';
import { useTask } from '@/hooks/use-task';
import * as React from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/auth-context';
import { useBord } from '@/state/bord-store';
import { useSync } from '@/sync/sync-context';
import type { Recipe } from '@/data/types';
import type { EditableDetail } from '@/data/recipe-edit';
import { Body, Button, EditorialText, FormField, Surface } from '@/components/ui';
import { tokens } from '@/theme/tokens';

type Detail = EditableDetail & {
  tips: string;
  sharedNotes: string;
  sourceName: string;
  sourceUrl: string;
  personalPreference?: { rating: number | null; note: string };
  revisions: { revision: number; editedByName: string; createdAt: string }[];
};

export function RecipeTools({ recipe }: { recipe: Recipe }) {
  const { request } = useAuth();
  const { state } = useBord();
  const { refresh } = useSync();
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [shopping, setShopping] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [servings, setServings] = React.useState(String(recipe.servings));
  const [history, setHistory] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void request<{ recipe: Detail }>(`/api/v1/recipes/${encodeURIComponent(recipe.id)}`)
      .then((result) => {
        if (!cancelled) {
          setDetail(result.recipe);
          setError(null);
        }
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load recipe details.');
      });
    return () => {
      cancelled = true;
    };
  }, [recipe.id, recipe.revision, request]);
  const lifecycle = useTask();
  const [personalNote, setPersonalNote] = React.useState('');
  React.useEffect(() => {
    setPersonalNote(detail?.personalPreference?.note ?? '');
  }, [detail]);
  const restore = (revision: number) =>
    Alert.alert(
      'Restore this version?',
      'A new revision will be created. The current version remains in history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () =>
            void lifecycle.run(async () => {
              await request(
                `/api/v1/recipes/${encodeURIComponent(recipe.id)}/revisions/${revision}/restore`,
                {
                  method: 'POST',
                  body: JSON.stringify({ expectedRevision: detail?.currentRevision }),
                },
              );
              await refresh();
            }),
        },
      ],
    );
  const setStatus = (status: 'archived' | 'trash') =>
    Alert.alert(
      status === 'archived' ? 'Archive recipe?' : 'Move recipe to trash?',
      'You can restore it from Recipe archive & trash.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'archived' ? 'Archive' : 'Move to trash',
          style: 'destructive',
          onPress: () =>
            void lifecycle.run(async () => {
              await request(`/api/v1/recipes/${encodeURIComponent(recipe.id)}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status, expectedRevision: detail?.currentRevision }),
              });
              router.replace('/(app)/(recipes)');
              await refresh();
            }),
        },
      ],
    );
  const savePreference = (rating: number | null) =>
    lifecycle.run(async () => {
      await request(`/api/v1/recipes/${encodeURIComponent(recipe.id)}/preference`, {
        method: 'PUT',
        body: JSON.stringify({ rating, note: personalNote }),
      });
      setDetail((current) =>
        current ? { ...current, personalPreference: { rating, note: personalNote } } : current,
      );
      await refresh();
    });
  const addIngredients = async (existingListId?: string) => {
    if (!detail || busy) return;
    const count = Number(servings);
    if (!Number.isFinite(count) || count <= 0 || count > 100) {
      setError('Choose between 1 and 100 servings.');
      return;
    }
    setBusy(true);
    setError(null);
    let listId = existingListId;
    let added = 0;
    try {
      if (!listId) {
        const result = await request<{ list: { id: string } }>('/api/v1/shopping-lists', {
          method: 'POST',
          headers: { 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ kind: 'manual', name: recipe.title.slice(0, 120) }),
        });
        listId = result.list.id;
      }
      for (const ingredient of detail.ingredientGroups.flatMap((group) => group.ingredients)) {
        await request(`/api/v1/shopping-lists/${encodeURIComponent(listId)}/items`, {
          method: 'POST',
          body: JSON.stringify({
            item: ingredient.item,
            quantity:
              ingredient.quantity == null
                ? ''
                : (ingredient.quantity * count) / Math.max(1, recipe.servings),
            unit: ingredient.unit,
            note: ingredient.note,
            recipeId: recipe.id,
          }),
        });
        added++;
      }
      setShopping(false);
      await refresh();
      router.push(`/(app)/(lists)/${listId}`);
    } catch (cause) {
      setError(
        `${added} ingredients added. ${cause instanceof Error ? cause.message : 'Please try again.'} Check the list before adding again.`,
      );
      if (listId) {
        await refresh();
        Alert.alert(
          'List partly updated',
          'Open the list to review the ingredients already added.',
          [
            { text: 'Stay here' },
            { text: 'Open list', onPress: () => router.push(`/(app)/(lists)/${listId}`) },
          ],
        );
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <Button
        label="Edit classifications, source, nutrition & photos"
        tone="secondary"
        onPress={() => router.push(`/(app)/(recipes)/${recipe.id}/metadata`)}
      />
      <Button
        label="Calculate nutrition from ingredients"
        tone="secondary"
        onPress={() => router.push(`/(app)/(recipes)/${recipe.id}/nutrition`)}
      />
      <ExportPanel
        path="/api/v1/exports/recipes/pdf"
        filename="recipe"
        body={{ recipeIds: [recipe.id] }}
        recipe
        formats={[
          {
            label: 'Export JSON',
            path: `/api/v1/recipes/${encodeURIComponent(recipe.id)}/export`,
            extension: 'json',
          },
          {
            label: 'Export Markdown',
            path: `/api/v1/recipes/${encodeURIComponent(recipe.id)}/export/markdown`,
            extension: 'md',
          },
        ]}
      />
      {lifecycle.error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
          {lifecycle.error}
        </Text>
      ) : null}
      <Surface style={{ gap: 12 }}>
        <EditorialText>Your recipe notes</EditorialText>
        <FormField
          label="Personal note"
          value={personalNote}
          onChangeText={setPersonalNote}
          multiline
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              ['Dislike', 1],
              ['Like', 3],
              ['Staple', 5],
              ['Clear', null],
            ] as const
          ).map(([label, rating]) => (
            <Button
              key={label}
              label={`${detail?.personalPreference?.rating === rating ? '✓ ' : ''}${label}`}
              tone="secondary"
              disabled={lifecycle.busy || !detail}
              onPress={() => void savePreference(rating)}
            />
          ))}
        </View>
        <Button
          label="Save note"
          disabled={lifecycle.busy || !detail}
          onPress={() => void savePreference(detail?.personalPreference?.rating ?? null)}
        />
      </Surface>
      <Surface style={{ gap: 12 }}>
        <EditorialText>From recipe to table</EditorialText>
        <Button
          label="Add ingredients to a list"
          icon="list.bullet"
          disabled={!detail || state.offline || busy}
          onPress={() => setShopping(!shopping)}
        />
        {shopping ? (
          <>
            <FormField
              label="Servings to shop for"
              value={servings}
              onChangeText={setServings}
              keyboardType="decimal-pad"
            />
            <Button
              label={busy ? 'Adding ingredients…' : 'Create a new list'}
              disabled={busy}
              onPress={() => void addIngredients()}
            />
            {state.lists
              .filter((list) => list.status !== 'completed')
              .map((list) => (
                <Button
                  key={list.id}
                  label={`Add to ${list.name}`}
                  tone="secondary"
                  disabled={busy}
                  onPress={() => void addIngredients(list.id)}
                />
              ))}
          </>
        ) : null}
        <Button
          label="Share recipe"
          tone="secondary"
          onPress={() => {
            void Share.share({
              title: recipe.title,
              message: `${recipe.title}\nServes ${recipe.servings}\n\n${recipe.ingredients.join('\n')}\n\n${recipe.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`,
            }).catch((cause) =>
              setError(cause instanceof Error ? cause.message : 'Could not share recipe.'),
            );
          }}
        />
        {error ? (
          <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
            {error}
          </Text>
        ) : null}
      </Surface>
      {detail?.tips || detail?.sharedNotes || detail?.equipment.length ? (
        <Surface style={{ gap: 12 }}>
          <EditorialText>Kitchen notes</EditorialText>
          {detail.equipment.length ? (
            <Body>Equipment: {detail.equipment.map((item) => item.name).join(', ')}</Body>
          ) : null}
          {detail.tips ? <Body>{detail.tips}</Body> : null}
          {detail.sharedNotes ? <Body muted>{detail.sharedNotes}</Body> : null}
        </Surface>
      ) : null}
      {detail?.sourceName || detail?.sourceUrl ? (
        <Surface style={{ gap: 8 }}>
          <EditorialText>Source</EditorialText>
          <Body>{detail.sourceName || 'Original recipe'}</Body>
          {detail.sourceUrl ? <Body muted>{detail.sourceUrl}</Body> : null}
        </Surface>
      ) : null}
      {detail?.revisions?.length ? (
        <Surface style={{ gap: 12 }}>
          <Button
            label={
              history ? 'Hide edit history' : `Edit history · ${detail.revisions.length} versions`
            }
            tone="secondary"
            onPress={() => setHistory(!history)}
          />
          {history
            ? detail.revisions.map((revision) => (
                <View key={revision.revision} style={{ gap: 4 }}>
                  <Body>
                    Version {revision.revision} · {revision.editedByName || 'Household'}
                  </Body>
                  <Body muted>{new Date(revision.createdAt).toLocaleString()}</Body>
                  {revision.revision !== detail.currentRevision ? (
                    <Button
                      label="Restore this version"
                      tone="secondary"
                      disabled={lifecycle.busy}
                      onPress={() => restore(revision.revision)}
                    />
                  ) : null}
                </View>
              ))
            : null}
        </Surface>
      ) : null}
      <Surface style={{ gap: 12 }}>
        <Button
          label="Archive recipe"
          tone="secondary"
          disabled={!detail || lifecycle.busy}
          onPress={() => setStatus('archived')}
        />
        <Button
          label="Move to trash"
          tone="danger"
          disabled={!detail || lifecycle.busy}
          onPress={() => setStatus('trash')}
        />
      </Surface>
    </View>
  );
}
