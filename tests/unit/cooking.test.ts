import { describe, expect, it } from 'vitest';

import { convertTemperature, scaledQuantity } from '@/lib/domain/cooking';

describe('cooking helpers', () => {
  it('scales numeric quantities without changing an unknown quantity', () => {
    expect(scaledQuantity(200, '2 servings', 4)).toBe(400);
    expect(scaledQuantity(null, '2 servings', 4)).toBeNull();
  });

  it('performs a labeled temperature conversion', () => {
    expect(convertTemperature(180, 'C')).toBe(356);
    expect(convertTemperature(350, 'F')).toBe(177);
  });
});
