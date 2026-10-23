import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  completeSetupWithResult: vi.fn(),
  prepareProfileEnrollment: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@/lib/services/auth-service', () => ({
  prepareProfileEnrollment: mocks.prepareProfileEnrollment,
}));
vi.mock('@/lib/services/household-service', () => ({
  completeSetupWithResult: mocks.completeSetupWithResult,
  ConflictError: class ConflictError extends Error {},
}));
vi.mock('@/lib/config', () => ({
  getRuntimeConfig: () => ({
    appOrigin: 'http://localhost:3000',
    trustedOrigins: [],
    auth: { requireEmailVerification: false },
  }),
}));
vi.mock('@/lib/auth/server', () => ({ auth: { api: {} } }));

import { POST } from '@/app/api/v1/setup/route';

describe('initial setup route', () => {
  beforeEach(() => {
    mocks.completeSetupWithResult.mockReset();
    mocks.prepareProfileEnrollment.mockReset();
    mocks.cookies.mockReset();
    mocks.cookies.mockResolvedValue({ get: () => ({ value: 'scale-onboarding-binding' }) });
    mocks.prepareProfileEnrollment.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.completeSetupWithResult.mockReturnValue({
      state: { household: { id: 'household-1' }, profiles: [{ id: 'profile-1' }] },
      firstRecipeId: null,
      recoveryCodes: [],
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('passes the staged scale cookie binding through to setup persistence', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/v1/setup', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          kitchenName: 'Home kitchen',
          kitchenIcon: 'table',
          profile: {
            displayName: 'Maya',
            color: '#637A45',
            avatarUrl: '',
            units: 'metric',
            temperatureUnit: 'C',
            locale: 'en-US',
            timezone: 'America/Chicago',
          },
          credentials: {
            email: 'maya@example.test',
            passphrase: 'correct horse battery table',
          },
          nutrition: { vesyncConnectionId: '9e5097a1-0d59-470f-9390-0939d6bade11' },
          additionalProfiles: [],
          firstRecipeChoice: 'manual',
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.completeSetupWithResult).toHaveBeenCalledTimes(1);
    expect(mocks.completeSetupWithResult.mock.calls[0]?.[2]).toBe('scale-onboarding-binding');
  });
});
