import { describe, expect, it } from 'vitest';
import { productImageGtin } from '@/lib/domain/product-image';

const id = (
  identifierType: string,
  value: string,
  verified = true,
  normalizedValue: string | null = value.padStart(14, '0'),
) => ({ identifierType, value, normalizedValue, verified });

describe('product photo barcode selection', () => {
  it('uses the shortest valid retail form of a verified barcode', () => {
    expect(productImageGtin([id('upc_a', '012345678905')])).toBe('012345678905');
    expect(productImageGtin([id('ean_13', '4006381333931')])).toBe('4006381333931');
  });
  it('prefers a verified identifier and ignores internal or provider identifiers', () => {
    expect(
      productImageGtin([
        id('internal', '123'),
        id('provider', '4006381333931'),
        id('gtin', '4006381333931', false),
        id('upc_a', '012345678905', true),
      ]),
    ).toBe('012345678905');
  });
  it('never returns a barcode with a bad checksum, and never guesses from names', () => {
    expect(productImageGtin([id('upc_a', '012345678906')])).toBeNull();
    expect(productImageGtin([])).toBeNull();
    expect(productImageGtin(null)).toBeNull();
  });
});
