type AuthFailure = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  responseText?: unknown;
  status?: unknown;
  statusText?: unknown;
};

const knownMessages: Record<string, string> = {
  CREDENTIAL_ACCOUNT_NOT_FOUND: 'This account does not have a passphrase sign-in method.',
  EMAIL_NOT_VERIFIED: 'Verify this email address in Bòrd before signing in on this device.',
  EMAIL_PASSWORD_DISABLED: 'Passphrase sign-in is disabled on this Bòrd instance.',
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_EMAIL_OR_PASSWORD: 'The email or passphrase is incorrect.',
  INVALID_ORIGIN:
    'This Bòrd instance has not allowed mobile sign-in. Update its trusted origins and restart the server.',
  RATE_LIMITED: 'Too many sign-in attempts. Wait a minute, then try again.',
  TOO_MANY_REQUESTS: 'Too many sign-in attempts. Wait a minute, then try again.',
  USER_BANNED: 'This account is not permitted to sign in.',
};

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nestedFailure(value: unknown): AuthFailure | null {
  return value && typeof value === 'object' ? (value as AuthFailure) : null;
}

function normalizedCode(value: unknown) {
  return (
    text(value)
      ?.toUpperCase()
      .replaceAll(/[\s-]+/gu, '_') ?? null
  );
}

function instanceHost(instanceUrl?: string | null) {
  if (!instanceUrl) return 'the Bòrd instance';
  try {
    return new URL(instanceUrl).host;
  } catch {
    return 'the Bòrd instance';
  }
}

/**
 * Better Fetch preserves JSON errors, but React Native responses can have an
 * empty status text and older Bòrd releases used a nested `error` envelope.
 * Normalize all of those shapes without exposing response bodies or secrets.
 */
export function authFailureMessage(value: unknown, instanceUrl?: string | null) {
  const failure = nestedFailure(value) ?? {};
  const nested = nestedFailure(failure.error);
  const code = normalizedCode(failure.code) ?? normalizedCode(nested?.code);
  const status =
    typeof failure.status === 'number'
      ? failure.status
      : typeof nested?.status === 'number'
        ? nested.status
        : null;
  const message = text(failure.message) ?? text(nested?.message);
  const statusText = text(failure.statusText) ?? text(nested?.statusText);

  if (code && knownMessages[code]) return knownMessages[code];

  const transportText = [message, statusText, text(failure.responseText)]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  if (/fetch|network request|network error|failed to connect|timed out/iu.test(transportText)) {
    return `Could not reach ${instanceHost(instanceUrl)}. Confirm the server is running and this phone can open that address.`;
  }

  if (status === 401) return knownMessages.INVALID_EMAIL_OR_PASSWORD;
  if (status === 404) {
    return 'This Bòrd server does not expose mobile sign-in. Update and restart the web app, then reconnect this instance.';
  }
  if (status === 429) return knownMessages.TOO_MANY_REQUESTS;
  if (status !== null && status >= 500) {
    return `The Bòrd server could not complete sign-in (HTTP ${status}). Check its server log and try again.`;
  }

  if (message && !/^fetch related error/iu.test(message)) return message;
  if (code) return `Sign-in failed (${code}).`;
  if (status !== null) return `Sign-in failed (HTTP ${status}).`;
  return 'Sign-in could not be completed. Check the instance address and try again.';
}
