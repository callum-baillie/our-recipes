import { describe, expect, it } from 'vitest';

import { rankPantryMatches } from '@/lib/domain/pantry-shopping-match';

const products = [
  { id: 'tomato', displayName: 'Tomatoes', aliases: ['Fresh tomato'] },
  { id: 'paste', displayName: 'Tomato paste', aliases: [] },
  { id: 'parsley', displayName: 'Flat-leaf parsley', aliases: ['Fresh parsley'] },
];

describe('Pantry shopping matches', () => {
  it('treats singular and plural exact identities as certain', () => {
    expect(rankPantryMatches('tomato', products)[0]).toMatchObject({
      productId: 'tomato',
      score: 1,
      certain: true,
    });
  });

  it('uses exact aliases for automatic matches', () => {
    expect(rankPantryMatches('fresh parsley', products)[0]).toMatchObject({
      productId: 'parsley',
      score: 1,
      certain: true,
      matchedName: 'Fresh parsley',
    });
  });

  it('offers related names without auto-matching an ambiguous item', () => {
    const matches = rankPantryMatches('chopped tomato', products);
    expect(matches.map(({ productId }) => productId)).toContain('tomato');
    expect(matches[0]?.certain).toBe(false);
  });

  it('does not auto-match when two Pantry products share the same exact alias', () => {
    expect(
      rankPantryMatches('fresh tomato', [
        ...products,
        { id: 'heirloom', displayName: 'Heirloom tomatoes', aliases: ['Fresh tomato'] },
      ])[0]?.certain,
    ).toBe(false);
  });

  it('returns no section-worthy matches for unrelated Pantry items', () => {
    expect(rankPantryMatches('wholegrain bread', products)).toEqual([]);
  });
});
