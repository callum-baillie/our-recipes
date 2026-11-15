import { z } from 'zod';
export const shoppingTripSchema = z
  .object({
    occurredOn: z.iso
      .date()
      .refine(
        (day) => day <= new Date().toISOString().slice(0, 10),
        'A completed trip cannot be in the future.',
      ),
    size: z.enum(['top_up', 'large']),
    note: z.string().trim().max(500).default(''),
  })
  .strict();
