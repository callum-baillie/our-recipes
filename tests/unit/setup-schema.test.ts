import { describe, expect, it } from 'vitest';

import { setupSchema } from '@/lib/domain/setup';

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
});
