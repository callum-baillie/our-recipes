import { describe, expect, it } from 'vitest';
import { emptyRecipeInput, recipeInputSchema } from '@/lib/domain/recipe';
import { restoreRecipeDraft } from '@/lib/domain/recipe-draft';
const defaults = { ...emptyRecipeInput, equipmentText: '' };
describe('unfinished recipe draft recovery', () => {
  it('recovers blank title, partial ingredient and empty method without relaxing save validation', () => {
    const draft = {
      ...defaults,
      title: '',
      ingredientGroups: [
        { name: '', ingredients: [{ quantity: '0.', unit: 'g', item: '', note: 'still writing' }] },
      ],
    };
    const recovered = restoreRecipeDraft(JSON.stringify(draft), defaults);
    expect(recovered?.ingredientGroups[0]?.ingredients[0]?.note).toBe('still writing');
    expect(recovered?.ingredientGroups[0]?.ingredients[0]?.quantity).toBe('0.');
    expect(recipeInputSchema.safeParse(recovered).success).toBe(false);
  });
  it('retains legacy tags, known categories, free-text yield, custom difficulty and explicit zero', () => {
    const draft = {
      ...defaults,
      tagsText: 'weeknight, soup',
      difficulty: 'Quite fiddly',
      servings: '2 servings (4 bagels)',
      prepMinutes: 0,
      ingredientGroups: [
        {
          name: '',
          ingredients: [
            { quantity: 1, unit: 'package', item: 'flour', note: '', shoppingCategory: 'Baking' },
          ],
        },
      ],
    };
    const restored = restoreRecipeDraft(JSON.stringify(draft), defaults);
    expect(restored?.tags).toEqual(['weeknight', 'soup']);
    expect(restored?.difficulty).toBe('Quite fiddly');
    expect(restored?.servings).toBe('2 servings (4 bagels)');
    expect(restored?.prepMinutes).toBe(0);
    expect(restored?.ingredientGroups[0]?.ingredients[0]?.shoppingCategory).toBe('Baking');
  });
  it('rejects corrupt and oversized data', () => {
    expect(restoreRecipeDraft('{', defaults)).toBeNull();
    expect(restoreRecipeDraft('null', defaults)).toBeNull();
    expect(
      restoreRecipeDraft(JSON.stringify({ ...defaults, title: 'x'.repeat(1001) }), defaults),
    ).toBeNull();
    expect(restoreRecipeDraft('x'.repeat(1_000_001), defaults)).toBeNull();
  });
});

import { ingredientIdentityChanged } from '@/lib/domain/ingredient-identity';
it('keeps harmless spelling edits and flags a different linked ingredient', () => {
  expect(ingredientIdentityChanged('Plain flour', 'plain-flour')).toBe(false);
  expect(ingredientIdentityChanged('flour', 'flor')).toBe(false);
  expect(ingredientIdentityChanged('whole milk', 'oat drink')).toBe(true);
});

it('recovers invalid editable values while leaving final validation strict', () => {
  const draft = { ...defaults, title: 'x'.repeat(161), sourceUrl: 'unfinished link' };
  const restored = restoreRecipeDraft(JSON.stringify(draft), defaults);
  expect(restored?.sourceUrl).toBe('unfinished link');
  expect(restored?.title).toHaveLength(161);
  expect(recipeInputSchema.safeParse(restored).success).toBe(false);
});
