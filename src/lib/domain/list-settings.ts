import { z } from 'zod';

import { shoppingItemIdentity } from '@/lib/domain/shopping-item-identity';

const boundedText = (maximum: number) => z.string().trim().max(maximum);

export const SHOPPING_CATEGORIES = [
  'Fresh produce',
  'Bakery',
  'Meat & seafood',
  'Deli & chilled',
  'Dairy & eggs',
  'Frozen',
  'Canned & jarred',
  'Dry goods & grains',
  'Baking',
  'Herbs & spices',
  'Sauces & condiments',
  'Snacks',
  'Drinks',
  'Household',
  'Other',
] as const;

export const shoppingCategorySchema = z.enum(SHOPPING_CATEGORIES);
export type ShoppingCategory = z.infer<typeof shoppingCategorySchema>;

export const DEFAULT_SUPERMARKET_SECTIONS = [
  {
    name: 'Fresh produce',
    matchTerms: [
      'fresh produce',
      'fruit',
      'vegetable',
      'vegetables',
      'berries',
      'potato',
      'celery',
      'onion',
      'garlic',
      'ginger',
      'tomato',
      'peach',
      'pear',
      'orange',
      'lemon',
      'lime',
      'leafy greens',
      'salad',
      'fresh herbs',
      'parsley',
      'cilantro',
      'coriander',
    ],
  },
  {
    name: 'Bakery',
    matchTerms: ['bakery', 'bread', 'rolls', 'buns', 'bagels', 'pita', 'tortilla', 'croissant'],
  },
  {
    name: 'Meat & seafood',
    matchTerms: [
      'meat',
      'seafood',
      'chicken',
      'turkey',
      'beef',
      'pork',
      'lamb',
      'sausage',
      'bacon',
      'fish',
      'salmon',
      'tuna',
      'shrimp',
      'prawn',
    ],
  },
  {
    name: 'Deli & chilled',
    matchTerms: ['deli', 'chilled', 'tofu', 'hummus', 'fresh pasta', 'prepared food'],
  },
  {
    name: 'Dairy & eggs',
    matchTerms: [
      'dairy',
      'eggs',
      'milk',
      'cheese',
      'cheddar',
      'mozzarella',
      'yogurt',
      'yoghurt',
      'butter',
      'cream',
      'half and half',
      'custard',
    ],
  },
  {
    name: 'Frozen',
    matchTerms: ['frozen', 'ice cream', 'frozen fruit', 'frozen vegetables'],
  },
  {
    name: 'Canned & jarred',
    matchTerms: [
      'canned',
      'tinned',
      'jarred',
      'beans',
      'chickpeas',
      'canned tomatoes',
      'crushed tomatoes',
      'diced tomatoes',
      'tomato paste',
      'coconut milk',
      'stock',
      'broth',
    ],
  },
  {
    name: 'Dry goods & grains',
    matchTerms: [
      'dry goods',
      'grains',
      'rice',
      'pasta',
      'noodles',
      'oats',
      'cereal',
      'granola',
      'lentils',
      'quinoa',
      'couscous',
      'seeds',
      'nuts',
      'pecans',
      'peanut butter',
    ],
  },
  {
    name: 'Baking',
    matchTerms: [
      'baking',
      'flour',
      'sugar',
      'baking powder',
      'baking soda',
      'yeast',
      'vanilla',
      'cocoa',
      'chocolate chips',
    ],
  },
  {
    name: 'Herbs & spices',
    matchTerms: [
      'herbs',
      'spices',
      'salt',
      'pepper',
      'oregano',
      'paprika',
      'cumin',
      'cinnamon',
      'chili powder',
      'seasoning',
    ],
  },
  {
    name: 'Sauces & condiments',
    matchTerms: [
      'sauces',
      'condiments',
      'olive oil',
      'cooking oil',
      'vinegar',
      'salsa',
      'mustard',
      'ketchup',
      'mayonnaise',
      'soy sauce',
      'hot sauce',
      'pesto',
      'honey',
      'maple syrup',
    ],
  },
  {
    name: 'Snacks',
    matchTerms: ['snacks', 'crisps', 'chips', 'crackers', 'popcorn', 'sweets', 'candy'],
  },
  {
    name: 'Drinks',
    matchTerms: ['drinks', 'beverages', 'coffee', 'tea', 'juice', 'soda', 'water', 'wine', 'beer'],
  },
  {
    name: 'Household',
    matchTerms: [
      'household',
      'cleaning',
      'paper towels',
      'toilet paper',
      'dish soap',
      'foil',
      'baking paper',
      'trash bags',
    ],
  },
] as const;

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
  if (` ${normalizedValue} `.includes(` ${normalizedTerm} `)) return true;
  const identityValue = shoppingItemIdentity(normalizedValue);
  const identityTerm = shoppingItemIdentity(normalizedTerm);
  return Boolean(
    identityValue && identityTerm && ` ${identityValue} `.includes(` ${identityTerm} `),
  );
}

export function inferShoppingCategory(value: string): ShoppingCategory {
  const matches = DEFAULT_SUPERMARKET_SECTIONS.flatMap((section, position) =>
    [section.name, ...section.matchTerms].flatMap((term) =>
      shoppingTextMatchesTerm(value, term)
        ? [{ category: section.name as ShoppingCategory, specificity: term.length, position }]
        : [],
    ),
  );
  matches.sort(
    (left, right) => right.specificity - left.specificity || left.position - right.position,
  );
  return matches[0]?.category ?? 'Other';
}
