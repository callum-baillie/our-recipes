import { z } from 'zod';

import { brandIconIdSchema, DEFAULT_BRAND_ICON } from '@/lib/appearance';
import { DEFAULT_KITCHEN_NAME, legacyKitchenName } from '@/lib/brand';
import { profileCredentialsSchema } from '@/lib/domain/auth';
import { appRoleSchema } from '@/lib/domain/permissions';
import { defaultProfileGoalContext, profileGoalContextSchema } from '@/lib/domain/profile-goals';

const safeText = z.string().trim().min(1).max(80);

export const profileInputSchema = z.object({
  displayName: safeText,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a six-digit hex color.'),
  avatarUrl: z.union([z.literal(''), z.string().url().max(2_048)]).optional(),
  units: z.enum(['metric', 'imperial']),
  temperatureUnit: z.enum(['C', 'F']),
  locale: z.string().trim().min(2).max(35),
  timezone: z.string().trim().min(2).max(80),
  mainGoals: z.string().trim().max(2_000).optional(),
  goalContext: profileGoalContextSchema.optional(),
});

export const profileUpdateSchema = profileInputSchema;

const optionalDate = z.union([
  z.literal(''),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Choose a valid date.'),
]);
const optionalPositive = (maximum: number) =>
  z.union([z.null(), z.number().finite().positive().max(maximum)]);
const normalizedList = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .transform((values) => [
    ...new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values(),
  ]);

export type OnboardingMeasurementUnit = 'metric' | 'imperial';

function optionalMeasurementSegment(value: string): number | null {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function roundedMeasurement(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function onboardingHeightCentimeters(
  unit: OnboardingMeasurementUnit,
  primary: string,
  secondary = '',
): number | null {
  if (!primary.trim() && !secondary.trim()) return null;
  const major = optionalMeasurementSegment(primary);
  const minor = optionalMeasurementSegment(secondary);
  if (major === null || minor === null) return null;
  if (unit === 'metric') return major > 0 ? roundedMeasurement(major) : null;
  if (minor >= 12) return null;
  const totalInches = major * 12 + minor;
  return totalInches > 0 ? roundedMeasurement(totalInches * 2.54) : null;
}

export function onboardingWeightKilograms(
  unit: OnboardingMeasurementUnit,
  primary: string,
  secondary = '',
): number | null {
  if (!primary.trim() && !secondary.trim()) return null;
  const major = optionalMeasurementSegment(primary);
  const minor = optionalMeasurementSegment(secondary);
  if (major === null || minor === null) return null;
  const kilograms =
    unit === 'metric'
      ? minor < 1_000
        ? major + minor / 1_000
        : 0
      : minor < 16
        ? (major + minor / 16) / 2.2046226218
        : 0;
  return kilograms > 0 ? roundedMeasurement(kilograms) : null;
}

export const onboardingNutritionSchema = z
  .object({
    profileType: z.enum(['adult', 'dependent']).default('adult'),
    dateOfBirth: optionalDate.default(''),
    heightCentimeters: optionalPositive(300).default(null),
    currentWeightKilograms: optionalPositive(1_000).default(null),
    referenceSexCategory: z.enum(['female', 'male']).nullable().default(null),
    activityLevel: z
      .enum(['sedentary', 'light', 'moderate', 'active', 'very_active'])
      .nullable()
      .default(null),
    nutritionGoalType: z.enum(['none', 'maintain', 'gain', 'loss', 'custom']).default('none'),
    targetWeightKilograms: optionalPositive(1_000).default(null),
    targetDate: optionalDate.default(''),
    dietaryPreferences: normalizedList.default([]),
    foodAllergies: normalizedList.default([]),
    dietaryExclusions: normalizedList.default([]),
    weightTrackingEnabled: z.boolean().default(false),
    estimatedTargetsEnabled: z.boolean().default(false),
    estimatedTargetConsent: z.boolean().default(false),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.nutritionGoalType === 'gain' || value.nutritionGoalType === 'loss') &&
      value.targetWeightKilograms !== null
    ) {
      if (value.currentWeightKilograms === null) {
        context.addIssue({
          code: 'custom',
          path: ['currentWeightKilograms'],
          message: 'Enter a current weight before setting a weight target.',
        });
      } else if (
        (value.nutritionGoalType === 'loss' &&
          value.targetWeightKilograms >= value.currentWeightKilograms) ||
        (value.nutritionGoalType === 'gain' &&
          value.targetWeightKilograms <= value.currentWeightKilograms)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['targetWeightKilograms'],
          message:
            value.nutritionGoalType === 'loss'
              ? 'Choose a target below the current weight for a loss goal.'
              : 'Choose a target above the current weight for a gain goal.',
        });
      }
    }
    if (value.targetDate && value.targetWeightKilograms === null) {
      context.addIssue({
        code: 'custom',
        path: ['targetWeightKilograms'],
        message: 'Choose a target weight before adding a target date.',
      });
    }
    if (!value.estimatedTargetsEnabled) return;
    if (!value.estimatedTargetConsent) {
      context.addIssue({
        code: 'custom',
        path: ['estimatedTargetConsent'],
        message: 'Consent is required before estimating nutrition targets.',
      });
    }
    for (const field of [
      'dateOfBirth',
      'heightCentimeters',
      'currentWeightKilograms',
      'referenceSexCategory',
      'activityLevel',
    ] as const) {
      if (value[field] === '' || value[field] === null) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'This is required when nutrition estimates are enabled.',
        });
      }
    }
  });

export const profileOnboardingSchema = z
  .object({
    profile: profileInputSchema,
    nutrition: onboardingNutritionSchema,
    role: appRoleSchema.default('parent'),
  })
  .strict();

export const secureProfileOnboardingSchema = profileOnboardingSchema.extend({
  credentials: profileCredentialsSchema.optional(),
});

const canonicalSetupSchema = z
  .object({
    kitchenName: safeText.default(DEFAULT_KITCHEN_NAME),
    kitchenIcon: brandIconIdSchema.default(DEFAULT_BRAND_ICON),
    profile: profileInputSchema,
    credentials: profileCredentialsSchema.optional(),
    nutrition: onboardingNutritionSchema.optional(),
    additionalProfiles: secureProfileOnboardingSchema
      .array()
      .max(11, 'You can create up to 12 profiles during setup.')
      .default([]),
    firstRecipeChoice: z.enum(['example', 'ai', 'import', 'manual']).default('manual'),
  })
  .strict();

const legacySetupSchema = z
  .object({
    householdName: safeText,
    appName: safeText,
    brandIcon: brandIconIdSchema.optional(),
    profile: profileInputSchema,
    nutrition: onboardingNutritionSchema.optional(),
    additionalProfiles: profileOnboardingSchema
      .array()
      .max(11, 'You can create up to 12 profiles during setup.')
      .default([]),
  })
  .strict()
  .transform(({ householdName, appName, brandIcon, ...rest }) => ({
    ...rest,
    kitchenName: legacyKitchenName(appName, householdName),
    kitchenIcon: brandIcon ?? DEFAULT_BRAND_ICON,
    firstRecipeChoice: 'manual' as const,
  }));

export const setupSchema = z.union([canonicalSetupSchema, legacySetupSchema]);

const canonicalHouseholdSettingsSchema = z
  .object({ kitchenName: safeText, kitchenIcon: brandIconIdSchema })
  .strict();

const legacyHouseholdSettingsSchema = z
  .object({
    householdName: safeText,
    appName: safeText,
    brandIcon: brandIconIdSchema.optional(),
  })
  .strict()
  .transform(({ householdName, appName, brandIcon }) => ({
    kitchenName: legacyKitchenName(appName, householdName),
    kitchenIcon: brandIcon ?? DEFAULT_BRAND_ICON,
  }));

export const householdSettingsSchema = z.union([
  canonicalHouseholdSettingsSchema,
  legacyHouseholdSettingsSchema,
]);

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfileOnboardingInput = z.infer<typeof profileOnboardingSchema>;
export type SecureProfileOnboardingInput = z.infer<typeof secureProfileOnboardingSchema>;
export type SetupInput = z.input<typeof setupSchema>;
export type FirstRecipeChoice = 'example' | 'ai' | 'import' | 'manual';
export type OnboardingNutritionInput = z.infer<typeof onboardingNutritionSchema>;
export type HouseholdSettingsInput = z.input<typeof householdSettingsSchema>;

export const defaultProfileInput: ProfileInput = {
  displayName: '',
  color: '#A85032',
  avatarUrl: '',
  units: 'imperial',
  temperatureUnit: 'F',
  locale: 'en-US',
  timezone: 'UTC',
  mainGoals: '',
  goalContext: defaultProfileGoalContext,
};

export const defaultOnboardingNutrition: OnboardingNutritionInput = {
  profileType: 'adult',
  dateOfBirth: '',
  heightCentimeters: null,
  currentWeightKilograms: null,
  referenceSexCategory: null,
  activityLevel: null,
  nutritionGoalType: 'none',
  targetWeightKilograms: null,
  targetDate: '',
  dietaryPreferences: [],
  foodAllergies: [],
  dietaryExclusions: [],
  weightTrackingEnabled: false,
  estimatedTargetsEnabled: false,
  estimatedTargetConsent: false,
};
