import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  defaultProfileInput,
  householdSettingsSchema,
  onboardingHeightCentimeters,
  onboardingWeightKilograms,
  profileOnboardingSchema,
  setupSchema,
} from '@/lib/domain/setup';

const validSetup = {
  householdName: 'The Brooks kitchen',
  appName: 'Our Recipes',
  profile: {
    displayName: 'Callum',
    color: '#A85032',
    avatarUrl: '',
    units: 'metric' as const,
    temperatureUnit: 'C' as const,
    locale: 'en-US',
    timezone: 'America/Los_Angeles',
  },
};

describe('setupSchema', () => {
  it('uses one customizable kitchen identity alongside the fixed Bòrd introduction', () => {
    const source = readFileSync('src/components/onboarding-wizard.tsx', 'utf8');
    const setupSource = readFileSync('src/components/setup-wizard.tsx', 'utf8');
    expect(source).toContain('<span>Kitchen name</span>');
    expect(source).toContain('kitchenName,');
    expect(source).toContain('kitchenIcon: brandIcon');
    expect(source).not.toContain('<span>App name</span>');
    expect(source).not.toContain('<span>Household name</span>');
    expect(source).not.toContain('onKitchenNamePreviewChange');
    expect(source).not.toContain('onBrandIconPreviewChange');
    expect(setupSource).toContain('<BordLockup className="onboarding-brand-lockup" />');
    expect(setupSource).toContain('<dt>bòrd</dt>');
    expect(setupSource).toContain('<dd>Scottish Gaelic</dd>');
    expect(setupSource).toContain('<dd>Table</dd>');
    expect(setupSource).toContain('A communal area where kin unite to eat and end the day.');
  });

  it('accepts a complete household and first profile', () => {
    expect(setupSchema.safeParse(validSetup).success).toBe(true);
    expect(
      setupSchema.safeParse({
        kitchenName: 'The Brooks kitchen',
        kitchenIcon: 'table',
        profile: validSetup.profile,
      }).success,
    ).toBe(true);
  });

  it('accepts additional onboarded profiles and caps the setup roster', () => {
    const additionalProfile = {
      profile: { ...validSetup.profile, displayName: 'Avery' },
      nutrition: { profileType: 'guest' as const },
    };
    expect(
      setupSchema.safeParse({ ...validSetup, additionalProfiles: [additionalProfile] }).success,
    ).toBe(true);
    expect(
      setupSchema.safeParse({
        ...validSetup,
        additionalProfiles: Array.from({ length: 12 }, (_, index) => ({
          ...additionalProfile,
          profile: { ...additionalProfile.profile, displayName: `Guest ${index + 1}` },
        })),
      }).success,
    ).toBe(false);
  });

  it('uses US onboarding defaults and derives hidden regional settings from the browser', () => {
    const source = readFileSync('src/components/onboarding-wizard.tsx', 'utf8');
    const settingsSource = readFileSync('src/components/profile-settings.tsx', 'utf8');
    expect(defaultProfileInput).toMatchObject({ units: 'imperial', temperatureUnit: 'F' });
    expect(source).toContain('navigator.language');
    expect(source).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
    expect(source).not.toContain('<span>Avatar URL');
    expect(source).not.toContain('<span>Locale</span>');
    expect(source).not.toContain('<span>Time zone</span>');
    expect(settingsSource).toContain('Avatar URL');
    expect(settingsSource).toContain('<span>Locale</span>');
    expect(settingsSource).toContain('<span>Time zone</span>');
  });

  it('accepts profile-only onboarding with personal goals and optional nutrition details', () => {
    expect(
      profileOnboardingSchema.safeParse({
        profile: {
          ...validSetup.profile,
          mainGoals: 'Plan easier dinners and reduce food waste.',
          goalContext: {
            focusAreas: ['feel-healthier', 'organized-meals', 'reduce-food-waste'],
            motivation: 'I want food to support my energy instead of becoming another chore.',
            challenges: 'Busy evenings make it hard to decide what to cook.',
            successVision: 'Weeknight dinners feel calm and groceries get used on time.',
          },
        },
        nutrition: {
          profileType: 'adult',
          dateOfBirth: '1990-06-15',
          heightCentimeters: 172,
          currentWeightKilograms: 70,
          referenceSexCategory: null,
          activityLevel: 'moderate',
          nutritionGoalType: 'maintain',
          dietaryPreferences: ['Vegetarian', 'vegetarian'],
          foodAllergies: ['Peanuts'],
          dietaryExclusions: [],
          weightTrackingEnabled: true,
          estimatedTargetsEnabled: false,
          estimatedTargetConsent: false,
        },
      }).success,
    ).toBe(true);
  });

  it('bounds structured profile reflections and rejects unknown goal types', () => {
    expect(
      setupSchema.safeParse({
        ...validSetup,
        profile: {
          ...validSetup.profile,
          goalContext: {
            focusAreas: ['easier-groceries', 'understand-nutrition'],
            motivation: 'Make daily choices feel simpler.',
            challenges: '',
            successVision: 'I shop with confidence and understand my usual meals.',
          },
        },
      }).success,
    ).toBe(true);
    expect(
      setupSchema.safeParse({
        ...validSetup,
        profile: {
          ...validSetup.profile,
          goalContext: {
            focusAreas: ['be-perfect'],
            motivation: '',
            challenges: '',
            successVision: '',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('converts segmented onboarding measurements to canonical units', () => {
    expect(onboardingHeightCentimeters('imperial', '5', '10')).toBe(177.8);
    expect(onboardingHeightCentimeters('metric', '177.8')).toBe(177.8);
    expect(onboardingWeightKilograms('imperial', '150', '8')).toBe(68.2657);
    expect(onboardingWeightKilograms('metric', '68', '250')).toBe(68.25);
    expect(onboardingHeightCentimeters('imperial', '5', '12')).toBeNull();
    expect(onboardingWeightKilograms('imperial', '150', '16')).toBeNull();
  });

  it('uses descriptive Nutrition choices, autocomplete fields, and switches during onboarding', () => {
    const source = readFileSync('src/components/onboarding-wizard.tsx', 'utf8');
    expect(source).toContain('<h2>Setup your Nutrition profile</h2>');
    expect(source).toContain('aria-label="Height inches"');
    expect(source).toContain("'Weight ounces'");
    expect(source.match(/<MultiValueCombobox/gu)).toHaveLength(3);
    expect(source).toContain('role="switch"');
    expect(source).not.toContain('type="checkbox"');
    expect(source).not.toContain('<h2>Set up helpful Nutrition defaults.</h2>');
  });

  it('requires complete inputs and consent before enabling estimated nutrition targets', () => {
    const result = profileOnboardingSchema.safeParse({
      profile: validSetup.profile,
      nutrition: {
        profileType: 'adult',
        dateOfBirth: '',
        heightCentimeters: null,
        currentWeightKilograms: null,
        referenceSexCategory: null,
        activityLevel: null,
        nutritionGoalType: 'maintain',
        dietaryPreferences: [],
        foodAllergies: [],
        dietaryExclusions: [],
        weightTrackingEnabled: false,
        estimatedTargetsEnabled: true,
        estimatedTargetConsent: false,
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.at(-1))).toEqual(
        expect.arrayContaining([
          'estimatedTargetConsent',
          'dateOfBirth',
          'heightCentimeters',
          'currentWeightKilograms',
          'referenceSexCategory',
          'activityLevel',
        ]),
      );
    }
  });

  it('rejects an unsafe profile color', () => {
    expect(
      setupSchema.safeParse({ ...validSetup, profile: { ...validSetup.profile, color: 'red' } })
        .success,
    ).toBe(false);
  });

  it('accepts bounded app settings and rejects unknown fields', () => {
    expect(
      householdSettingsSchema.safeParse({ kitchenName: 'Sunday table', kitchenIcon: 'table' })
        .success,
    ).toBe(true);
    expect(
      householdSettingsSchema.safeParse({ householdName: 'Sunday table', appName: 'Recipe Box' })
        .success,
    ).toBe(true);
    expect(
      householdSettingsSchema.safeParse({
        householdName: 'Sunday table',
        appName: 'Recipe Box',
        admin: true,
      }).success,
    ).toBe(false);
    expect(
      householdSettingsSchema.safeParse({ householdName: 'Sunday table', appName: 'x'.repeat(81) })
        .success,
    ).toBe(false);
  });
});
