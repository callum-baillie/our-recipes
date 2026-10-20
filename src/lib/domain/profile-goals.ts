import { z } from 'zod';

export const profileGoalFocusValues = [
  'feel-healthier',
  'weight-goals',
  'organized-meals',
  'easier-groceries',
  'understand-nutrition',
  'cook-more',
  'discover-recipes',
  'reduce-food-waste',
  'save-money',
  'support-dietary-needs',
] as const;

export const profileGoalFocusSchema = z.enum(profileGoalFocusValues);
export type ProfileGoalFocus = z.infer<typeof profileGoalFocusSchema>;

export const kitchenInterviewSchema = z
  .object({
    taste: z.string().trim().max(500),
    snacks: z.string().trim().max(800),
    desserts: z.string().trim().max(800),
    routine: z.string().trim().max(800),
    favorites: z.string().trim().max(800),
    avoid: z.string().trim().max(800),
  })
  .strict();
export const kitchenContextUpdateSchema = z
  .object({
    interview: kitchenInterviewSchema,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
/** Adaptive interviews update stated facts only; clearing an answer is deliberate. */
export const kitchenContextPatchSchema = z
  .object({
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    interviewPatch: kitchenInterviewSchema
      .partial()
      .refine(
        (values) => Object.values(values).every((value) => value.length > 0),
        'Use clearFields to deliberately remove an answer.',
      ),
    clearFields: z.array(kitchenInterviewSchema.keyof()).max(6).default([]),
  })
  .strict()
  .superRefine((input, context) => {
    if (!Object.keys(input.interviewPatch).length && !input.clearFields.length)
      context.addIssue({
        code: 'custom',
        message: 'Include a stated answer or an explicit field to clear.',
      });
    if (input.clearFields.some((key) => key in input.interviewPatch))
      context.addIssue({
        code: 'custom',
        path: ['clearFields'],
        message: 'An answer cannot be updated and cleared together.',
      });
  });

export const profileGoalContextSchema = z
  .object({
    kitchenInterview: kitchenInterviewSchema.optional(),
    focusAreas: z
      .array(profileGoalFocusSchema)
      .max(8)
      .refine((values) => new Set(values).size === values.length, 'Choose each outcome once.')
      .default([]),
    motivation: z.string().trim().max(800).default(''),
    challenges: z.string().trim().max(800).default(''),
    successVision: z.string().trim().max(800).default(''),
  })
  .strict();

export type ProfileGoalContext = z.infer<typeof profileGoalContextSchema>;

export const defaultProfileGoalContext: ProfileGoalContext = {
  focusAreas: [],
  motivation: '',
  challenges: '',
  successVision: '',
};

export const profileGoalFocusOptions: ReadonlyArray<{
  value: ProfileGoalFocus;
  label: string;
  description: string;
}> = [
  {
    value: 'feel-healthier',
    label: 'Feel healthier',
    description: 'Build everyday habits that leave me feeling better.',
  },
  {
    value: 'weight-goals',
    label: 'Reach a weight goal',
    description: 'Lose, gain, or maintain weight with more intention.',
  },
  {
    value: 'organized-meals',
    label: 'Feel organized at mealtime',
    description: 'Know what is for dinner before the day gets busy.',
  },
  {
    value: 'easier-groceries',
    label: 'Make grocery runs easier',
    description: 'Shop with a useful list and fewer forgotten items.',
  },
  {
    value: 'understand-nutrition',
    label: 'Understand my nutrition',
    description: 'See patterns without turning every meal into homework.',
  },
  {
    value: 'cook-more',
    label: 'Cook at home more',
    description: 'Make home cooking fit more naturally into my week.',
  },
  {
    value: 'discover-recipes',
    label: 'Find recipes I actually love',
    description: 'Build a collection that suits my tastes and routine.',
  },
  {
    value: 'reduce-food-waste',
    label: 'Waste less food',
    description: 'Use what I already have before it is forgotten.',
  },
  {
    value: 'save-money',
    label: 'Spend less on food',
    description: 'Plan and shop in a way that respects my budget.',
  },
  {
    value: 'support-dietary-needs',
    label: 'Support dietary needs',
    description: 'Make restrictions and preferences easier to live with.',
  },
];

export function hasProfileGoalContext(
  context: ProfileGoalContext | null | undefined,
  additionalNotes = '',
): boolean {
  return Boolean(
    context?.focusAreas.length ||
    context?.motivation.trim() ||
    context?.challenges.trim() ||
    context?.successVision.trim() ||
    additionalNotes.trim(),
  );
}

export function summarizeProfileGoals(
  context: ProfileGoalContext | null | undefined,
  additionalNotes = '',
): string {
  const labels = (context?.focusAreas ?? [])
    .map((focus) => profileGoalFocusOptions.find((option) => option.value === focus)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length) {
    const visible = labels.slice(0, 3).join(', ');
    return labels.length > 3 ? `${visible} +${labels.length - 3} more` : visible;
  }
  return (
    context?.successVision.trim() ||
    context?.motivation.trim() ||
    additionalNotes.trim() ||
    'No personal goals added'
  );
}
