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
