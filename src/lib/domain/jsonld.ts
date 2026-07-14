import { z } from 'zod';

export const MAX_JSONLD_SOURCE_BYTES = 1_000_000;
export const MAX_JSONLD_CANDIDATES = 20;

export const jsonLdDraftRequestSchema = z.object({
  source: z.string().trim().min(2).max(MAX_JSONLD_SOURCE_BYTES),
  candidateIndex: z
    .number()
    .int()
    .min(0)
    .max(MAX_JSONLD_CANDIDATES - 1)
    .optional(),
});

export const jsonLdConfirmationSchema = z.object({
  recipe: z.unknown(),
});

export class JsonLdValidationError extends Error {
  constructor(
    readonly code:
      | 'invalid_jsonld'
      | 'source_too_large'
      | 'no_recipe_candidates'
      | 'candidate_not_found'
      | 'invalid_recipe_candidate',
    message: string,
  ) {
    super(message);
  }
}
