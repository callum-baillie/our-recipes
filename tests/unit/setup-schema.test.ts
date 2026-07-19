import { describe, expect, it } from 'vitest';

import { householdSettingsSchema, setupSchema } from '@/lib/domain/setup';

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
  it('accepts a complete household and first profile', () => {
    expect(setupSchema.safeParse(validSetup).success).toBe(true);
  });

  it('rejects an unsafe profile color', () => {
    expect(
      setupSchema.safeParse({ ...validSetup, profile: { ...validSetup.profile, color: 'red' } })
        .success,
    ).toBe(false);
  });

  it('accepts bounded app settings and rejects unknown fields', () => {
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
