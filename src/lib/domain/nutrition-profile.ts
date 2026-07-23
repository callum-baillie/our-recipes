import { z } from 'zod';

import { NUTRIENT_CODES } from '@/lib/domain/nutrition';

export const DEFAULT_NUTRITION_VISIBLE_NUTRIENTS = [
  'fiber',
  'calcium',
  'iron',
  'potassium',
  'vitamin_d',
  'sodium',
  'added_sugars',
  'saturated_fat',
] as const;

export const NUTRITION_CARD_NUTRIENT_CODES = [
  'energy_kcal',
  'protein',
  'carbohydrate',
  'total_fat',
  'fiber',
  'sodium',
] as const;

export const DEFAULT_NUTRITION_CARD_NUTRIENTS = ['energy_kcal', 'protein', 'fiber'] as const;

export const nutritionVisibleNutrientCodesSchema = z
  .array(z.enum(NUTRIENT_CODES))
  .min(1)
  .max(12)
  .transform((values) => [...new Set(values)]);

export const nutritionCardNutrientCodesSchema = z
  .array(z.enum(NUTRITION_CARD_NUTRIENT_CODES))
  .min(1)
  .max(5)
  .refine((values) => new Set(values).size === values.length, {
    message: 'Compact card nutrients must be unique.',
  });

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use a YYYY-MM-DD date.');
const nullableIsoDate = z.union([z.null(), isoDateSchema]);
const nullableUuid = z.union([z.null(), uuidSchema]);
const nullableReferenceId = z.union([z.null(), z.string().trim().min(1).max(200)]);
const nullablePositive = (maximum: number) =>
  z.union([z.null(), z.number().finite().positive().max(maximum)]);
const boundedText = (maximum: number) => z.string().trim().max(maximum);
const normalizedList = z
  .array(z.string().trim().min(1).max(120))
  .max(100)
  .transform((values) => {
    const seen = new Set<string>();
    return values.filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

const nutritionProfileSettingsShape = {
  dateOfBirth: nullableIsoDate.default(null),
  heightCentimeters: nullablePositive(300).default(null),
  currentWeightKilograms: nullablePositive(1_000).default(null),
  measurementSystem: z.enum(['metric', 'imperial']).default('metric'),
  referenceSexCategory: z.enum(['female', 'male']).nullable().default(null),
  activityLevel: z
    .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
    .nullable()
    .default(null),
  nutritionGoalType: z.enum(['none', 'maintain', 'gain', 'loss', 'custom']).default('none'),
  targetWeightKilograms: nullablePositive(1_000).default(null),
  targetDate: nullableIsoDate.default(null),
  explicitlyEnteredLifeStage: z.enum(['pregnant', 'breastfeeding']).nullable().default(null),
  dietaryPreferences: normalizedList.default([]),
  foodAllergies: normalizedList.default([]),
  dietaryExclusions: normalizedList.default([]),
  estimatedTargetsEnabled: z.boolean().default(false),
  estimatedTargetConsent: z.boolean().default(false),
  weightTrackingEnabled: z.boolean().default(false),
  preferredEnergyUnit: z.enum(['kcal', 'kJ']).default('kcal'),
  dailyResetTimezone: z.string().trim().min(1).max(100).default('UTC'),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
  referenceJurisdiction: z.string().trim().min(2).max(20).default('US'),
  visibleNutrientCodes: nutritionVisibleNutrientCodesSchema.default([
    ...DEFAULT_NUTRITION_VISIBLE_NUTRIENTS,
  ]),
  trendRangeDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(7),
  showPlannedNutrition: z.boolean().default(true),
  showRecipeCardNutrition: z.boolean().default(true),
  recipeCardNutrientCodes: nutritionCardNutrientCodesSchema.default([
    ...DEFAULT_NUTRITION_CARD_NUTRIENTS,
  ]),
  showMealPlanNutrition: z.boolean().default(true),
} as const;

function validateEstimatedTargetInputs(
  value: {
    estimatedTargetsEnabled: boolean;
    estimatedTargetConsent: boolean;
    dateOfBirth: string | null;
    heightCentimeters: number | null;
    currentWeightKilograms: number | null;
    referenceSexCategory: 'female' | 'male' | null;
    activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active' | null;
  },
  context: z.RefinementCtx,
) {
  if (!value.estimatedTargetsEnabled) return;
  if (!value.estimatedTargetConsent) {
    context.addIssue({
      code: 'custom',
      path: ['estimatedTargetConsent'],
      message: 'Explicit consent is required before estimating nutrition targets.',
    });
  }
  const required = [
    'dateOfBirth',
    'heightCentimeters',
    'currentWeightKilograms',
    'referenceSexCategory',
    'activityLevel',
  ] as const;
  for (const field of required) {
    if (value[field] === null) {
      context.addIssue({
        code: 'custom',
        path: [field],
        message: 'This field is required only for the selected estimated-target formula.',
      });
    }
  }
}

export const nutritionProfileSettingsInputSchema = z
  .object(nutritionProfileSettingsShape)
  .strict()
  .superRefine(validateEstimatedTargetInputs);

export const nutritionProfileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(100),
    avatarUrl: z.union([z.literal(''), z.string().trim().url().max(2_048)]).default(''),
    linkedHouseholdProfileId: nullableUuid.default(null),
    profileType: z.enum(['adult', 'dependent', 'guest', 'unassigned']).default('adult'),
    ...nutritionProfileSettingsShape,
    comparisonVisibility: z.enum(['hidden', 'named', 'anonymized']).default('hidden'),
    diaryVisibility: z.enum(['private', 'authorized']).default('private'),
  })
  .superRefine(validateEstimatedTargetInputs);

export type NutritionProfileInput = z.output<typeof nutritionProfileInputSchema>;
export type NutritionProfileSettingsInput = z.output<typeof nutritionProfileSettingsInputSchema>;

const goalBaseSchema = z.object({
  id: uuidSchema.optional(),
  nutrientCode: z.enum(NUTRIENT_CODES),
  unit: z.string().trim().min(1).max(30),
  sourceType: z.enum(['user_defined', 'clinician_defined', 'reference']),
  sourceReferenceId: nullableReferenceId.default(null),
  startsOn: isoDateSchema,
  endsOn: nullableIsoDate.default(null),
  state: z.enum(['active', 'paused', 'archived']).default('active'),
  note: boundedText(500).default(''),
});

const positiveGoalValue = z.number().finite().positive().max(1_000_000);

export const nutritionGoalVersionInputSchema = z
  .discriminatedUnion('kind', [
    goalBaseSchema.extend({ kind: z.literal('target'), value: positiveGoalValue }),
    goalBaseSchema.extend({ kind: z.literal('minimum'), value: positiveGoalValue }),
    goalBaseSchema.extend({
      kind: z.literal('range'),
      minimum: positiveGoalValue,
      maximum: positiveGoalValue,
    }),
    goalBaseSchema.extend({ kind: z.literal('limit'), maximum: positiveGoalValue }),
  ])
  .superRefine((value, context) => {
    if (value.endsOn !== null && value.endsOn < value.startsOn) {
      context.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: 'Goal end date cannot be before its start date.',
      });
    }
    if (value.kind === 'range' && value.maximum < value.minimum) {
      context.addIssue({
        code: 'custom',
        path: ['maximum'],
        message: 'Range maximum must be at least its minimum.',
      });
    }
    if (value.sourceType === 'reference' && value.sourceReferenceId === null) {
      context.addIssue({
        code: 'custom',
        path: ['sourceReferenceId'],
        message: 'Reference-derived goals must retain their reference row.',
      });
    }
  });

export type NutritionGoalVersionInput = z.input<typeof nutritionGoalVersionInputSchema>;

export const bodyMeasurementInputSchema = z.object({
  measuredAt: z.string().datetime({ offset: true }),
  weightKilograms: z.number().finite().positive().max(1_000),
  sourceType: z.enum(['manual', 'imported']).default('manual'),
  approximate: z.boolean().default(false),
  note: boundedText(500).default(''),
});

export type BodyMeasurementInput = z.input<typeof bodyMeasurementInputSchema>;

export const NUTRITION_ACCESS_ACTIONS = [
  'view_diary',
  'view_measurements',
  'manage_profile',
  'manage_goals',
  'view_comparison',
  'export_data',
  'delete_data',
] as const;

export type NutritionAccessAction = (typeof NUTRITION_ACCESS_ACTIONS)[number];

export type NutritionPermissionGrant = {
  principalId: string;
  role: 'guardian' | 'viewer';
  canViewDiary: boolean;
  canViewMeasurements: boolean;
  canManageProfile: boolean;
  canManageGoals: boolean;
  canViewComparison: boolean;
  canExportData: boolean;
  canDeleteData: boolean;
  expiresAt: Date | null;
};

export type NutritionProfileAccessDescriptor = {
  ownerPrincipalId: string;
  comparisonVisibility: 'hidden' | 'named' | 'anonymized';
};

export type NutritionAuthorizationDecision = {
  allowed: boolean;
  disclosure: 'none' | 'full' | 'anonymized';
  reason: 'owner' | 'guardian' | 'explicit_grant' | 'expired_grant' | 'not_granted';
};

const ACTION_FLAG: Record<NutritionAccessAction, keyof NutritionPermissionGrant> = {
  view_diary: 'canViewDiary',
  view_measurements: 'canViewMeasurements',
  manage_profile: 'canManageProfile',
  manage_goals: 'canManageGoals',
  view_comparison: 'canViewComparison',
  export_data: 'canExportData',
  delete_data: 'canDeleteData',
};

export function authorizeNutritionProfileAccess(input: {
  requesterPrincipalId: string;
  profile: NutritionProfileAccessDescriptor;
  action: NutritionAccessAction;
  grants: readonly NutritionPermissionGrant[];
  now?: Date;
}): NutritionAuthorizationDecision {
  if (input.requesterPrincipalId === input.profile.ownerPrincipalId) {
    return { allowed: true, disclosure: 'full', reason: 'owner' };
  }
  const grant = input.grants.find(
    (candidate) => candidate.principalId === input.requesterPrincipalId,
  );
  if (!grant) return { allowed: false, disclosure: 'none', reason: 'not_granted' };
  const now = input.now ?? new Date();
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) {
    return { allowed: false, disclosure: 'none', reason: 'expired_grant' };
  }
  if (grant.role === 'guardian') {
    return {
      allowed: true,
      disclosure:
        input.action === 'view_comparison' && input.profile.comparisonVisibility === 'anonymized'
          ? 'anonymized'
          : 'full',
      reason: 'guardian',
    };
  }
  const allowed = Boolean(grant[ACTION_FLAG[input.action]]);
  if (!allowed) return { allowed: false, disclosure: 'none', reason: 'not_granted' };
  return {
    allowed: true,
    disclosure:
      input.action === 'view_comparison' && input.profile.comparisonVisibility === 'anonymized'
        ? 'anonymized'
        : 'full',
    reason: 'explicit_grant',
  };
}
