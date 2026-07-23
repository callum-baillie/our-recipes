import { z } from 'zod';

export const PORTABLE_RECIPE_EXPORT_FORMAT = 'bord-portable-recipe-export';
export const LEGACY_PORTABLE_RECIPE_EXPORT_FORMAT = 'our-recipes-portable-recipe-export';
export const PORTABLE_RECIPE_EXPORT_VERSION = 1;
export const MAX_PORTABLE_RECIPE_EXPORT_RECIPES = 10_000;
export const MAX_PORTABLE_RECIPE_EXPORT_IMAGES = 50_000;
export const MAX_PORTABLE_RECIPE_EXPORT_BYTES = 1024 * 1024 * 1024;
export const MAX_PORTABLE_RECIPE_EXPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PORTABLE_RECIPE_EXPORT_MANIFEST_BYTES = 16 * 1024 * 1024;

const archivePathSchema = z
  .string()
  .regex(/^(?:recipes\/\d{5}\.jsonld|images\/[a-f0-9]{64}\.webp)$/u);

export const portableRecipeExportManifestSchema = z.object({
  format: z.union([
    z.literal(PORTABLE_RECIPE_EXPORT_FORMAT),
    z.literal(LEGACY_PORTABLE_RECIPE_EXPORT_FORMAT),
  ]),
  version: z.literal(PORTABLE_RECIPE_EXPORT_VERSION),
  snapshotAt: z.string().datetime({ offset: true }),
  recipeCount: z.number().int().min(0).max(MAX_PORTABLE_RECIPE_EXPORT_RECIPES),
  imageCount: z.number().int().min(0).max(MAX_PORTABLE_RECIPE_EXPORT_IMAGES),
  files: z
    .array(
      z.object({
        path: archivePathSchema,
        mediaType: z.enum(['application/ld+json', 'image/webp']),
        bytes: z.number().int().min(1).max(MAX_PORTABLE_RECIPE_EXPORT_FILE_BYTES),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .max(MAX_PORTABLE_RECIPE_EXPORT_RECIPES + MAX_PORTABLE_RECIPE_EXPORT_IMAGES),
  recipes: z
    .array(
      z.object({
        document: z.string().regex(/^recipes\/\d{5}\.jsonld$/u),
        images: z.array(z.string().regex(/^images\/[a-f0-9]{64}\.webp$/u)),
      }),
    )
    .max(MAX_PORTABLE_RECIPE_EXPORT_RECIPES),
});

export type PortableRecipeExportManifest = z.infer<typeof portableRecipeExportManifestSchema>;

export class PortableRecipeExportError extends Error {}
