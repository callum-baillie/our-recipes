import { describe, expect, it } from 'vitest';

import { rankShoppingScanMatches, scoreShoppingScanMatch } from '@/lib/domain/shopping-scan-match';

describe('shopping scan matching', () => {
  it('treats the same generic product from another brand as a strong suggestion', () => {
    const score = scoreShoppingScanMatch('Raley’s marshmallows', {
      displayName: 'Jet-Puffed Marshmallows',
      genericName: 'Marshmallows',
      brand: 'Jet-Puffed',
      categories: ['Confectionery'],
    });

    expect(score).toBeGreaterThan(0.7);
  });

  it('ranks relevant unresolved list items ahead of unrelated products', () => {
    const matches = rankShoppingScanMatches(
      [
        { id: 'milk', item: 'whole milk' },
        { id: 'butter', item: 'butter' },
        { id: 'bananas', item: 'bananas' },
      ],
      {
        displayName: 'Organic Whole Milk',
        genericName: 'Whole milk',
        brand: 'Example Dairy',
        categories: ['Milk', 'Dairy'],
      },
    );

    expect(matches[0]).toMatchObject({ id: 'milk' });
    expect(matches.some((match) => match.id === 'bananas')).toBe(false);
  });
});
