import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const boundedText = (max: number) => z.string().trim().max(max);

export const collectionInputSchema = z.object({
  name: requiredText(80),
  description: boundedText(800).default(''),
  coverImageId: z.union([z.literal(''), z.string().uuid()]).default(''),
});

export const collectionOrderSchema = z.object({
  collectionIds: z.array(z.string().uuid()).min(1).max(200),
});

export const collectionRecipesSchema = z.object({
  recipeIds: z.array(z.string().uuid()).max(2_000),
});

export type CollectionInput = z.output<typeof collectionInputSchema>;
