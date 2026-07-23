import { afterEach, describe, expect, it, vi } from 'vitest';

import { createClientUuid } from '@/lib/client/client-uuid';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('client UUID fallback', () => {
  it('returns an RFC 4122 version 4 UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0x5a);
        return bytes;
      },
    });

    expect(createClientUuid()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
