import { z } from 'zod';

const boundedText = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => boundedText(max).min(1);
const optionalNutritionValue = z
  .union([z.literal(''), z.coerce.number().min(0).max(100_000)])
  .default('');

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
  cuisine: boundedText(80).default(''),
  category: boundedText(80).default(''),
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
  nutritionFiberGrams: optionalNutritionValue,
  tags: z
    .array(requiredText(40))
    .max(20)
    .transform((tags) => [...new Set(tags.map((tag) => tag.toLocaleLowerCase()))]),
  ingredientGroups: z.array(recipeIngredientGroupSchema).min(1).max(20),
  instructionSections: z.array(recipeInstructionSectionSchema).min(1).max(20),
});

export type RecipeInput = z.input<typeof recipeInputSchema>;
export type RecipePayload = z.output<typeof recipeInputSchema>;

export const recipeUpdateInputSchema = recipeInputSchema.extend({
  expectedRevision: z.coerce.number().int().positive(),
});

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
  nutritionFiberGrams: '',
  tags: [],
  ingredientGroups: [
    {
      name: '',
      ingredients: [{ quantity: '', unit: '', item: '', note: '' }],
    },
  ],
  instructionSections: [{ title: '', steps: [''] }],
};
