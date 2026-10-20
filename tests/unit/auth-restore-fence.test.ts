import { afterEach, describe, expect, it, vi } from 'vitest';

import { withAuthenticationRequest, withAuthenticationRestore } from '@/lib/auth/restore-fence';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('authentication restore fence', () => {
  it('drains admitted authentication before swapping and holds new authentication across module instances', async () => {
    const oldAuthentication = deferred();
    const events: string[] = [];
    let credentialValid = true;
    const admitted = withAuthenticationRequest(async () => {
      events.push('old authentication started');
      await oldAuthentication.promise;
      events.push('old authentication finished');
      expect(credentialValid).toBe(true);
    });
    vi.resetModules();
    const otherBundle = await import('@/lib/auth/restore-fence');
    const restoring = otherBundle.withAuthenticationRestore(() => {
      events.push('restore');
      credentialValid = false;
    });
    const queued = withAuthenticationRequest(async () => {
      events.push('new authentication');
      return credentialValid;
    });
    await Promise.resolve();
    expect(events).toEqual(['old authentication started']);
    oldAuthentication.resolve();
    await admitted;
    await restoring;
    expect(await queued).toBe(false);
    expect(events).toEqual([
      'old authentication started',
      'old authentication finished',
      'restore',
      'new authentication',
    ]);
  });

  it('releases queued authentication when the synchronous restore fails', async () => {
    const failure = new Error('Controlled swap failure');
    const restoring = withAuthenticationRestore(() => {
      throw failure;
    });
    const queued = withAuthenticationRequest(async () => 'authenticated');
    await expect(restoring).rejects.toBe(failure);
    expect(await queued).toBe('authenticated');
  });

  it('releases the restore when an admitted authentication request fails', async () => {
    const release = deferred();
    const failure = new Error('Controlled authentication failure');
    const admitted = withAuthenticationRequest(async () => {
      await release.promise;
      throw failure;
    });
    const restoring = withAuthenticationRestore(() => 'restored');
    const rejected = expect(admitted).rejects.toBe(failure);
    release.resolve();
    await rejected;
    expect(await restoring).toBe('restored');
  });

  it('abandons the restore after a bounded drain and admits queued authentication', async () => {
    vi.useFakeTimers();
    const release = deferred();
    const admitted = withAuthenticationRequest(async () => release.promise);
    const swap = vi.fn();
    const restoring = withAuthenticationRestore(swap);
    const rejected = expect(restoring).rejects.toThrow('within 30 seconds');
    const authenticate = vi.fn(async () => 'authenticated');
    const queued = withAuthenticationRequest(authenticate);
    try {
      await vi.advanceTimersByTimeAsync(29_999);
      expect(swap).not.toHaveBeenCalled();
      expect(authenticate).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(swap).not.toHaveBeenCalled();
      expect(await queued).toBe('authenticated');
    } finally {
      release.resolve();
      await admitted;
    }
    expect(await withAuthenticationRestore(() => 'retry')).toBe('retry');
  });

  it('lets nested authentication finish while a restore is draining', async () => {
    const release = deferred();
    const events: string[] = [];
    const admitted = withAuthenticationRequest(async () => {
      await release.promise;
      await withAuthenticationRequest(async () => {
        events.push('nested authentication');
      });
    });
    const restoring = withAuthenticationRestore(() => events.push('restore'));
    release.resolve();
    await admitted;
    await restoring;
    expect(events).toEqual(['nested authentication', 'restore']);
  });

  it('rejects a restore invoked inside authentication instead of waiting on itself', async () => {
    await withAuthenticationRequest(async () => {
      await expect(withAuthenticationRestore(() => undefined)).rejects.toThrow(
        'inside an active authentication request',
      );
    });
    expect(await withAuthenticationRestore(() => 'restored')).toBe('restored');
  });
});
