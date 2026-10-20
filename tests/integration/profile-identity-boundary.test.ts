import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseForTests } from '@/lib/db/client';
import { completeSetup, getProfile, updateProfile } from '@/lib/services/household-service';
import { defaultProfileInput, profileIdentityUpdateSchema } from '@/lib/domain/setup';
import { readKitchenContext, updateKitchenContext } from '@/lib/services/kitchen-context-service';
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/profile-identity-boundary');
  resetDatabaseForTests();
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
describe('identity-only persistence', () => {
  it('a name-only household save cannot overwrite newer personal units, region or cooking context', () => {
    const state = completeSetup({
      kitchenName: 'Fixture kitchen',
      kitchenIcon: 'table',
      profile: {
        ...defaultProfileInput,
        displayName: 'Avery',
        avatarUrl: 'https://example.test/avatar.png',
      },
    });
    const id = state.profiles[0]!.id;
    updateProfile(id, {
      ...defaultProfileInput,
      displayName: 'Avery',
      avatarUrl: undefined,
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'fr-FR',
      timezone: 'Europe/Paris',
      mainGoals: 'Freshly saved private context',
    });
    const updated = updateProfile(
      id,
      profileIdentityUpdateSchema.parse({
        scope: 'identity',
        displayName: 'Avery renamed',
        color: '#637A45',
      }),
    );
    expect(updated).toMatchObject({
      displayName: 'Avery renamed',
      units: 'metric',
      temperatureUnit: 'C',
      locale: 'fr-FR',
      timezone: 'Europe/Paris',
      mainGoals: 'Freshly saved private context',
      avatarUrl: 'https://example.test/avatar.png',
    });
    expect(
      profileIdentityUpdateSchema.safeParse({
        scope: 'identity',
        displayName: 'Avery',
        color: '#637A45',
        timezone: 'UTC',
      }).success,
    ).toBe(false);
  });
  it('updating kitchen interview preserves the avatar omitted from that operation', () => {
    const state = completeSetup({
      kitchenName: 'Fixture kitchen',
      kitchenIcon: 'table',
      profile: {
        ...defaultProfileInput,
        displayName: 'Avery',
        avatarUrl: 'https://example.test/avatar.png',
      },
    });
    const id = state.profiles[0]!.id;
    updateKitchenContext(id, {
      expectedRevision: readKitchenContext(id).revision,
      interview: {
        taste: 'Savoury',
        snacks: '',
        desserts: '',
        routine: '',
        favorites: '',
        avoid: '',
      },
    });
    expect(getProfile(id)?.avatarUrl).toBe('https://example.test/avatar.png');
  });
  it('adaptive interview patches preserve omitted answers and require explicit clearing', () => {
    const id = completeSetup({
      kitchenName: 'Fixture kitchen',
      profile: { ...defaultProfileInput, displayName: 'Avery' },
    }).profiles[0]!.id;
    const saved = updateKitchenContext(id, {
      expectedRevision: readKitchenContext(id).revision,
      interview: {
        taste: 'Savoury',
        snacks: 'Fruit',
        desserts: '',
        routine: 'Twenty minute dinners',
        favorites: 'Soup',
        avoid: '',
      },
    });
    const changed = updateKitchenContext(id, {
      expectedRevision: saved.revision,
      interviewPatch: { taste: 'Sweet and savoury' },
    });
    expect(changed.interview).toMatchObject({
      taste: 'Sweet and savoury',
      snacks: 'Fruit',
      routine: 'Twenty minute dinners',
      favorites: 'Soup',
    });
    expect(() =>
      updateKitchenContext(id, {
        expectedRevision: changed.revision,
        interviewPatch: { snacks: '' },
      }),
    ).toThrow(/clearFields/);
    const cleared = updateKitchenContext(id, {
      expectedRevision: changed.revision,
      interviewPatch: {},
      clearFields: ['snacks'],
    });
    expect(cleared.interview).toMatchObject({ snacks: '', favorites: 'Soup' });
    expect(() =>
      updateKitchenContext(id, {
        expectedRevision: saved.revision,
        interviewPatch: { taste: 'Stale' },
      }),
    ).toThrow(/changed/);
  });
});
