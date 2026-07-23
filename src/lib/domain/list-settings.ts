import { z } from 'zod';

const boundedText = (maximum: number) => z.string().trim().max(maximum);

export const completedItemsBehaviorSchema = z.enum(['completed_section', 'hide', 'in_place']);

export const listSettingsInputSchema = z
  .object({
    defaultSupermarketProfileId: z.union([z.literal(''), z.string().uuid()]).default(''),
    completedItemsBehavior: completedItemsBehaviorSchema,
    openPantryPurchaseOnCheck: z.boolean(),
    keepScreenAwake: z.boolean(),
  })
  .strict();

export const supermarketRouteSectionSchema = z
  .object({
    aisleId: z.union([z.literal(''), z.string().uuid()]).default(''),
    name: z.string().trim().min(1).max(80),
    matchTerms: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  })
  .strict();

export const supermarketProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    locationLabel: boundedText(120).default(''),
    notes: boundedText(500).default(''),
    sections: z.array(supermarketRouteSectionSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const names = value.sections.map((section) => normalizeShoppingMatchText(section.name));
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: 'custom',
        path: ['sections'],
        message: 'Use each section name once per supermarket.',
      });
    }
  });

export const supermarketProfileUpdateSchema = supermarketProfileInputSchema.extend({
  archived: z.boolean().default(false),
});

export const shoppingListSupermarketSchema = z
  .object({
    supermarketProfileId: z.union([z.literal(''), z.string().uuid()]),
  })
  .strict();

export type CompletedItemsBehavior = z.output<typeof completedItemsBehaviorSchema>;
export type ListSettingsInput = z.output<typeof listSettingsInputSchema>;
export type SupermarketProfileInput = z.output<typeof supermarketProfileInputSchema>;
export type SupermarketProfileUpdateInput = z.output<typeof supermarketProfileUpdateSchema>;

export function normalizeShoppingMatchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function shoppingTextMatchesTerm(value: string, term: string): boolean {
  const normalizedValue = normalizeShoppingMatchText(value);
  const normalizedTerm = normalizeShoppingMatchText(term);
  if (!normalizedValue || !normalizedTerm) return false;
  return ` ${normalizedValue} `.includes(` ${normalizedTerm} `);
}
