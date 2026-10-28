import { normalizeGtin, retailGtin } from './food-data';

export type ProductIdentifier = {
  identifierType: string;
  value: string;
  normalizedValue: string | null;
  verified: boolean;
};

const RETAIL_TYPES = new Set(['upc_a', 'ean_13', 'gtin']);

/**
 * The exact barcode a product photo is matched on. Only a checksum-valid retail GTIN counts, and
 * a verified identifier wins over an unverified one. Names are never used to guess a photo.
 */
export function productImageGtin(
  identifiers: readonly ProductIdentifier[] | null | undefined,
): string | null {
  const candidates = [...(identifiers ?? [])]
    .filter((identifier) => RETAIL_TYPES.has(identifier.identifierType))
    .sort((a, b) => Number(b.verified) - Number(a.verified));
  for (const identifier of candidates) {
    try {
      return retailGtin(
        normalizeGtin(identifier.normalizedValue ?? identifier.value).canonicalGtin,
      );
    } catch {
      /* Try the next identifier. */
    }
  }
  return null;
}

export const productImagePath = (gtin: string) => `/api/v1/food-data/images/${gtin}`;

export const PRODUCT_PHOTO_CREDIT =
  'Product photos from Open Food Facts contributors, CC BY-SA 3.0. Resized and converted to JPEG.';
