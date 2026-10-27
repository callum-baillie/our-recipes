import { describe, expect, it } from 'vitest';
import { expandScannedBarcode } from '../../shared/retail-barcode';
import { normalizeGtin } from '@/lib/domain/food-data';

describe('retail scanner identities', () => {
  // GS1 General Specifications 24.0, section 5.2.2.4: all four zero-suppression rules.
  it.each([
    ['01234558', '012345000058'],
    ['04567840', '045670000080'],
    ['03456703', '034000005673'],
    ['09847531', '098400000751'],
  ])('expands UPC-E %s to its UPC-A product identity', (compressed, expanded) => {
    expect(expandScannedBarcode(compressed, 'upc_e')).toBe(expanded);
    expect(normalizeGtin(expandScannedBarcode(compressed, 'upc_e')).canonicalGtin).toBe(
      expanded.padStart(14, '0'),
    );
  });
  it('keeps an eight-digit EAN distinct, even when the digits also form a UPC-E', () => {
    expect(expandScannedBarcode('01234558', 'ean_8')).toBe('01234558');
    expect(expandScannedBarcode('01234558', 'ean8')).toBe('01234558');
    expect(expandScannedBarcode('012345000058', 'upc_a')).toBe('012345000058');
  });
  it.each(['01234559', '23456789', '123455', '01234X58'])(
    'rejects incomplete/invalid UPC-E %s',
    (code) => {
      expect(() => expandScannedBarcode(code, 'upc_e')).toThrow();
    },
  );
});
