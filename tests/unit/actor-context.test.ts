import { describe, expect, it } from 'vitest';

import { createSignedProfileValue, parseSignedProfileValue } from '@/lib/actor-context';

describe('active profile cookie', () => {
  it('accepts a correctly signed profile id', () => {
    const value = createSignedProfileValue('profile-123');
    expect(parseSignedProfileValue(value)).toBe('profile-123');
  });

  it('rejects a tampered value', () => {
    const value = createSignedProfileValue('profile-123');
    expect(parseSignedProfileValue(`${value}tampered`)).toBeNull();
  });

  it('rejects multibyte signatures without throwing on malformed cookies', () => {
    for (const sessionId of [undefined, 'session-123']) {
      const value = createSignedProfileValue('profile-123', sessionId);
      const separator = value.lastIndexOf('.');
      const malformed = value.slice(0, separator + 1) + 'é'.repeat(value.length - separator - 1);
      expect(() => parseSignedProfileValue(malformed)).not.toThrow();
      expect(parseSignedProfileValue(malformed)).toBeNull();
    }
  });
});
