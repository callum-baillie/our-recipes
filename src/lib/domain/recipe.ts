import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const optionalNutritionValue = z
  .union([z.literal(''), z.coerce.number().min(0).max(100_000)])
  .default('');

export const RECIPE_CATEGORY_OPTIONS = [
  'Breakfast',
  'Brunch',
  'Lunch',
  'Dinner',
  'Appetizer',
  'Snack',
  'Soup',
  'Salad',
  'Side dish',
  'Main dish',
  'Sauce',
  'Dessert',
  'Baking',
  'Drink',
] as const;

export const RECIPE_CUISINE_OPTIONS = [
  'American',
  'British',
  'Chinese',
  'French',
  'Greek',
  'Indian',
  'Italian',
  'Japanese',
  'Korean',
  'Mediterranean',
  'Mexican',
  'Middle Eastern',
  'Spanish',
  'Thai',
  'Vietnamese',
] as const;

export const MAX_RECIPE_TAXONOMY_VALUES = 8;
export const MAX_RECIPE_TAXONOMY_VALUE_LENGTH = 60;

export function normalizeRecipeTaxonomyValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim().replace(/\s+/gu, ' ').slice(0, MAX_RECIPE_TAXONOMY_VALUE_LENGTH);
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
  }
  return normalized.slice(0, MAX_RECIPE_TAXONOMY_VALUES);
}

export function parseRecipeTaxonomyValues(value: string | null | undefined): string[] {
  return normalizeRecipeTaxonomyValues((value ?? '').split(/[,;\n]/u));
}

export function joinRecipeTaxonomyValues(values: readonly string[]): string {
  return normalizeRecipeTaxonomyValues(values).join(', ');
}

const recipeTaxonomySchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) =>
      value
        .split(/[,;\n]/u)
        .map((item) => item.trim())
        .filter(Boolean).length <= MAX_RECIPE_TAXONOMY_VALUES,
    `Choose no more than ${MAX_RECIPE_TAXONOMY_VALUES} values.`,
  )
  .refine(
    (value) =>
      value
        .split(/[,;\n]/u)
        .map((item) => item.trim())
        .filter(Boolean)
        .every((item) => item.length <= MAX_RECIPE_TAXONOMY_VALUE_LENGTH),
    `Each value must be ${MAX_RECIPE_TAXONOMY_VALUE_LENGTH} characters or fewer.`,
  )
  .transform((value) => joinRecipeTaxonomyValues(parseRecipeTaxonomyValues(value)));
const recipeTagsSchema = z
  .array(requiredText(40))
  .max(20)
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLocaleLowerCase()))]);

export const recipeIngredientSchema = z.object({
  quantity: z.union([z.literal(''), z.coerce.number().positive().max(10_000)]),
  unit: boundedText(30),
  item: requiredText(160),
  note: boundedText(240),
});

export const recipeIngredientGroupSchema = z.object({
  name: boundedText(80),
  ingredients: z.array(recipeIngredientSchema).min(1).max(80),
});

export const recipeInstructionSectionSchema = z.object({
  title: boundedText(80),
  steps: z.array(requiredText(2_000)).min(1).max(80),
});

export const recipeInputSchema = z.object({
  title: requiredText(160),
  summary: boundedText(800),
  status: z.enum(['active', 'archived', 'trash']).default('active'),
  servings: requiredText(80),
  prepMinutes: z.coerce.number().int().min(0).max(10_080),
  cookMinutes: z.coerce.number().int().min(0).max(10_080),
  restMinutes: z.coerce.number().int().min(0).max(10_080).default(0),
  difficulty: boundedText(40).default(''),
  cuisine: recipeTaxonomySchema.default(''),
  category: recipeTaxonomySchema.default(''),
  tips: boundedText(2_000).default(''),
  sharedNotes: boundedText(2_000).default(''),
  sourceName: boundedText(160),
  sourceUrl: z.union([z.literal(''), z.string().trim().url().max(2_048)]),
  originalAuthor: boundedText(160).default(''),
  cookingMethod: boundedText(80).default(''),
  equipment: z
    .array(requiredText(120))
    .max(30)
    .transform((items) => [...new Set(items.map((item) => item.trim()))])
    .default([]),
  nutritionCalories: optionalNutritionValue,
  nutritionProteinGrams: optionalNutritionValue,
  nutritionCarbohydrateGrams: optionalNutritionValue,
  nutritionFatGrams: optionalNutritionValue,
  nutritionSaturatedFatGrams: optionalNutritionValue,
  nutritionFiberGrams: optionalNutritionValue,
  nutritionSugarGrams: optionalNutritionValue,
  nutritionSodiumMilligrams: optionalNutritionValue,
  tags: recipeTagsSchema,
  ingredientGroups: z.array(recipeIngredientGroupSchema).min(1).max(20),
  instructionSections: z.array(recipeInstructionSectionSchema).min(1).max(20),
});

export type RecipeInput = z.input<typeof recipeInputSchema>;
export type RecipePayload = z.output<typeof recipeInputSchema>;

export const recipeUpdateInputSchema = recipeInputSchema.extend({
  expectedRevision: z.coerce.number().int().positive(),
});

export const recipeTagsUpdateSchema = z
  .object({
    tags: recipeTagsSchema,
    expectedRevision: z.coerce.number().int().positive(),
  })
  .strict();

export const recipeStatusSchema = z.object({
  status: z.enum(['active', 'archived', 'trash']),
  expectedRevision: z.coerce.number().int().positive(),
});

export const recipeRevisionRestoreInputSchema = z.object({
  expectedRevision: z.coerce.number().int().positive(),
});

export const recipePreferenceInputSchema = z.object({
  rating: z.union([z.null(), z.coerce.number().int().min(1).max(5)]).default(null),
  note: boundedText(2_000).default(''),
});

export type RecipePreferenceInput = z.output<typeof recipePreferenceInputSchema>;

export const recipeLibraryQuerySchema = z.object({
  q: boundedText(160).default(''),
  creator: z.string().uuid().optional(),
  tag: boundedText(40)
    .transform((value) => value.toLocaleLowerCase())
    .optional(),
  collection: z.string().uuid().optional(),
  category: boundedText(80).optional(),
  cuisine: boundedText(80).optional(),
  maxTotalMinutes: z.coerce.number().int().min(1).max(30_240).optional(),
  favorite: z.enum(['true']).optional(),
  cooked: z.enum(['true']).optional(),
  status: z.enum(['active', 'archived', 'trash', 'all']).default('active'),
  sort: z
    .enum([
      'recently-added',
      'recently-updated',
      'alphabetical',
      'most-recently-cooked',
      'shortest-time',
      'highest-rated',
    ])
    .default('recently-updated'),
  page: z.coerce.number().int().min(1).default(1),
});

export type RecipeLibraryQuery = z.output<typeof recipeLibraryQuerySchema>;

export const emptyRecipeInput: RecipeInput = {
  title: '',
  summary: '',
  status: 'active',
  servings: '4 servings',
  prepMinutes: 10,
  cookMinutes: 25,
  restMinutes: 0,
  difficulty: '',
  cuisine: '',
  category: '',
  tips: '',
  sharedNotes: '',
  sourceName: '',
  sourceUrl: '',
  originalAuthor: '',
  cookingMethod: '',
  equipment: [],
  nutritionCalories: '',
  nutritionProteinGrams: '',
  nutritionCarbohydrateGrams: '',
  nutritionFatGrams: '',
  nutritionSaturatedFatGrams: '',
  nutritionFiberGrams: '',
  nutritionSugarGrams: '',
  nutritionSodiumMilligrams: '',
  tags: [],
  ingredientGroups: [
    {
      name: '',
      ingredients: [{ quantity: '', unit: '', item: '', note: '' }],
    },
  ],
  instructionSections: [{ title: '', steps: [''] }],
};
