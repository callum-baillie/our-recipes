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
});
