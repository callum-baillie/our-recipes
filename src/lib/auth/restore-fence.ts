import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

const AUTHENTICATION_DRAIN_TIMEOUT_MS = 30_000;

type RequestLease = { active: boolean };
type AuthenticationFence = {
  activeRequests: number;
  pendingRestores: number;
  restoreTail: Promise<void>;
  requestWaiters: Set<() => void>;
  drainWaiters: Set<() => void>;
  requestContext: AsyncLocalStorage<RequestLease>;
};

// Next server bundles can instantiate this module separately in one process.
// Share both admission state and nesting context across those instances.
function authenticationFence(): AuthenticationFence {
  const state = globalThis as typeof globalThis & {
    __bordAuthenticationRestoreFence?: AuthenticationFence;
  };
  return (state.__bordAuthenticationRestoreFence ??= {
    activeRequests: 0,
    pendingRestores: 0,
    restoreTail: Promise.resolve(),
    requestWaiters: new Set(),
    drainWaiters: new Set(),
    requestContext: new AsyncLocalStorage<RequestLease>(),
  });
}

export async function withAuthenticationRequest<T>(work: () => Promise<T>): Promise<T> {
  const state = authenticationFence();
  // An admitted operation may call another wrapped auth method while a restore
  // is draining. Let it finish, while still counting its own outstanding work.
  if (!state.requestContext.getStore()?.active) {
    while (state.pendingRestores > 0) {
      await new Promise<void>((resolve) => state.requestWaiters.add(resolve));
    }
  }
  state.activeRequests += 1;
  const lease = { active: true };
  try {
    return await state.requestContext.run(lease, work);
  } finally {
    lease.active = false;
    state.activeRequests -= 1;
    if (state.activeRequests === 0) {
      for (const resolve of state.drainWaiters) resolve();
    }
  }
}

function drainAuthenticationRequests(state: AuthenticationFence): Promise<void> {
  if (state.activeRequests === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const drained = () => {
      clearTimeout(timeout);
      state.drainWaiters.delete(drained);
      resolve();
    };
    const timeout = setTimeout(() => {
      state.drainWaiters.delete(drained);
      reject(
        new Error('Authentication requests did not finish within 30 seconds. Retry restoration.'),
      );
    }, AUTHENTICATION_DRAIN_TIMEOUT_MS);
    state.drainWaiters.add(drained);
  });
}

/** Serialize in-flight auth with a synchronous swap; the durable recovery marker
 * still protects database access during incomplete recovery and after restart. */
export async function withAuthenticationRestore<T>(work: () => T): Promise<T> {
  const state = authenticationFence();
  if (state.requestContext.getStore()?.active) {
    throw new Error('Restore cannot start inside an active authentication request.');
  }
  // Stop new admissions before the first await, including while prior auth drains.
  state.pendingRestores += 1;
  const precedingRestore = state.restoreTail;
  let releaseRestore!: () => void;
  state.restoreTail = new Promise<void>((resolve) => {
    releaseRestore = resolve;
  });
  try {
    await precedingRestore;
    await drainAuthenticationRequests(state);
    return work();
  } finally {
    state.pendingRestores -= 1;
    releaseRestore();
    if (state.pendingRestores === 0) {
      for (const resolve of state.requestWaiters) resolve();
      state.requestWaiters.clear();
    }
  }
}
