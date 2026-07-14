import { describe, expect, it } from 'vitest';

import {
  ImportValidationError,
  assertImportFileBytes,
  assertImportSources,
  safeImportSourceName,
} from '@/lib/domain/import';

describe('document import boundaries', () => {
  it('derives accepted kinds from file bytes rather than names or declared MIME types', () => {
    expect(assertImportFileBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('pdf');
    expect(
      assertImportFileBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image');
    expect(
      assertImportFileBytes(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image');
    expect(() =>
      assertImportFileBytes(
        new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0]),
      ),
    ).toThrow(ImportValidationError);
    expect(() => assertImportFileBytes(new TextEncoder().encode('<svg onload=alert(1)>'))).toThrow(
      ImportValidationError,
    );
  });

  it('keeps source labels printable and never treats them as filesystem paths', () => {
    expect(safeImportSourceName('../../Grandma\u0000s: recipe?.pdf')).toBe('Grandma s recipe .pdf');
    expect(safeImportSourceName('')).toBe('Recipe import');
  });

  it('allows a bounded homogeneous image set but rejects mixed document sources', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(
      assertImportSources([
        { sourceName: 'front.png', bytes: png },
        { sourceName: 'back.png', bytes: png },
      ]),
    ).toBe('image');
    expect(() =>
      assertImportSources([
        { sourceName: 'recipe.pdf', bytes: pdf },
        { sourceName: 'scan.png', bytes: png },
      ]),
    ).toThrow(ImportValidationError);
  });
});
