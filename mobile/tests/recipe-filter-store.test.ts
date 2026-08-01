import { describe, expect, it } from 'vitest';
import { activeRecipeFilterCount, defaultRecipeFilters } from '@/state/recipe-filter-store';

describe('recipe filter state', () => {
  it('starts without active refinements', () => {
    expect(activeRecipeFilterCount(defaultRecipeFilters)).toBe(0);
  });

  it('counts scopes, categories, each tag, and a collection', () => {
    expect(
      activeRecipeFilterCount({
        scope: 'favorites',
        category: 'Dinner',
        selectedTags: ['quick', 'vegetarian'],
        selectedCollection: 'weeknights',
      }),
    ).toBe(5);
  });
});
