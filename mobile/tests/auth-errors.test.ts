import { describe, expect, it } from 'vitest';
import { authFailureMessage } from '@/auth/auth-errors';

describe('native authentication errors', () => {
  it('turns Better Auth credential failures into an actionable message', () => {
    expect(
      authFailureMessage({
        status: 401,
        code: 'INVALID_EMAIL_OR_PASSWORD',
        message: undefined,
      }),
    ).toBe('The email or passphrase is incorrect.');
  });

  it('supports the nested error envelope used by older Bòrd instances', () => {
    expect(
      authFailureMessage({
        error: { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
        status: 403,
      }),
    ).toBe('Verify this email address in Bòrd before signing in on this device.');
  });

  it('distinguishes an unreachable instance from rejected credentials', () => {
    expect(
      authFailureMessage(new TypeError('Network request failed'), 'http://192.168.1.20:3000'),
    ).toBe(
      'Could not reach 192.168.1.20:3000. Confirm the server is running and this phone can open that address.',
    );
  });

  it('explains when an instance predates mobile authentication support', () => {
    expect(authFailureMessage({ status: 404 })).toMatch(/update and restart the web app/iu);
  });
});

import { profileSwitchRequest, sessionExpiredResponse } from '../src/auth/auth-errors';

it('uses destination passwords without retaining the obsolete profile PIN contract', () => {
  const command = profileSwitchRequest('person-id', ' not-a-PIN ');
  expect(command.path).toBe('/api/v1/profiles/person-id/active');
  expect(command.init.method).toBe('PATCH');
  expect(JSON.parse(command.init.body)).toEqual({ password: ' not-a-PIN ' });
  expect(() => profileSwitchRequest('person-id', '')).toThrow();
  expect(() => profileSwitchRequest('person-id', 'a'.repeat(129))).toThrow();
});
it('keeps the account session after a rejected destination password, but not after real expiry', () => {
  expect(
    sessionExpiredResponse(401, 'invalid_profile_password', '/api/v1/profiles/person-id/active'),
  ).toBe(false);
  expect(
    sessionExpiredResponse(401, 'authentication_required', '/api/v1/profiles/person-id/active'),
  ).toBe(true);
  expect(sessionExpiredResponse(401, undefined, '/api/v1/recipes')).toBe(true);
  expect(
    sessionExpiredResponse(403, 'reauthentication_required', '/api/v1/profiles/person-id/active'),
  ).toBe(false);
});
