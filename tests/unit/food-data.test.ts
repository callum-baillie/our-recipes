import { describe, expect, it } from 'vitest';

import { barcodeLookupInputSchema, normalizeGtin } from '@/lib/domain/food-data';

describe('food-data identity boundaries', () => {
  it('preserves the displayed GTIN and compares through canonical GTIN-14', () => {
    expect(normalizeGtin('4006 3813-3393 1')).toEqual({
      value: '4006381333931',
      canonicalGtin: '04006381333931',
    });
    expect(normalizeGtin('036000291452').canonicalGtin).toBe('00036000291452');
  });

  it('rejects malformed lengths, non-digits, and invalid check digits', () => {
    expect(() => normalizeGtin('4006381333932')).toThrow('check digit');
    expect(() => normalizeGtin('ABC4006381333931')).toThrow();
    expect(() => normalizeGtin('1234')).toThrow();
  });

  it('normalizes a strict lookup request without enabling optional USDA comparison', () => {
    expect(barcodeLookupInputSchema.parse({ barcode: '4006381333931' })).toMatchObject({
      value: '4006381333931',
      canonicalGtin: '04006381333931',
      language: 'en',
      compareUsda: false,
    });
    expect(
      barcodeLookupInputSchema.safeParse({ barcode: '4006381333931', extra: true }).success,
    ).toBe(false);
  });
});
