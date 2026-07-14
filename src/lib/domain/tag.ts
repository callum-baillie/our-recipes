import { z } from 'zod';

export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) => value.toLocaleLowerCase());
const tagColor = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/)]);

export const createTagSchema = z.object({ name: tagNameSchema, color: tagColor.default('') });
export const updateTagSchema = z.object({ name: tagNameSchema, color: tagColor.default('') });
export const mergeTagSchema = z.object({
  targetName: tagNameSchema,
  targetColor: tagColor.default(''),
});
export type TagInput = z.output<typeof createTagSchema>;
