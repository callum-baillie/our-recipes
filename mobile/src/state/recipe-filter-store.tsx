import * as React from 'react';

export type RecipeFilters = {
  scope: 'all' | 'favorites' | 'recent';
  category: string;
  selectedTags: string[];
  selectedCollection: string | null;
};

export const defaultRecipeFilters: RecipeFilters = {
  scope: 'all',
  category: 'all',
  selectedTags: [],
  selectedCollection: null,
};

type RecipeFilterContextValue = {
  filters: RecipeFilters;
  applyFilters: (filters: RecipeFilters) => void;
  clearFilters: () => void;
};

const RecipeFilterContext = React.createContext<RecipeFilterContextValue | null>(null);

export function RecipeFilterProvider({ children }: React.PropsWithChildren) {
  const [filters, setFilters] = React.useState<RecipeFilters>(defaultRecipeFilters);
  const value = React.useMemo(
    () => ({
      filters,
      applyFilters: (next: RecipeFilters) =>
        setFilters({ ...next, selectedTags: [...next.selectedTags] }),
      clearFilters: () => setFilters(defaultRecipeFilters),
    }),
    [filters],
  );

  return <RecipeFilterContext.Provider value={value}>{children}</RecipeFilterContext.Provider>;
}

export function useRecipeFilters() {
  const value = React.use(RecipeFilterContext);
  if (!value) throw new Error('useRecipeFilters must be used within RecipeFilterProvider.');
  return value;
}

export function activeRecipeFilterCount(filters: RecipeFilters) {
  return (
    Number(filters.scope !== 'all') +
    Number(filters.category !== 'all') +
    filters.selectedTags.length +
    Number(Boolean(filters.selectedCollection))
  );
}
