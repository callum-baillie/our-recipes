import * as React from 'react';
import { router } from 'expo-router';
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
import { ExportPanel } from '@/components/export-panel';
import { ResourceState } from '@/components/nutrition-workspace-common';
import { useResource } from '@/hooks/use-resource';
import { useBord } from '@/state/bord-store';
import { nutrientCatalog } from '@/data/nutrient-catalog';
const fields = [
  ['q', 'Search'],
  ['category', 'Category'],
  ['cuisine', 'Cuisine'],
  ['tag', 'Tag'],
  ['maxTotalMinutes', 'Maximum minutes'],
  ['maxCaloriesPerServing', 'Maximum calories per serving'],
  ['minProteinPerServing', 'Minimum protein (g)'],
  ['minFiberPerServing', 'Minimum fiber (g)'],
  ['maxSodiumPerServing', 'Maximum sodium (mg)'],
  ['minNutritionCompleteness', 'Minimum nutrition completeness (%)'],
] as const;
export function LibraryWorkspaceScreen() {
  const { state } = useBord();
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState(true);
  const [selected, setSelected] = React.useState<string[]>([]);
  const resource = useResource<{
    library: {
      recipes: { id: string; title: string; summary: string }[];
      total: number;
      totalPages: number;
    };
  }>(`/api/v1/recipes?${query}&page=${page}`);
  const set = (key: string, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const choice = (key: string, label: string, choices: { value: string; label: string }[]) => (
    <ChoiceField
      label={label}
      value={filters[key] ?? ''}
      onChange={(value) => set(key, value)}
      choices={choices}
    />
  );
  return (
    <Screen>
      <AppHeader back />
      <EditorialText variant="title">Explore & export recipes</EditorialText>
      <Button
        label={open ? 'Hide filters' : 'Show filters'}
        tone="secondary"
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <Surface style={{ gap: 12 }}>
          {fields.map(([key, label]) => (
            <FormField
              key={key}
              label={label}
              value={filters[key] ?? ''}
              onChangeText={(value) => set(key, value)}
              keyboardType={
                key.startsWith('min') || key.startsWith('max') ? 'decimal-pad' : undefined
              }
            />
          ))}
          {choice('collection', 'Collection', [
            { value: '', label: 'All collections' },
            ...state.collections.map((item) => ({ value: item.id, label: item.name })),
          ])}
          {choice('creator', 'Created by', [
            { value: '', label: 'Anyone' },
            ...state.profiles.map((item) => ({ value: item.id, label: item.displayName })),
          ])}
          {choice('pantry', 'Pantry availability', [
            { value: '', label: 'Any' },
            ...['ready', 'partial', 'unknown'].map((value) => ({ value, label: value })),
          ])}
          {choice(
            'sort',
            'Order',
            [
              'recently-added',
              'recently-updated',
              'alphabetical',
              'most-recently-cooked',
              'shortest-time',
              'highest-rated',
              'lowest-calories',
              'highest-protein',
              'highest-fiber',
              'lowest-sodium',
              'highest-nutrition-completeness',
            ].map((value) => ({ value, label: value.replaceAll('-', ' ') })),
          )}
          {choice('supportsNutrient', 'Has nutrient evidence', [
            { value: '', label: 'Any nutrient' },
            ...nutrientCatalog.map((item) => ({ value: item.code, label: item.name })),
          ])}
          <NativeToggle
            label="Favorites only"
            value={filters.favorite === 'true'}
            onChange={(value) => set('favorite', value ? 'true' : '')}
          />
          <NativeToggle
            label="Previously cooked"
            value={filters.cooked === 'true'}
            onChange={(value) => set('cooked', value ? 'true' : '')}
          />
          <Button
            label="Apply filters"
            onPress={() => {
              setQuery(
                new URLSearchParams(
                  Object.entries(filters).filter(([, value]) => value.trim()),
                ).toString(),
              );
              setPage(1);
              setOpen(false);
            }}
          />
          <Button
            label="Reset filters"
            tone="secondary"
            onPress={() => {
              setFilters({});
              setQuery('');
              setPage(1);
            }}
          />
        </Surface>
      ) : null}
      <ResourceState resource={resource} />
      <Body>
        {resource.data?.library.total ?? 0} recipes · {selected.length} selected (maximum 100)
      </Body>
      <Button
        label="Select this page"
        tone="secondary"
        onPress={() =>
          setSelected((current) =>
            [
              ...new Set([
                ...current,
                ...(resource.data?.library.recipes ?? []).map((item) => item.id),
              ]),
            ].slice(0, 100),
          )
        }
      />
      {selected.length ? (
        <>
          <Button label="Clear selection" tone="quiet" onPress={() => setSelected([])} />
          <ExportPanel
            path="/api/v1/exports/recipes/pdf"
            filename="cookbook"
            body={{ recipeIds: selected }}
            recipe
          />
        </>
      ) : null}
      {resource.data?.library.recipes.map((item) => (
        <Surface key={item.id} style={{ gap: 8 }}>
          <NativeToggle
            label={item.title}
            value={selected.includes(item.id)}
            onChange={() =>
              setSelected((current) =>
                current.includes(item.id)
                  ? current.filter((id) => id !== item.id)
                  : current.length < 100
                    ? [...current, item.id]
                    : current,
              )
            }
          />
          {item.summary ? <Body muted>{item.summary}</Body> : null}
          <Button
            label="Open recipe"
            tone="secondary"
            onPress={() => router.push(`/(app)/(recipes)/${item.id}`)}
          />
        </Surface>
      ))}
      <Button
        label="Previous page"
        tone="secondary"
        disabled={page <= 1 || resource.loading}
        onPress={() => setPage((value) => value - 1)}
      />
      <Body>
        Page {page} of {resource.data?.library.totalPages ?? 1}
      </Body>
      <Button
        label="Next page"
        tone="secondary"
        disabled={!resource.data || page >= resource.data.library.totalPages || resource.loading}
        onPress={() => setPage((value) => value + 1)}
      />
    </Screen>
  );
}
