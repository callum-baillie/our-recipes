import { z } from 'zod';

export const DECISION_TASKS = {
  aisles: {
    label: 'Organize shopping aisles',
    help: 'Place unassigned items in your selected store’s sections.',
  },
  pantry_input: {
    label: 'Match a pantry input',
    help: 'Find the right existing product for a loosely written item.',
  },
  ingredient_match: {
    label: 'Match recipe ingredients',
    help: 'Resolve unmapped ingredients without replacing saved mappings.',
  },
  pantry_review: {
    label: 'Check pantry freshness',
    help: 'Prioritize date and storage checks. Suggestions do not discard stock.',
  },
  nutrition_match: {
    label: 'Find missing nutrition',
    help: 'Choose a reference food using actual food-database results.',
  },
  meal_rank: {
    label: 'Choose meals',
    help: 'Rank saved recipes for your preferences, time and available food.',
  },
  insights: {
    label: 'Prioritize nutrition insights',
    help: 'Choose useful recommendations from recorded nutrition evidence.',
  },
  duplicates: {
    label: 'Review shopping duplicates',
    help: 'Distinguish equivalent items from different variants.',
  },
  recipe_review: {
    label: 'Review recipe quality',
    help: 'Flag unclear servings, missing details and possible recipe duplicates.',
  },
  substitutions: {
    label: 'Compare substitutions',
    help: 'Evaluate pantry alternatives for an ingredient in a selected recipe.',
  },
  clarification: {
    label: 'Clarify a food entry',
    help: 'Choose one useful question instead of a long form.',
  },
  cleanup: {
    label: 'Improve nutrition data',
    help: 'Prioritize incomplete recipe calculations that need attention.',
  },
  restock: {
    label: 'Review restocking',
    help: 'Prioritize stock checks before shopping; quantities stay calculated locally.',
  },
} as const;
export const decisionTaskSchema = z.enum(
  Object.keys(DECISION_TASKS) as [keyof typeof DECISION_TASKS, ...(keyof typeof DECISION_TASKS)[]],
);
export type DecisionTask = z.infer<typeof decisionTaskSchema>;
export const decisionRequestSchema = z
  .object({
    task: decisionTaskSchema,
    query: z.string().trim().max(2000).default(''),
    recipeId: z.string().uuid().optional(),
    listId: z.string().uuid().optional(),
    storeId: z.string().uuid().optional(),
    allowPaidCall: z.boolean().default(false),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export type DecisionOption = { value: string; label: string; description: string; href?: string };
export type DecisionEvidence = { label: string; source: string; value: unknown };
export type DecisionJob = {
  task: DecisionTask;
  subjectKey: string;
  title: string;
  instructions: string;
  evidence: DecisionEvidence[];
  options: DecisionOption[];
  href?: string;
  apply?:
    | { kind: 'aisle'; listId: string; itemId: string; storeId: string; item: string }
    | { kind: 'ingredient'; ingredientId: string; recipeId: string };
};
export type DecisionCard = DecisionJob & {
  id: string;
  version: number;
  choice: string;
  confidence: number | null;
  status: 'suggested' | 'unknown' | 'corrected' | 'dismissed';
  reason: string;
  cached: boolean;
  createdAt: string;
  evidenceChanged?: boolean;
  evidenceHash: string;
};
export const decisionFeedbackSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    action: z.enum(['correct', 'dismiss', 'reset', 'apply']),
    choice: z.string().max(200).optional(),
    note: z.string().trim().max(500).default(''),
    evidenceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
