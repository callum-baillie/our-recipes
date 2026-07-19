import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { describe, expect, it, vi } from 'vitest';

const workerSource = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
const appVersion = (
  JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }
).version;

type WorkerListener = (event: {
  data?: unknown;
  waitUntil: (work: Promise<unknown>) => void;
}) => void;

function loadWorker({ cacheKeys, isUpdate }: { cacheKeys: string[]; isUpdate: boolean }) {
  const listeners = new Map<string, WorkerListener>();
  const deletedCaches: string[] = [];
  const messages: unknown[] = [];
  const navigations: string[] = [];
  const cache = {
    add: vi.fn(async () => undefined),
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
  };
  const client = {
    url: 'https://recipes.tower/recipes?sort=recent',
    postMessage: vi.fn((message: unknown) => messages.push(message)),
    navigate: vi.fn(async (url: string) => {
      navigations.push(url);
      return client;
    }),
  };
  const clients = {
    claim: vi.fn(async () => undefined),
    matchAll: vi.fn(async () => [client]),
  };
  const caches = {
    delete: vi.fn(async (key: string) => {
      deletedCaches.push(key);
      return true;
    }),
    keys: vi.fn(async () => cacheKeys),
    match: vi.fn(async () => undefined),
    open: vi.fn(async () => cache),
  };
  const self = {
    addEventListener: vi.fn((type: string, listener: WorkerListener) => {
      listeners.set(type, listener);
    }),
    clients,
    location: { origin: 'https://recipes.tower' },
    registration: { active: isUpdate ? {} : null },
    skipWaiting: vi.fn(async () => undefined),
  };

  vm.runInNewContext(workerSource, {
    Request,
    URL,
    caches,
    fetch: vi.fn(),
    self,
  });

  async function dispatch(type: string, data?: unknown) {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`Missing ${type} listener.`);
    let pending: Promise<unknown> = Promise.resolve();
    listener({
      data,
      waitUntil(work) {
        pending = Promise.resolve(work);
      },
    });
    await pending;
  }

  return {
    caches,
    clients,
    deletedCaches,
    dispatch,
    messages,
    navigations,
    self,
  };
}

describe('PWA service worker updates', () => {
  it('keeps its release version synchronized with package metadata', () => {
    expect(workerSource).toContain(`const APP_VERSION = '${appVersion}';`);
    expect(workerSource).toContain("const CACHE_PREFIX = 'our-recipes-read-';");
  });

  it('deletes obsolete app caches and refreshes controlled clients during an update', async () => {
    const worker = loadWorker({
      cacheKeys: ['our-recipes-read-v2', `our-recipes-read-${appVersion}`, 'another-app-cache'],
      isUpdate: true,
    });

    await worker.dispatch('activate');

    expect(worker.deletedCaches).toEqual(['our-recipes-read-v2']);
    expect(worker.clients.claim).toHaveBeenCalledOnce();
    expect(worker.messages).toEqual([{ type: 'OUR_RECIPES_UPDATED', version: appVersion }]);
    expect(worker.navigations).toHaveLength(1);
    expect(new URL(worker.navigations[0]!).searchParams.get('__our_recipes_updated')).toBe(
      appVersion,
    );
  });

  it('claims clients without reloading them on a true first install', async () => {
    const worker = loadWorker({
      cacheKeys: [`our-recipes-read-${appVersion}`, 'another-app-cache'],
      isUpdate: false,
    });

    await worker.dispatch('activate');

    expect(worker.deletedCaches).toEqual([]);
    expect(worker.clients.claim).toHaveBeenCalledOnce();
    expect(worker.clients.matchAll).not.toHaveBeenCalled();
    expect(worker.navigations).toEqual([]);
  });

  it('accepts an explicit skip-waiting request', async () => {
    const worker = loadWorker({ cacheKeys: [], isUpdate: true });

    await worker.dispatch('message', { type: 'SKIP_WAITING' });

    expect(worker.self.skipWaiting).toHaveBeenCalledOnce();
  });
});
