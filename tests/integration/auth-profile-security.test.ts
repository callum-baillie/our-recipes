import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabaseForTests } from '@/lib/db/client';
import {
  authenticationEnrollmentStatus,
  isAuthenticationConfigured,
  prepareProfileEnrollment,
  verifyProfilePin,
} from '@/lib/services/auth-service';
import { completeSetupWithResult } from '@/lib/services/household-service';

describe('profile authentication enrollment', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', ':memory:');
    vi.stubEnv('DATA_DIR', './.test-data/auth-profile-security');
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-better-auth-secret-with-at-least-32-characters');
    vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-with-at-least-32-characters');
    resetDatabaseForTests();
  });

  afterEach(() => {
    resetDatabaseForTests();
    vi.unstubAllEnvs();
  });

  it('atomically links a profile account, recovery codes, and a PIN', async () => {
    const enrollment = await prepareProfileEnrollment(
      'Maya',
      {
        email: 'maya@example.com',
        passphrase: 'a long household passphrase',
        pin: '739204',
      },
      'admin',
    );
    const result = completeSetupWithResult(
      {
        kitchenName: 'The Pantry Table',
        kitchenIcon: 'table',
        profile: {
          displayName: 'Maya',
          color: '#637A45',
          avatarUrl: '',
          units: 'metric',
          temperatureUnit: 'C',
          locale: 'en-GB',
          timezone: 'Europe/London',
        },
      },
      [enrollment],
    );
    const profileId = result.state.profiles[0]!.id;

    expect(isAuthenticationConfigured()).toBe(true);
    expect(authenticationEnrollmentStatus()).toMatchObject({
      configured: true,
      profiles: [
        {
          id: profileId,
          enrolled: true,
          email: 'maya@example.com',
          isAdmin: true,
        },
      ],
    });
    expect(result.recoveryCodes[0]).toMatchObject({
      profileId,
      codes: expect.arrayContaining([expect.stringMatching(/^BORD-/u)]),
    });
    await expect(
      verifyProfilePin({
        sessionId: 'session-a',
        userId: enrollment.user.id,
        profileId,
        pin: '739204',
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('locks repeated PIN failures for the target profile and session', async () => {
    const enrollment = await prepareProfileEnrollment(
      'Maya',
      {
        email: 'maya@example.com',
        passphrase: 'a long household passphrase',
        pin: '739204',
      },
      'admin',
    );
    const result = completeSetupWithResult(
      {
        kitchenName: 'The Pantry Table',
        kitchenIcon: 'table',
        profile: {
          displayName: 'Maya',
          color: '#637A45',
          avatarUrl: '',
          units: 'metric',
          temperatureUnit: 'C',
          locale: 'en-GB',
          timezone: 'Europe/London',
        },
      },
      [enrollment],
    );
    const profileId = result.state.profiles[0]!.id;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        verifyProfilePin({
          sessionId: 'session-a',
          userId: enrollment.user.id,
          profileId,
          pin: '840315',
        }),
      ).resolves.toEqual({ ok: false });
    }
    const locked = await verifyProfilePin({
      sessionId: 'session-a',
      userId: enrollment.user.id,
      profileId,
      pin: '840315',
    });
    expect(locked.ok).toBe(false);
    expect(locked).toHaveProperty('retryAfterSeconds', 900);
    await expect(
      verifyProfilePin({
        sessionId: 'session-a',
        userId: enrollment.user.id,
        profileId,
        pin: '739204',
      }),
    ).resolves.toMatchObject({ ok: false, retryAfterSeconds: expect.any(Number) });
  });
});
