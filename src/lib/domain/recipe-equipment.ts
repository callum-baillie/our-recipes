import { z } from 'zod';
import { measurementSchema, cavityLoadSchema } from './kitchen';
/** Portable generic requirements: household equipment IDs never belong to recipe content. */
export const recipeEquipmentRequirementSchema = z
  .object({
    capability: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9-]+$/),
    quantity: z.number().int().min(1).max(20).default(1),
    amount: measurementSchema.optional(),
    cavityLoad: cavityLoadSchema.optional(),
    vesselCapability: z.enum(['vessel', 'bakeware', 'pressure-vessel']).optional(),
    temperatureC: z.number().min(0).max(600).optional(),
    mode: z.string().trim().min(1).max(80).optional(),
    capacityReviewRequired: z.boolean().default(false),
    alternativeCapabilities: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
    steps: z
      .array(
        z
          .object({
            section: z.number().int().min(0).max(79),
            step: z.number().int().min(0).max(79),
          })
          .strict(),
      )
      .max(80),
  })
  .strict();
