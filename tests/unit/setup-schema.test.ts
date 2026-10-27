// @vitest-environment jsdom
import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { defaultProfileGoalContext } from '@/lib/domain/profile-goals';
import { ProfileEditor, type Profile } from '@/components/profile-settings';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/toast-provider', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
afterEach(cleanup);

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
    const flow = readFileSync('src/components/onboarding-chat/flow.ts', 'utf8');
    const chat = readFileSync('src/components/onboarding-chat/onboarding-chat.tsx', 'utf8');
    const setupSource = readFileSync('src/components/setup-wizard.tsx', 'utf8');
    expect(flow).toContain("label: 'Kitchen name'");
    expect(chat).toContain('kitchenName: state.kitchenName');
    expect(chat).toContain('kitchenIcon: state.brandIcon');
    expect(flow).not.toContain('App name');
    expect(flow).not.toContain('Household name');
    expect(setupSource).toContain('<BordLockup />');
    expect(setupSource).toContain('Scottish Gaelic');
    expect(flow).toContain('Bòrd is Scottish Gaelic for “table”');
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

  it('accepts each first-recipe onboarding path and defaults older payloads safely', () => {
    for (const firstRecipeChoice of ['example', 'ai', 'import', 'manual'] as const) {
      expect(
        setupSchema.safeParse({
          kitchenName: 'The Brooks kitchen',
          kitchenIcon: 'table',
          profile: validSetup.profile,
          firstRecipeChoice,
        }).success,
      ).toBe(true);
    }
    const parsed = setupSchema.safeParse({
      kitchenName: 'The Brooks kitchen',
      kitchenIcon: 'table',
      profile: validSetup.profile,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.firstRecipeChoice).toBe('manual');
  });

  it('accepts additional onboarded profiles and caps the setup roster', () => {
    const additionalProfile = {
      profile: { ...validSetup.profile, displayName: 'Avery' },
      nutrition: { profileType: 'dependent' as const },
      role: 'child' as const,
    };
    expect(
      setupSchema.safeParse({ ...validSetup, additionalProfiles: [additionalProfile] }).success,
    ).toBe(true);
    expect(
      setupSchema.safeParse({
        ...validSetup,
        additionalProfiles: Array.from({ length: 12 }, (_, index) => ({
          ...additionalProfile,
          profile: { ...additionalProfile.profile, displayName: `Child ${index + 1}` },
        })),
      }).success,
    ).toBe(false);
  });

  it('uses US onboarding defaults and derives hidden regional settings from the browser', () => {
    const source = readFileSync('src/components/onboarding-chat/onboarding-chat.tsx', 'utf8');
    const flow = readFileSync('src/components/onboarding-chat/flow.ts', 'utf8');
    expect(defaultProfileInput).toMatchObject({ units: 'imperial', temperatureUnit: 'F' });
    expect(source).toContain('navigator.language');
    expect(source).toContain('Intl.DateTimeFormat().resolvedOptions().timeZone');
    expect(flow).not.toContain('Avatar URL');
    expect(flow).not.toContain("label: 'Locale'");
    expect(flow).not.toContain("label: 'Time zone'");
  });

  it('preserves valid regional identifiers through personal profile editing', async () => {
    const profile: Profile = {
      ...defaultProfileInput,
      mainGoals: '',
      goalContext: defaultProfileGoalContext,
      id: 'person-1',
      displayName: 'Avery',
      avatarUrl: null,
      archivedAt: null,
      role: 'parent',
      isLastAdmin: false,
      locale: 'en-NZ',
      timezone: 'Pacific/Auckland',
    };
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      createElement(ProfileEditor, {
        profile,
        active: true,
        personal: true,
        onSave: save,
        onArchive: vi.fn(),
        onRoleChange: vi.fn(),
      }),
    );
    expect((screen.getByLabelText(/^Regional format/) as HTMLInputElement).value).toBe('en-NZ');
    expect((screen.getByLabelText(/^Time zone/) as HTMLInputElement).value).toBe(
      'Pacific/Auckland',
    );
    fireEvent.change(screen.getByLabelText(/^Display name/), {
      target: { value: 'Avery renamed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        profile,
        expect.objectContaining({
          displayName: 'Avery renamed',
          locale: 'en-NZ',
          timezone: 'Pacific/Auckland',
        }),
      ),
    );
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

  it('runs onboarding as a single chat with guided nutrition and separate secret handling', () => {
    const chat = readFileSync('src/components/onboarding-chat/onboarding-chat.tsx', 'utf8');
    const flow = readFileSync('src/components/onboarding-chat/flow.ts', 'utf8');
    const composer = readFileSync('src/components/onboarding-chat/composer.tsx', 'utf8');
    expect(chat).toContain('I saved these one-time codes somewhere private.');
    expect(flow).toContain('Connect a smart scale (VeSync)');
    expect(flow).toContain('Enter my details manually');
    expect(flow).toContain('Set up nutrition later');
    expect(composer).toContain('Feet & inches');
    expect(composer).toContain('Centimetres');
    expect(flow.match(/listStep\(/gu)).toHaveLength(3);
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

  it('keeps weight targets aligned with the selected direction', () => {
    const lossTarget = profileOnboardingSchema.safeParse({
      profile: validSetup.profile,
      nutrition: {
        profileType: 'adult',
        dateOfBirth: '',
        heightCentimeters: null,
        currentWeightKilograms: 80,
        referenceSexCategory: null,
        activityLevel: null,
        nutritionGoalType: 'loss',
        targetWeightKilograms: 75,
        targetDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
        dietaryPreferences: [],
        foodAllergies: [],
        dietaryExclusions: [],
        weightTrackingEnabled: true,
        estimatedTargetsEnabled: false,
        estimatedTargetConsent: false,
      },
    });
    expect(lossTarget.success).toBe(true);

    const invalidGainTarget = profileOnboardingSchema.safeParse({
      profile: validSetup.profile,
      nutrition: {
        profileType: 'adult',
        dateOfBirth: '',
        heightCentimeters: null,
        currentWeightKilograms: 80,
        referenceSexCategory: null,
        activityLevel: null,
        nutritionGoalType: 'gain',
        targetWeightKilograms: 75,
        targetDate: new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10),
        dietaryPreferences: [],
        foodAllergies: [],
        dietaryExclusions: [],
        weightTrackingEnabled: true,
        estimatedTargetsEnabled: false,
        estimatedTargetConsent: false,
      },
    });
    expect(invalidGainTarget.success).toBe(false);
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
