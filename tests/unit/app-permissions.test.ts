import { describe, expect, it } from 'vitest';

import {
  appRoleCan,
  authorizeAppRequest,
  effectiveAppRole,
  isRoleElevation,
} from '@/lib/domain/permissions';

const childProfileId = '11111111-1111-4111-8111-111111111111';
const otherProfileId = '22222222-2222-4222-8222-222222222222';

describe('household access roles', () => {
  it('gives Admin full access and keeps household settings away from Parent and Child', () => {
    expect(appRoleCan('admin', 'settings.manage')).toBe(true);
    expect(appRoleCan('parent', 'settings.manage')).toBe(false);
    expect(appRoleCan('child', 'settings.manage')).toBe(false);
    expect(appRoleCan('parent', 'shared.delete')).toBe(true);
    expect(appRoleCan('child', 'shared.delete')).toBe(false);
  });

  it('uses the least privileged account/profile role and requires reauthentication upward', () => {
    expect(effectiveAppRole('admin', 'child')).toBe('child');
    expect(effectiveAppRole('parent', 'admin')).toBe('parent');
    expect(isRoleElevation('child', 'parent')).toBe(true);
    expect(isRoleElevation('admin', 'parent')).toBe(false);
  });

  it('allows a Child to mutate only their own Nutrition entries and never delete', () => {
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: childProfileId,
        pathname: `/api/v1/nutrition/profiles/${childProfileId}/intake/manual`,
        method: 'POST',
      }),
    ).toEqual({ allowed: true });
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: childProfileId,
        pathname: `/api/v1/nutrition/profiles/${otherProfileId}/intake`,
        method: 'GET',
      }).allowed,
    ).toBe(false);
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: childProfileId,
        pathname: `/api/v1/nutrition/profiles/${childProfileId}/intake/${otherProfileId}/delete`,
        method: 'POST',
      }).allowed,
    ).toBe(false);
  });

  it('keeps shared mutations and admin surfaces unavailable to a Child', () => {
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: childProfileId,
        pathname: '/api/v1/recipes',
        method: 'POST',
      }).allowed,
    ).toBe(false);
    expect(
      authorizeAppRequest({
        role: 'child',
        profileId: childProfileId,
        pathname: '/settings/api',
        method: 'GET',
      }).allowed,
    ).toBe(false);
  });
});
