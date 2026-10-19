import { describe, expect, it } from 'vitest';
import { preserveRecipeFields, type EditableDetail } from '../src/data/recipe-edit';
const detail: EditableDetail = {
  currentRevision: 3,
  status: 'active',
  sourceUrl: 'https://example.com/soup',
  tags: ['soup'],
  nutritionCalories: 250,
  tips: 'Simmer gently',
  equipment: [{ name: 'Pot' }],
  ingredientGroups: [
    {
      name: 'Soup',
      ingredients: [
        { quantity: 2, unit: 'cups', item: 'stock', note: '', shoppingCategory: 'Other' },
      ],
    },
  ],
  instructionSections: [{ title: 'Cook', steps: [{ body: 'Simmer.' }] }],
};
const original = { revision: 3, ingredients: ['2 cups stock'], steps: ['Simmer.'] };
describe('safe mobile recipe edits', () => {
  it('retains structured ingredients, sections, equipment and metadata on a title edit', () => {
    const result = preserveRecipeFields(
      detail,
      { title: 'New title', nutritionCalories: '', sourceUrl: '' },
      original,
      original,
    );
    expect(result).toMatchObject({
      title: 'New title',
      expectedRevision: 3,
      nutritionCalories: 250,
      sourceUrl: detail.sourceUrl,
      equipment: ['Pot'],
      tips: 'Simmer gently',
    });
    expect(result.ingredientGroups).toEqual([
      {
        name: 'Soup',
        ingredients: [{ ...detail.ingredientGroups[0].ingredients[0], pantryProductId: '' }],
      },
    ]);
    expect(result.instructionSections).toEqual([{ title: 'Cook', steps: ['Simmer.'] }]);
  });
  it('keeps intentional ingredient edits while preserving unrelated fields', () => {
    const edited = { ingredientGroups: [{ name: '', ingredients: [{ item: 'water' }] }] };
    expect(
      preserveRecipeFields(detail, edited, original, { ...original, ingredients: ['water'] }),
    ).toMatchObject({
      ingredientGroups: [{ name: 'Soup', ingredients: [{ item: 'water' }] }],
      tips: 'Simmer gently',
    });
  });
  it('rejects stale and missing revisions rather than overwriting another editor', () => {
    expect(() =>
      preserveRecipeFields({ ...detail, currentRevision: 4 }, {}, original, original),
    ).toThrow('changed');
    expect(() =>
      preserveRecipeFields(detail, {}, { ...original, revision: undefined }, original),
    ).toThrow('changed');
  });
  it('preserves unknown nutrition as blank rather than zero', () => {
    expect(
      preserveRecipeFields({ ...detail, nutritionCalories: null }, {}, original, original),
    ).toMatchObject({ nutritionCalories: '' });
  });
});
