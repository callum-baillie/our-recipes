import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseForTests } from '@/lib/db/client';
import {
  completeSetup,
  getProfile,
  readPersonalProfile,
  updatePersonalProfile,
  updateProfile,
  personalProfileRevision,
} from '@/lib/services/household-service';
import { defaultProfileInput, personalProfileValues } from '@/lib/domain/setup';
import { readKitchenContext, updateKitchenContext } from '@/lib/services/kitchen-context-service';
beforeEach(() => {
  vi.stubEnv('DATABASE_URL', ':memory:');
  vi.stubEnv('DATA_DIR', '.test-data/personal-profile-scoped');
  resetDatabaseForTests();
});
afterEach(() => {
  resetDatabaseForTests();
  vi.unstubAllEnvs();
});
function fixture() {
  return completeSetup({
    kitchenName: 'Scoped fixture',
    profile: { ...defaultProfileInput, displayName: 'Avery' },
  }).profiles[0]!.id;
}
describe('scoped personal profile transaction', () => {
  it('a stale name draft preserves an interview saved after the draft was opened', () => {
    const id = fixture();
    const base = readPersonalProfile(id);
    updateKitchenContext(id, {
      expectedRevision: readKitchenContext(id).revision,
      interviewPatch: { taste: 'Savoury soups' },
    });
    const changed = updatePersonalProfile(id, {
      expectedRevision: base.revision,
      settings: { ...personalProfileValues(base.profile), displayName: 'Avery renamed' },
    });
    expect(changed.profile.goalContext.kitchenInterview?.taste).toBe('Savoury soups');
    expect(changed.profile.displayName).toBe('Avery renamed');
    expect(readKitchenContext(id).interview?.taste).toBe('Savoury soups');
  });
  it('overlapping or newly concurrent general preferences reject rather than overwrite, while omitted interviews cannot be injected', () => {
    const id = fixture();
    const base = readPersonalProfile(id);
    updatePersonalProfile(id, {
      expectedRevision: base.revision,
      settings: { ...personalProfileValues(base.profile), locale: 'fr-FR' },
    });
    const stale = {
      expectedRevision: base.revision,
      settings: { ...personalProfileValues(base.profile), displayName: 'Stale name' },
    };
    expect(() => updatePersonalProfile(id, stale)).toThrow(/changed elsewhere/);
    expect(getProfile(id)?.locale).toBe('fr-FR');
    const loaded = readPersonalProfile(id);
    updateProfile(id, {
      scope: 'identity',
      displayName: 'Concurrent household name',
      color: '#637A45',
    });
    expect(() =>
      updatePersonalProfile(id, { ...stale, expectedRevision: loaded.revision }),
    ).toThrow(/changed elsewhere/);
    expect(() =>
      updatePersonalProfile(id, {
        expectedRevision: readPersonalProfile(id).revision,
        settings: {
          ...personalProfileValues(base.profile),
          goalContext: { ...base.profile.goalContext, kitchenInterview: { taste: 'Injected' } },
        },
      }),
    ).toThrow();
    expect(getProfile(id)?.displayName).toBe('Concurrent household name');
  });
  it('binds revisions to the intended profile even when two people have identical settings', () => {
    const base = readPersonalProfile(fixture());
    expect(personalProfileRevision({ ...base.profile, id: 'another-profile' })).not.toBe(
      base.revision,
    );
  });
});
