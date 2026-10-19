import * as React from 'react';
import { Alert, Text, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { useSync } from '@/sync/sync-context';
import {
  AppHeader,
  Body,
  Button,
  EditorialText,
  EmptyState,
  Screen,
  Surface,
} from '@/components/ui';
import { useTask } from '@/hooks/use-task';
import { tokens } from '@/theme/tokens';

type ArchivedRecipe = { id: string; title: string; summary: string; currentRevision: number };
export function RecipeLifecycleScreen() {
  const { request } = useAuth();
  const { refresh } = useSync();
  const task = useTask();
  const [status, setStatus] = React.useState<'archived' | 'trash'>('archived');
  const [page, setPage] = React.useState(1);
  const [result, setResult] = React.useState<{
    recipes: ArchivedRecipe[];
    totalPages: number;
  } | null>(null);
  const [version, setVersion] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    void request<{ library: { recipes: ArchivedRecipe[]; totalPages: number } }>(
      `/api/v1/recipes?status=${status}&page=${page}`,
    )
      .then(({ library }) => {
        if (!cancelled) setResult(library);
      })
      .catch((cause) => {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Could not load recipes.');
      });
    return () => {
      cancelled = true;
    };
  }, [request, status, page, version]);
  const changeStatus = (recipe: ArchivedRecipe, next: 'active' | 'trash') =>
    Alert.alert(next === 'active' ? 'Restore recipe?' : 'Move recipe to trash?', recipe.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: next === 'active' ? 'Restore' : 'Move to trash',
        style: next === 'trash' ? 'destructive' : 'default',
        onPress: () =>
          void task.run(async () => {
            await request(`/api/v1/recipes/${encodeURIComponent(recipe.id)}/status`, {
              method: 'PATCH',
              body: JSON.stringify({ status: next, expectedRevision: recipe.currentRevision }),
            });
            setVersion((current) => current + 1);
            await refresh();
          }),
      },
    ]);
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Recipe archive & trash</EditorialText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(['archived', 'trash'] as const).map((value) => (
          <Button
            key={value}
            label={`${status === value ? '✓ ' : ''}${value === 'archived' ? 'Archive' : 'Trash'}`}
            tone="secondary"
            onPress={() => {
              setPage(1);
              setStatus(value);
            }}
          />
        ))}
      </View>
      {error || task.error ? (
        <Text accessibilityRole="alert" style={{ color: tokens.color.danger }}>
          {error || task.error}
        </Text>
      ) : null}
      {!result && !error ? <Body muted>Loading recipes…</Body> : null}
      {result?.recipes.map((recipe) => (
        <Surface key={recipe.id} style={{ gap: 12 }}>
          <EditorialText>{recipe.title}</EditorialText>
          <Body muted>{recipe.summary}</Body>
          <Button
            label="Restore to cookbook"
            disabled={task.busy}
            onPress={() => changeStatus(recipe, 'active')}
          />
          {status === 'archived' ? (
            <Button
              label="Move to trash"
              tone="danger"
              disabled={task.busy}
              onPress={() => changeStatus(recipe, 'trash')}
            />
          ) : null}
        </Surface>
      ))}
      {result && !result.recipes.length ? (
        <EmptyState
          icon="archivebox"
          title="Nothing here"
          detail="Recipes you archive or move to trash will appear here."
        />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label="Previous"
          tone="secondary"
          disabled={page <= 1}
          onPress={() => setPage(page - 1)}
        />
        <Button label={`Page ${page}`} tone="quiet" onPress={() => setVersion(version + 1)} />
        <Button
          label="Next"
          tone="secondary"
          disabled={!result || page >= result.totalPages}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </Screen>
  );
}
